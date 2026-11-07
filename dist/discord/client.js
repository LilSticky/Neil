import { ChannelType, Client, Events, GatewayIntentBits, GuildMember, Partials, } from "discord.js";
import { z } from "zod";
import { cameOnline } from "../domain/interview-start.js";
import { editorOf } from "../storage/reaper-editor.js";
import { handleAllianceAutocomplete } from "./alliance-autocomplete.js";
import { createBootyCalls, } from "./booty-call.js";
import { handleBootyAlerts } from "./booty.js";
import { handleTimeZoneAutocomplete } from "./booty-time.js";
import { createInterviews, } from "./interview.js";
import { startDailySync } from "./daily-sync.js";
import { createSweeper, startSweeper } from "./interview-sweeper.js";
import { checkChannels, createOnboardingChannels, } from "./onboarding-channels.js";
import { createDoctorRole } from "./doctor-role.js";
import { listEveryMember } from "./member-listing.js";
import { createNameAndRoles } from "./name-and-roles.js";
import { createOnboardingRole } from "./onboarding-role.js";
import { createPreferenceRoles } from "./preferences.js";
import { createPreferencesAfterLink } from "./preferences-after-link.js";
import { createPreferenceChoices, } from "./preferences-choices.js";
import { PREFERENCES_PREFIX } from "./preferences-texts.js";
import { reportRolePermissions } from "./role-permissions.js";
import { createRankApprovals } from "./rank-approval.js";
import { createUnlink } from "./unlink.js";
import { handleLink, handleLinkButton, handleRank, handleUnlink, PendingLinkConfirmations, } from "./corrections.js";
import { handlePing } from "./ping.js";
import { answer, handleAlliance, handlePlayer, replyPrivately, } from "./lookup.js";
import { handleOverview, handlePick } from "./pick.js";
import { PickSessions } from "./pick-sessions.js";
import { ReaperPages } from "./reaper-pages.js";
import { handleReaperAdd, handleReaperClosest, handleReaperList, handleReaperPage, } from "./reaper.js";
import { handleReaperAutocomplete, handleReaperRemove } from "./reaper-remove.js";
import { reaperMessages } from "./reaper-texts.js";
import { handleQuota } from "./quota.js";
import { handleUsage } from "./usage.js";
import { usageLine } from "./usage-texts.js";
import { commands } from "./commands.js";
import { handleHelp } from "./help.js";
/** The custom id prefix of every pick list component; other component custom ids are not Neil's. */
const PICK_PREFIX = "pick:";
/** The custom id prefix of every Alliance Overview page button. */
const OVERVIEW_PREFIX = "overview:";
/** The custom id prefix of every paged /reaper answer button. */
const REAPER_PREFIX = "reaper:";
/** The custom id prefix of every Booty Call button. */
const BOOTY_PREFIX = "booty:";
/** The custom id prefix of every Onboarding Interview button and modal. */
const INTERVIEW_PREFIX = "interview:";
/** The custom id prefix of every Rank Approval button. */
const RANK_PREFIX = "rank:";
/** The custom id prefix of every Officer Link button. */
const LINK_PREFIX = "link:";
/** A user id picked in a command option: digits only, as every Discord snowflake is. */
const memberIdSchema = z.string().regex(/^\d+$/);
/** A guild member's roles, from the discord.js cache (a GuildMemberRoleManager) or from an API member (a string array). */
const memberSchema = z.union([
    z.object({ roles: z.array(z.string()) }).transform((member) => member.roles),
    z
        .object({ roles: z.object({ cache: z.map(z.string(), z.unknown()) }) })
        .transform((member) => [...member.roles.cache.keys()]),
]);
/** The role IDs of a Member, or none when the member is not in the shape discord.js gives. */
export function memberRoleIds(member) {
    const parsed = memberSchema.safeParse(member);
    return parsed.success ? parsed.data : [];
}
/** Hands a /reaper command to the handler of its subcommand. */
function routeReaper(handlers, interaction, logError) {
    switch (interaction.options.getSubcommand()) {
        case "closest":
            void handlers.reaperClosest(interaction);
            break;
        case "list":
            void handlers.reaperList(interaction);
            break;
        case "add":
            void handlers.reaperAdd(interaction);
            break;
        case "remove":
            void handlers.reaperRemove(interaction);
            break;
        default:
            void answer("/reaper", { logError }, () => replyPrivately(interaction, reaperMessages.unknownSubcommand));
    }
}
/** The status of a presence as Neil reads it, or undefined for no presence or a status Neil does not know. */
const presenceStatusSchema = z
    .enum(["online", "idle", "dnd", "invisible", "offline"])
    .transform((status) => (status === "invisible" ? "offline" : status));
function presenceStatusOf(status) {
    const parsed = presenceStatusSchema.safeParse(status);
    return parsed.success ? parsed.data : undefined;
}
/** A guild member as the Interview needs them. */
function joinedMemberOf(member) {
    return { id: member.id, username: member.user.username, displayName: member.displayName, bot: member.user.bot };
}
/**
 * The Member who came online, read with a single-Member fetch: the presence's own Member can be a stub, so it is not used.
 * Undefined when the user is not on the guild.
 */
