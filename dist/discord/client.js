import { Client, Events, GatewayIntentBits, GuildMember, } from "discord.js";
import { z } from "zod";
import { createInterviews, } from "./interview.js";
import { createSweeper, startSweeper } from "./interview-sweeper.js";
import { checkChannels, createOnboardingChannels } from "./onboarding-channels.js";
import { createRankApprovals } from "./rank-approval.js";
import { handlePing } from "./ping.js";
import { answer, handleAlliance, handlePlayer } from "./lookup.js";
import { handlePick } from "./pick.js";
import { PickSessions } from "./pick-sessions.js";
import { handleQuota } from "./quota.js";
/** The custom id prefix of every pick list component; other component custom ids are not Neil's. */
const PICK_PREFIX = "pick:";
/** The custom id prefix of every Onboarding Interview button and modal. */
const INTERVIEW_PREFIX = "interview:";
/** The custom id prefix of every Rank Approval button. */
const RANK_PREFIX = "rank:";
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
/** A discord.js client with the Guilds and GuildMembers intents that routes each event to its handler. */
export function createClient(handlers, options) {
    const logError = options.logError ?? console.error;
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
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
    // The member may be partial when they left; their user is still there.
    client.on(Events.GuildMemberRemove, (member) => {
        if (member.guild.id !== options.guildId)
            return;
        void handlers.memberLeft({ id: member.id, username: member.user.username });
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
                case "interview":
                    void handlers.interview(interaction);
                    break;
            }
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
            else if (interaction.customId.startsWith(PICK_PREFIX)) {
                void handlers.pick(interaction);
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
        }
    });
    return client;
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
    const now = () => new Date();
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
        player: (interaction) => handlePlayer(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
        alliance: (interaction) => handleAlliance(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
        pick: (interaction) => handlePick(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
        quota: (interaction) => handleQuota({
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
        }, {
            quotaToday: () => options.gameApi.quotaToday(),
            quotaReserve: options.quotaReserve,
            officerRoleIds: options.officerRoleIds,
            now: () => new Date(),
            logError,
        }),
        memberJoined: async (member) => (await services).interviews.onMemberJoined(member),
        memberLeft: async (member) => (await services).interviews.onMemberLeft(member),
        interview: async (interaction) => (await services).interviews.onCommand(commandLike(interaction)),
        interviewButton: async (button) => (await services).interviews.onButton(buttonLike(button)),
        interviewModal: async (modal) => (await services).interviews.onModalSubmit(modalLike(modal)),
        rankButton: (button) => answer("rank button", { logError }, async () => {
            const { rankApprovals } = await services;
            await rankApprovals.onButton(rankButtonLike(button));
        }),
    }, { guildId: options.guildId, logError });
    // The sweeper runs from the moment the channels are checked; stopped again on disconnect.
    let stopSweeper = () => undefined;
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
        const rankApprovals = createRankApprovals({
            links: options.links,
            channels,
            officerRoles,
            memberRoleIdsOf: (memberId) => guild.members.fetch(memberId).then((member) => memberRoleIds(member), () => []),
            now,
            logError,
        });
        const interviews = createInterviews({
            interviews: options.interviews,
            links: options.links,
            channels,
            gameApi: options.gameApi,
            officerRoles,
            rankApprovals,
            isOnServer: (memberId) => guild.members.fetch(memberId).then(() => true, () => false),
            now,
            logError,
        });
        openServices({ interviews, rankApprovals });
        const sweeper = createSweeper({
            interviews: options.interviews,
            links: options.links,
            channels,
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
        stopSweeper();
        await client.destroy();
        throw error;
    }
    return {
        disconnect: async () => {
            stopSweeper();
            await client.destroy();
        },
    };
}
//# sourceMappingURL=client.js.map