async function onlineMemberOf(guild, userId) {
    const member = await fetchMember(guild, userId);
    return member === undefined ? undefined : joinedMemberOf(member);
}
/**
 * The Members Discord reports online, each read with a single-Member fetch; the listing never asks Discord for every
 * Member at once. A Member who is not on the guild any more is skipped. A Member who cannot be read is logged and listed
 * as unreadable, so the startup counts them as failed. Stops before the next Member once `isStopping` says so.
 */
async function onlineMembersOf(guild, logError, isStopping) {
    const userIds = [...guild.presences.cache.values()]
        .filter((presence) => {
        const status = presenceStatusOf(presence.status);
        return status !== undefined && status !== "offline";
    })
        .map((presence) => presence.userId);
    const members = [];
    for (const userId of userIds) {
        if (isStopping())
            break;
        try {
            const member = await fetchMember(guild, userId);
            if (member !== undefined)
                members.push(joinedMemberOf(member));
        }
        catch (error) {
            logError(`Reading the Member ${userId} failed: ${String(error)}`);
            members.push({ id: userId, unreadable: true });
        }
    }
    return members;
}
/** A discord.js client with the Guilds, GuildMembers and GuildPresences intents that routes each event to its handler. */
export function createClient(handlers, options) {
    const logError = options.logError ?? console.error;
    // Partials let a Member who left uncached still be announced: GuildMemberRemove is emitted for them, with their user.
    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences],
        partials: [Partials.GuildMember, Partials.User],
    });
    // Without a listener, an emitted error would crash the process; discord.js reconnects by itself.
    client.on(Events.Error, (error) => {
        logError(`Discord client error: ${error.message}`);
    });
    client.on(Events.GuildMemberAdd, (member) => {
        if (member.guild.id !== options.guildId)
            return;
        void handlers.memberJoined({
            id: member.id,
            username: member.user.username,
            displayName: member.displayName,
            bot: member.user.bot,
        });
    });
    // The member may be partial when they left; the Discord event carries their user, with the username, so it is still there.
    client.on(Events.GuildMemberRemove, (member) => {
        if (member.guild.id !== options.guildId)
            return;
        void handlers.memberLeft({ id: member.id, username: member.user.username });
    });
    // A Member who was offline and now is not comes online; the status itself is not logged or kept (ADR 11).
    client.on(Events.PresenceUpdate, (before, after) => {
        const guild = after.guild;
        if (guild === null || guild.id !== options.guildId)
            return;
        const status = presenceStatusOf(after.status);
        if (status === undefined || !cameOnline(presenceStatusOf(before?.status), status))
            return;
        void onlineMemberOf(guild, after.userId).then((member) => {
            if (member !== undefined)
                void handlers.memberOnline(member);
        }, (error) => {
            logError(`Reading a Member who came online failed: ${String(error)}`);
        });
    });
    client.on(Events.InteractionCreate, (interaction) => {
        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case "ping":
                    void handlers.ping(interaction);
                    break;
                case "player":
                    void handlers.player(interaction);
                    break;
                case "alliance":
                    void handlers.alliance(interaction);
                    break;
                case "quota":
                    void handlers.quota(interaction);
                    break;
                case "usage":
                    void handlers.usage(interaction);
                    break;
                case "help":
                    void handlers.help(interaction);
                    break;
                case "channels":
                    void handlers.channels(interaction);
                    break;
                case "interview":
                    void handlers.interview(interaction);
                    break;
                case "unlink":
                    void handlers.unlink(interaction);
                    break;
                case "rank":
                    void handlers.rank(interaction);
                    break;
                case "link":
                    void handlers.link(interaction);
                    break;
                case "reaper":
                    routeReaper(handlers, interaction, logError);
                    break;
                case "booty":
                    void handlers.booty(interaction);
                    break;
                case "booty-alerts":
                    void handlers.bootyAlerts(interaction);
                    break;
            }
            return;
        }
        if (interaction.isAutocomplete()) {
            if (interaction.commandName === "alliance")
                void handlers.allianceAutocomplete(interaction);
            if (interaction.commandName === "reaper")
                void handlers.reaperAutocomplete(interaction);
            if (interaction.commandName === "booty-alerts")
                void handlers.bootyAlertsAutocomplete(interaction);
            return;
        }
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith(INTERVIEW_PREFIX))
                void handlers.interviewModal(interaction);
            return;
        }
        if (interaction.isButton()) {
            if (interaction.customId.startsWith(INTERVIEW_PREFIX)) {
                void handlers.interviewButton(interaction);
            }
            else if (interaction.customId.startsWith(RANK_PREFIX)) {
                void handlers.rankButton(interaction);
            }
            else if (interaction.customId.startsWith(LINK_PREFIX)) {
                void handlers.linkButton(interaction);
            }
            else if (interaction.customId.startsWith(PICK_PREFIX)) {
                void handlers.pick(interaction);
            }
            else if (interaction.customId.startsWith(OVERVIEW_PREFIX)) {
                void handlers.overview(interaction);
            }
            else if (interaction.customId.startsWith(REAPER_PREFIX)) {
                void handlers.reaperPage(interaction);
            }
            else if (interaction.customId.startsWith(BOOTY_PREFIX)) {
                void handlers.bootyButton(interaction);
            }
            else if (interaction.customId.startsWith(PREFERENCES_PREFIX)) {
                void handlers.preferencesPress(interaction);
            }
            return;
        }
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith(INTERVIEW_PREFIX)) {
                void handlers.interviewButton(interaction);
            }
            else if (interaction.customId.startsWith(PICK_PREFIX)) {
                void handlers.pick(interaction);
            }
            else if (interaction.customId.startsWith(PREFERENCES_PREFIX)) {
                void handlers.preferencesPress(interaction);
            }
        }
    });
    return client;
}
/** discord.js's code for a user who is not a member of the guild. */
const UNKNOWN_MEMBER = 10007;
/** Discord's code for an unknown user: a user who is no longer a member is answered the same way. */
const UNKNOWN_USER = 10013;
const unknownMemberError = z.object({ code: z.union([z.literal(UNKNOWN_MEMBER), z.literal(UNKNOWN_USER)]) });
/** A role of the guild as the name and roles apply reads it. */
function roleLikeOf(role) {
    return {
        id: role.id,
        name: role.name,
        managed: role.managed,
        permissions: { bitfield: role.permissions.bitfield },
        position: role.position,
    };
}
/** The guild as the name and roles apply reads it; the bot's highest role places the bot among the roles. */
function rolesGuildOf(guild, botTopRolePosition) {
    return {
        id: guild.id,
        ownerId: guild.ownerId,
        botTopRolePosition,
        get roles() {
            return [...guild.roles.cache.values()].map(roleLikeOf);
        },
        createRole: async (options) => {
            const role = await guild.roles.create({
                name: options.name,
                permissions: options.permissions,
                hoist: options.hoist,
                mentionable: options.mentionable,
            });
            return roleLikeOf(role);
        },
        renameRole: async (role, name) => {
            await guild.roles.edit(role.id, { name });
        },
    };
}
/** A guild member as the name and roles apply reads and changes it. */
function rolesMemberOf(member) {
    return {
        id: member.id,
        bot: member.user.bot,
        get nickname() {
            return member.nickname;
        },
        get roles() {
            return [...member.roles.cache.values()].map(roleLikeOf);
        },
        addRole: async (role) => {
            await member.roles.add(role.id);
        },
        removeRole: async (role) => {
            await member.roles.remove(role.id);
        },
        setNickname: async (nickname) => {
            await member.setNickname(nickname);
        },
    };
}
/** The member, or undefined when the user is not on the guild; any other failure is thrown. */
async function fetchMember(guild, memberId) {
    try {
        return await guild.members.fetch(memberId);
    }
    catch (error) {
        if (unknownMemberError.safeParse(error).success)
            return undefined;
        throw error;
    }
}
/**
 * Posts the server permissions Neil lacks to the log, at startup. Runs in the background: a failure to read the bot's
 * member or post the line is logged, never thrown.
 */
async function reportServerPermissions(guild, log, logError) {
    try {
        const me = guild.members.me ?? (await guild.members.fetchMe());
        await reportRolePermissions({ members: { me } }, log, logError);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logError(`Checking the server permissions failed: ${reason}`);
    }
}
/** Every Member of the guild, listed over REST page by page (see listEveryMember), never by the gateway. */
function everyMemberOf(guild) {
    return listEveryMember(async (after, limit) => {
        const page = await guild.members.list(after === undefined ? { limit } : { after, limit });
        return [...page.values()];
    });
}
/** The members of the guild for the name and roles; undefined for a user who is not on the guild. */
function serverMembersOf(guild) {
    return {
        memberOf: async (memberId) => {
            const member = await fetchMember(guild, memberId);
            if (member === undefined)
                return undefined;
            const me = guild.members.me ?? (await guild.members.fetchMe());
            return { guild: rolesGuildOf(guild, me.roles.highest.position), member: rolesMemberOf(member) };
        },
        all: async () => {
            const members = await everyMemberOf(guild);
            const me = guild.members.me ?? (await guild.members.fetchMe());
            const botTopRolePosition = me.roles.highest.position;
            return members.map((member) => ({
                guild: rolesGuildOf(guild, botTopRolePosition),
                member: rolesMemberOf(member),
            }));
        },
    };
}
/**
 * The discord.js button press or string select menu press as the Interview reads it. discord.js types reply with
 * overloads that the Interview's narrower signatures do not match, so each method is passed on with the one shape Neil
 * uses. A select menu press also carries the values picked.
 */
function buttonLike(button) {
    const like = {
        customId: button.customId,
        user: button.user,
        reply: async (message) => {
            await button.reply(message);
        },
        showModal: async (modal) => {
            await button.showModal(modal);
        },
        update: async (options) => {
            await button.update(options);
        },
        followUp: async (message) => {
            await button.followUp(message);
        },
    };
    return button.isStringSelectMenu() ? { ...like, values: [...button.values] } : like;
}
/**
 * The discord.js chat-input command as /player and /alliance read it: the caller and their roles, the options, and the
 * placeholder and reply methods. Each method is passed on with the one shape the lookups use.
 */
/** The discord.js chat-input command as /usage reads it: who ran it, their roles, and the private reply. */
function usageLike(command) {
    return {
        callerId: command.user.id,
        memberRoleIds: () => memberRoleIds(command.member),
        reply: (reply) => command.reply(reply),
    };
}
function lookupLike(command) {
    return {
        user: command.user,
        options: command.options,
        memberRoleIds: () => memberRoleIds(command.member),
        deferReply: async (options) => {
            await command.deferReply(options);
        },
        editReply: async (options) => {
            await command.editReply(options);
        },
        deleteReply: async () => {
            await command.deleteReply();
        },
        followUp: async (message) => {
            await command.followUp(message);
        },
        reply: async (message) => {
            await command.reply(message);
        },
    };
}
/**
 * The discord.js button press or string select menu press as a pick list reads it: the owner and the roles of the
 * Member who pressed, the values picked, and the reply methods. See buttonLike for why each method is passed on.
 */
function pickLike(press) {
    const like = {
        customId: press.customId,
        user: press.user,
        memberRoleIds: () => memberRoleIds(press.member),
        deferReply: async (options) => {
            await press.deferReply(options);
        },
        editReply: async (options) => {
            await press.editReply(options);
        },
        deleteReply: async () => {
            await press.deleteReply();
        },
        followUp: async (message) => {
            await press.followUp(message);
        },
        reply: async (message) => {
            await press.reply(message);
        },
        update: async (options) => {
            await press.update(options);
        },
    };
    return press.isStringSelectMenu() ? { ...like, values: [...press.values] } : like;
}
/** The discord.js button press as a Rank Approval reads it; see buttonLike for why each method is passed on. */
function rankButtonLike(button) {
    return {
        customId: button.customId,
        user: button.user,
        reply: async (message) => {
            await button.reply(message);
        },
        update: async (options) => {
            await button.update(options);
        },
    };
}
/**
 * The discord.js chat-input command as the corrections read it: the caller, their roles, and the options given. A message
 * with buttons keeps them; the deferral already made the answer private, so editReply takes no flags.
 */
function correctionLike(command) {
    return {
        callerId: command.user.id,
        memberRoleIds: () => memberRoleIds(command.member),
        memberOption: () => {
            const parsed = memberIdSchema.safeParse(command.options.getUser("member")?.id);
            return parsed.success ? parsed.data : undefined;
        },
        rankOption: () => command.options.getString("rank") ?? undefined,
        uidOption: () => command.options.getString("uid") ?? undefined,
        deferReply: async (options) => {
            await command.deferReply(options);
        },
        editReply: async (message) => {
            await command.editReply({
                content: message.content,
                allowedMentions: message.allowedMentions,
                ...("components" in message ? { components: message.components } : {}),
            });
        },
    };
}
/**
 * The discord.js button press as an Officer Link reads it. The press is acknowledged with deferUpdate, so the card is then
 * edited (not updated) and every answer is a follow-up.
 */
function linkButtonLike(button) {
    return {
        customId: button.customId,
        user: button.user,
        memberRoleIds: () => memberRoleIds(button.member),
        deferUpdate: async () => {
            await button.deferUpdate();
        },
        followUp: async (message) => {
            await button.followUp(message);
        },
        update: async (message) => {
            await button.editReply({ ...message, components: [] });
        },
    };
}
/** The discord.js /channels command as the choices read it: the caller, and the private reply. */
function channelsCommandLike(command) {
    return {
        user: command.user,
        reply: async (message) => {
            await command.reply(message);
        },
    };
}
/**
 * The discord.js button press or string select menu press on a Preferences message as the choices read it. A select menu
 * press also carries the values picked; see buttonLike for why each method is passed on.
 */
function preferencesPressLike(press) {
    const like = {
        customId: press.customId,
        user: press.user,
        reply: async (message) => {
            await press.reply(message);
        },
        update: async (options) => {
            await press.update(options);
        },
    };
    return press.isStringSelectMenu() ? { ...like, values: [...press.values] } : like;
}
/** The discord.js chat-input command as the Interview reads it; see buttonLike for why each method is passed on. */
function commandLike(command) {
    return {
        user: command.user,
        // A command from a member of the server carries the guild member, whose display name is the server's; else the username.
        displayName: command.member instanceof GuildMember ? command.member.displayName : command.user.username,
        deferReply: async (options) => {
            await command.deferReply(options);
        },
        // The deferral already made the answer ephemeral; editReply takes no flags.
        editReply: async (message) => {
            await command.editReply({ content: message.content, allowedMentions: message.allowedMentions });
        },
    };
}
/** The discord.js modal submit as the Interview reads it; see buttonLike for why each method is passed on. */
function modalLike(modal) {
    return {
        customId: modal.customId,
        user: modal.user,
        fields: { getTextInputValue: (id) => modal.fields.getTextInputValue(id) },
        reply: async (message) => {
            await modal.reply(message);
        },
        deferUpdate: async () => {
            await modal.deferUpdate();
        },
    };
}
/** A guild text channel as a Booty Call reads it: its id, its name and the name of its category; any other channel is not one. */
const guildTextChannelSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.literal(ChannelType.GuildText),
    parent: z.object({ name: z.string() }).nullish(),
});
function bootyChannelOf(channel) {
    const parsed = guildTextChannelSchema.safeParse(channel);
    if (!parsed.success)
        return undefined;
    return { id: parsed.data.id, name: parsed.data.name, categoryName: parsed.data.parent?.name };
}
/** The caller of a Booty Call: the server display name when the interaction gives a guild member, else the username. */
function bootyCallerOf(user, member) {
    return { id: user.id, displayName: member instanceof GuildMember ? member.displayName : user.username };
}
/** The discord.js /booty command as a Booty Call reads it: the caller, the channel, and the private reply. */
function bootyCommandLike(command) {
    return {
        user: bootyCallerOf(command.user, command.member),
        channel: bootyChannelOf(command.channel),
        reply: async (options) => {
            await command.reply(options);
        },
        deferReply: async (options) => {
            await command.deferReply(options);
        },
        editReply: async (options) => {
            await command.editReply(options);
        },
    };
}
/** The discord.js Booty Call button press as a Booty Call reads it; see buttonLike for why each method is passed on. */
function bootyButtonLike(button) {
    return {
        customId: button.customId,
        user: bootyCallerOf(button.user, button.member),
        channel: bootyChannelOf(button.channel),
        reply: async (options) => {
            await button.reply(options);
        },
        update: async (options) => {
            await button.update(options);
        },
        editReply: async (options) => {
            await button.editReply(options);
        },
    };
}
/** The discord.js /booty-alerts command as the Booty Alerts reads it: the caller and the options, and the private reply. */
function bootyAlertsLike(command) {
    return {
        user: command.user,
        options: { getString: (name) => command.options.getString(name) },
        reply: async (options) => {
            await command.reply(options);
        },
    };
}
/**
 * The Discord server as a Booty Call uses it: the holders of an Alliance role by its name (from the REST member listing),
 * presences from the cache only, posts to a channel and the log. A channel that is not a guild text channel cannot be posted to.
 */
function bootyServerOf(guild, channels) {
    return {
        holdersOf: async (roleName) => {
            const members = await everyMemberOf(guild);
            return members
                .filter((member) => [...member.roles.cache.values()].some((role) => role.name === roleName))
                .map((member) => member.id);
        },
        presenceOf: (memberId) => Promise.resolve(presenceStatusOf(guild.presences.cache.get(memberId)?.status)),
        post: async (channelId, message) => {
            const channel = await guild.channels.fetch(channelId);
            if (channel?.type !== ChannelType.GuildText)
                throw new Error(`The channel ${channelId} is not a guild text channel.`);
            const sent = await channel.send(message);
            return sent.url;
        },
        // Mentions are off in the log: a line names a Member by id, and must not ping them.
        log: (line) => channels.log({ content: line, allowedMentions: { parse: [] } }),
    };
}
/** Resolves once the client is ready; a client that is already ready resolves at once. */
function whenReady(client) {
    if (client.isReady())
        return Promise.resolve();
    return new Promise((resolve) => {
        client.once(Events.ClientReady, () => {
            resolve();
        });
    });
}
/** One line per channel problem, naming the configuration setting that points at the channel. */
function describeChannelProblem(problem) {
    const setting = problem.channel === "onboarding" ? "DISCORD_ONBOARDING_CHANNEL_ID" : "DISCORD_LOG_CHANNEL_ID";
    switch (problem.kind) {
        case "missing-channel":
            return `${setting}: no channel of this server has that ID`;
        case "not-text-channel":
            return `${setting}: the channel is not a text channel`;
        case "missing-permission":
            return `${setting}: Neil lacks the ${problem.permission} permission in the channel`;
    }
}
/** Logs in, checks the onboarding and log channels, and answers commands and Interview events until disconnected. A rejected login or a failed check rejects. */
export async function connect(token, options) {
    const logError = (message) => {
        console.error(message);
    };
    // One store for every pick list: the lookups open them, the pick handler answers them.
    const pickSessions = new PickSessions();
    // The Officer Link confirmations waiting for their Officer's button press.
    const linkConfirmations = new PendingLinkConfirmations();
    const now = options.now;
    // One store for every paged /reaper answer: the list and closest answers open them, the page buttons turn them.
    const reaperPages = new ReaperPages();
    // The lookups' view of the Officers and the Daily Allowance: the same for /player, /alliance, the pick lists and Overview.
    const lookupRoles = {
        officerRoleIds: options.officerRoleIds,
        allowance: () => options.allowance.allowance(),
        usage: (caller) => usageLine({
            used: options.allowance.usageOf(caller.memberId),
            allowance: options.allowance.allowance(),
            officer: caller.officer,
        }),
    };
    const allianceContext = {
        gameApi: options.gameApi,
        pickSessions,
        now,
        logError,
        ...lookupRoles,
        homeKingdom: options.homeKingdom,
        knownAlliances: options.knownAlliances,
    };
    // Interview and Rank Approval events wait here until ready and the channel check have passed; then they reach the services.
    let openServices = () => undefined;
    const services = new Promise((resolve) => {
        openServices = resolve;
    });
    const client = createClient({
        ping: (interaction) => handlePing(interaction, {
            now: Date.now,
            gatewayPingMs: () => client.ws.ping,
            buildInfo: options.buildInfo,
            startRecord: options.startRecord,
            logError,
        }),
        player: (interaction) => handlePlayer(lookupLike(interaction), {
            gameApi: options.gameApi,
            pickSessions,
            now,
            logError,
            ...lookupRoles,
        }),
        alliance: (interaction) => handleAlliance(lookupLike(interaction), allianceContext),
        allianceAutocomplete: (interaction) => answer("/alliance autocomplete", { logError }, () => handleAllianceAutocomplete(interaction, { knownAlliances: options.knownAlliances, now, logError })),
        pick: async (press) => (await services).pick(pickLike(press)),
        reaperClosest: (interaction) => handleReaperClosest(interaction, {
            links: options.links,
            gameApi: options.gameApi,
            reaper: options.reaper,
            pages: reaperPages,
            homeKingdom: options.homeKingdom,
            now,
            logError,
        }),
        reaperList: (interaction) => handleReaperList(interaction, { reaper: options.reaper, pages: reaperPages, now, logError }),
        reaperAdd: async (interaction) => (await services).reaperAdd(interaction),
        reaperRemove: async (interaction) => (await services).reaperRemove(interaction),
        reaperAutocomplete: (interaction) => answer("/reaper autocomplete", { logError }, () => handleReaperAutocomplete(interaction, { reaper: options.reaper })),
        reaperPage: (button) => handleReaperPage(button, { pages: reaperPages, now, logError }),
        overview: (press) => handleOverview(pickLike(press), { gameApi: options.gameApi, pickSessions, now, logError, ...lookupRoles }),
        booty: async (interaction) => answer("/booty", { logError }, async () => {
            const { bootyCalls } = await services;
            await bootyCalls.onCommand(bootyCommandLike(interaction));
        }),
        bootyAlerts: (interaction) => handleBootyAlerts(bootyAlertsLike(interaction), {
            links: options.links,
            bootyAlerts: options.bootyAlerts,
            logError,
        }),
        bootyAlertsAutocomplete: (interaction) => answer("/booty-alerts autocomplete", { logError }, () => handleTimeZoneAutocomplete(interaction)),
        bootyButton: async (button) => answer("booty button", { logError }, async () => {
            const { bootyCalls } = await services;
            await bootyCalls.onButton(bootyButtonLike(button));
        }),
        quota: (interaction) => handleQuota({
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
        }, {
            quotaToday: () => options.gameApi.quotaToday(),
            quotaReserve: options.quotaReserve,
            allowance: options.allowance,
            officerRoleIds: options.officerRoleIds,
            now: () => new Date(),
            logError,
        }),
        usage: (interaction) => handleUsage(usageLike(interaction), {
            allowance: options.allowance,
            officerRoleIds: options.officerRoleIds,
            now,
            logError,
        }),
        help: (interaction) => handleHelp({
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
        }, { commands, officerRoleIds: options.officerRoleIds, logError }),
        memberJoined: async (member) => (await services).interviews.onMemberJoined(member),
        memberOnline: async (member) => (await services).interviews.onMemberOnline(member),
        memberLeft: async (member) => (await services).interviews.onMemberLeft(member),
        interview: async (interaction) => (await services).interviews.onCommand(commandLike(interaction)),
        unlink: async (interaction) => (await services).corrections.unlink(correctionLike(interaction)),
        rank: async (interaction) => (await services).corrections.rank(correctionLike(interaction)),
        link: async (interaction) => (await services).corrections.link(correctionLike(interaction)),
        linkButton: (button) => answer("link button", { logError }, async () => {
            const { corrections } = await services;
            await corrections.linkButton(linkButtonLike(button));
        }),
        interviewButton: async (button) => (await services).interviews.onButton(buttonLike(button)),
        interviewModal: async (modal) => (await services).interviews.onModalSubmit(modalLike(modal)),
        rankButton: (button) => answer("rank button", { logError }, async () => {
            const { rankApprovals } = await services;
            await rankApprovals.onButton(rankButtonLike(button));
        }),
        channels: async (interaction) => (await services).preferenceChoices.showChannels(channelsCommandLike(interaction)),
        preferencesPress: async (press) => (await services).preferenceChoices.press(preferencesPressLike(press)),
    }, { guildId: options.guildId, logError });
    // The sweeper and the Daily Sync run from the moment the channels are checked (the Daily Sync from the end of the startup
    // apply); both are stopped again on disconnect.
    let stopSweeper = () => undefined;
    let stopDailySync = () => Promise.resolve();
    // The startup check of the Interviews of the Members online, while it runs: disconnect waits for it before the client
    // (and the database after it) goes.
    let startupInterviews = Promise.resolve();
    let disconnecting = false;
    try {
        await client.login(token);
        await whenReady(client);
        const guild = await client.guilds.fetch(options.guildId);
        const channelIds = { onboardingChannelId: options.onboardingChannelId, logChannelId: options.logChannelId };
        const problems = await checkChannels(guild, channelIds);
        if (problems.length > 0) {
            throw new Error(["The onboarding or log channel cannot be used:", ...problems.map((problem) => `- ${describeChannelProblem(problem)}`)].join("\n"));
        }
        const [moderatorRoleId, kingRoleId] = options.officerRoleIds;
        const officerRoles = { moderatorRoleId, kingRoleId };
        const channels = createOnboardingChannels(guild, channelIds);
        // /booty: the Game API is asked only through the uncharged lookup, the roles and presences come from the server.
        const bootyCalls = createBootyCalls({
            links: options.links,
            bootyAlerts: options.bootyAlerts,
            game: options.gameApi,
            server: bootyServerOf(guild, channels),
            now,
            logError,
        });
        // One Onboarding Role service and one Doctor Role service, for every path that gives or takes the roles off.
        const onboardingRole = createOnboardingRole({
            members: serverMembersOf(guild),
            links: options.links,
            preferences: options.preferences,
            logError,
            log: (message) => channels.log(message),
            officerRoleIds: options.officerRoleIds,
        });
        const doctorRole = createDoctorRole({
            members: serverMembersOf(guild),
            links: options.links,
            logError,
            log: (message) => channels.log(message),
            officerRoleIds: options.officerRoleIds,
        });
        // A private message to a Member, by Discord DM; Discord refuses it when the Member cannot be messaged.
        const sendPrivateMessage = async (memberId, message) => {
            const user = await client.users.fetch(memberId);
            await user.send(message);
        };
        const preferenceRoles = createPreferenceRoles({
            members: serverMembersOf(guild),
            links: options.links,
            preferences: options.preferences,
            applied: options.applied,
            homeKingdom: options.homeKingdom,
            channels,
            logError,
            // A change of roles is one plain line in the log channel, without mentions; a refused post is logged and the change stands.
            log: (line) => {
                channels.log({ content: line, allowedMentions: { parse: [] } }).catch((error) => {
                    const reason = error instanceof Error ? error.message : String(error);
                    logError(`Logging a Preference Roles change failed: ${reason}`);
                });
            },
            officerRoleIds: options.officerRoleIds,
        });
        // The Preferences message's presses and /channels: the same stores, roles and log as the Interview's Preferences.
        const preferenceChoices = createPreferenceChoices({
            roles: preferenceRoles,
            preferences: options.preferences,
            links: options.links,
            rankApprovals: options.links,
            applied: options.applied,
            homeKingdom: options.homeKingdom,
            channels,
            onboardingRole,
            guidesForumId: options.guidesForumId,
            logError,
        });
        const unlink = createUnlink({
            links: options.links,
            applied: options.applied,
            channels,
            members: serverMembersOf(guild),
            onboardingRole,
            doctorRole,
            preferenceRoles,
            bootyAlerts: options.bootyAlerts,
            now,
            sendPrivateMessage,
            officerRoles,
            logError,
        });
        const nameAndRoles = createNameAndRoles({
            members: serverMembersOf(guild),
            applied: options.applied,
            links: options.links,
            gameApi: options.gameApi,
            unlink,
            preferenceRoles,
            homeKingdom: options.homeKingdom,
            troopBracketLevels: options.troopBracketLevels,
            officerRoleIds: options.officerRoleIds,
            log: (message) => channels.log(message),
            now,
            logError,
        });
        const rankApprovals = createRankApprovals({
            links: options.links,
            preferences: options.preferences,
            channels,
            nameAndRoles,
            onboardingRole,
            officerRoles,
            memberRoleIdsOf: (memberId) => guild.members.fetch(memberId).then((member) => memberRoleIds(member), () => []),
            now,
            logError,
        });
        const isOnServer = (memberId) => guild.members.fetch(memberId).then(() => true, () => false);
        const interviews = createInterviews({
            interviews: options.interviews,
            links: options.links,
            channels,
            gameApi: options.gameApi,
            officerRoles,
            rankApprovals,
            nameAndRoles,
            unlink,
            onboardingRole,
            doctorRole,
            preferences: createPreferencesAfterLink({
                preferences: options.preferences,
                channels,
                guidesForumId: options.guidesForumId,
                homeKingdom: options.homeKingdom,
                now,
            }),
            sendPrivateMessage,
            isOnServer,
            homeKingdom: options.homeKingdom,
            now,
            logError,
        });
        const corrections = {
            unlink: (interaction) => handleUnlink(interaction, { links: options.links, unlink, officerRoles, logError }),
            rank: (interaction) => handleRank(interaction, {
                links: options.links,
                preferences: options.preferences,
                channels,
                nameAndRoles,
                onboardingRole,
                officerRoles,
                now,
                logError,
            }),
            link: (interaction) => handleLink(interaction, {
                links: options.links,
                interviews: options.interviews,
                gameApi: options.gameApi,
                isOnServer,
                officerRoles,
                confirmations: linkConfirmations,
                now,
                logError,
            }),
            linkButton: (button) => handleLinkButton(button, {
                links: options.links,
                interviews: options.interviews,
                channels,
                rankApprovals,
                nameAndRoles,
                onboardingRole,
                doctorRole,
                homeKingdom: options.homeKingdom,
                isOnServer,
                sendPrivateMessage,
                confirmations: linkConfirmations,
                now,
                logError,
            }),
        };
        // The /reaper add and remove contexts and the pick context share the channels, so they are built once the checks pass.
        const editorOfMember = (memberId) => editorOf({ links: options.links, applied: options.applied }, memberId);
        const reaperWrites = {
            editorOf: editorOfMember,
            homeKingdom: options.homeKingdom,
            reaper: options.reaper,
            channels,
            logError,
        };
        const pickContext = {
            gameApi: options.gameApi,
            pickSessions,
            now,
            logError,
            ...lookupRoles,
            reaper: options.reaper,
            channels,
            editorOf: editorOfMember,
            homeKingdom: options.homeKingdom,
        };
        openServices({
            interviews,
            rankApprovals,
            corrections,
            preferenceChoices,
            bootyCalls,
            reaperAdd: (interaction) => handleReaperAdd(interaction, {
                ...reaperWrites,
                gameApi: options.gameApi,
                pickSessions,
                now,
            }),
            reaperRemove: (interaction) => handleReaperRemove(interaction, reaperWrites),
            pick: (interaction) => handlePick(interaction, pickContext),
        });
        // The startup sweeps of the Onboarding Role, then the Doctor Role, then the Interviews of the Members online, chained so
        // their log lines and role changes do not interleave, and run in the background, so login does not wait for them. The
        // Interview check is skipped once disconnect has begun, and stops before the next Member when it has. The Daily Sync
        // starts once the startup apply has settled, so their Game API lookups do not overlap.
        const startOnlineInterviews = () => onlineMembersOf(guild, logError, () => disconnecting)
            .then((members) => interviews.onlineAtStartup(members, () => disconnecting))
            .catch((error) => {
            logError(`Starting the Interviews of the Members online at startup failed: ${String(error)}`);
        });
        void onboardingRole
            .atStartup()
            .catch((error) => {
            logError(`Bringing the Onboarding Role of the Members up to date at startup failed: ${String(error)}`);
        })
            .then(() => doctorRole.atStartup())
            .catch((error) => {
            logError(`Bringing the Doctor Role of the Members up to date at startup failed: ${String(error)}`);
        })
            .then(() => {
            if (disconnecting)
                return;
            startupInterviews = startOnlineInterviews();
            return startupInterviews;
        });
        void nameAndRoles
            .atStartup()
            .catch((error) => {
            logError(`Giving the Linked Members their name and roles at startup failed: ${String(error)}`);
        })
            .then(() => {
            if (disconnecting)
                return;
            stopDailySync = startDailySync({
                links: options.links,
                applied: options.applied,
                runs: options.dailySync,
                members: serverMembersOf(guild),
                gameApi: options.gameApi,
                nameAndRoles,
                preferenceRoles,
                unlink,
                share: options.syncShare,
                quotaReserve: options.quotaReserve,
                log: (message) => channels.log(message),
                logError,
                now,
            }, options.syncHourUtc, (run, everyMs) => {
                const timer = setInterval(run, everyMs);
                return () => {
                    clearInterval(timer);
                };
            });
        });
        void reportServerPermissions(guild, (message) => channels.log(message), logError);
        const sweeper = createSweeper({
            interviews: options.interviews,
            links: options.links,
            preferences: options.preferences,
            channels,
            onboardingRole,
            timeoutMs: options.interviewTimeoutMs,
            now,
            logError,
            linkChosen: interviews.linkChosen,
        });
        stopSweeper = startSweeper(sweeper, (run, everyMs) => {
            const timer = setInterval(run, everyMs);
            return () => {
                clearInterval(timer);
            };
        });
    }
    catch (error) {
        disconnecting = true;
        stopSweeper();
        await stopDailySync();
        await startupInterviews;
        await client.destroy();
        throw error;
    }
    return {
        disconnect: async () => {
            disconnecting = true;
            stopSweeper();
            // A run in progress ends before its next request and is awaited, so its record and summary are made before logout.
            await stopDailySync();
            // The Interview check stops before its next Member, and is awaited, so its log line is made before logout.
            await startupInterviews;
            await client.destroy();
        },
    };
}
//# sourceMappingURL=client.js.map