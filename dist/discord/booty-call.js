import { ButtonStyle, ComponentType, MessageFlags, } from "discord.js";
import { isBootyCallCoolingDown, isBootyMatch, isBootyOnline, isConfirmationExpired, } from "../domain/booty.js";
import { tagOfAllianceRole } from "../domain/managed-roles.js";
import { localMinuteOf } from "./booty-time.js";
import { bootyCallMessages } from "./booty-texts.js";
import { CARD_COLOR, escapeText } from "./lookup-cards.js";
import { chunksOf, MENTIONS_PER_MESSAGE, mentionsMessage, mentionText } from "./mentions.js";
const ALLIANCE_CHAT = "alliance-chat";
const CONFIRM_ID = /^booty:confirm:(\d+):(\d+)$/;
const CANCEL_ID = /^booty:cancel:(\d+)$/;
/**
 * Creates the /booty command and its buttons. A Booty Call asks for a private Confirm, then posts one card to the
 * Alliance's alliance-chat that mentions the Members whose Booty Alerts match. The cooldown per Alliance is claimed
 * before the first await of a Confirm, and released if the card does not post. Replies and updates that fail are logged,
 * never thrown.
 */
export function createBootyCalls(deps) {
    const cooldowns = new Map();
    function activeCooldown(roleName, nowMs) {
        const cooldown = cooldowns.get(roleName);
        if (cooldown === undefined || !isBootyCallCoolingDown(cooldown.calledAtMs, nowMs))
            return undefined;
        return cooldown;
    }
    async function answer(what, action) {
        try {
            await action();
        }
        catch (error) {
            deps.logError(`${what} failed: ${errorMessage(error)}`);
        }
    }
    function refuse(interaction, content) {
        return answer("Replying to /booty", () => interaction.reply({ content, flags: MessageFlags.Ephemeral }));
    }
    /** Answers a /booty after its deferral: the message replaces the deferred reply. */
    function editRefusal(interaction, content) {
        return answer("Editing the /booty reply", () => interaction.editReply({ content }));
    }
    /** Acknowledges a /booty privately, so the holders can be read within Discord's 3-second window. False when it failed. */
    async function deferPrivately(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            return true;
        }
        catch (error) {
            deps.logError(`Deferring /booty failed: ${errorMessage(error)}`);
            return false;
        }
    }
    async function onCommand(interaction) {
        const alliance = allianceOf(interaction.channel);
        if (alliance === undefined)
            return refuse(interaction, bootyCallMessages.wrongChannel);
        const memberId = interaction.user.id;
        if (deps.links.linkFor(memberId) === undefined)
            return refuse(interaction, bootyCallMessages.notLinked);
        if (!(await deferPrivately(interaction)))
            return undefined;
        const holders = await holdersOf(alliance.roleName);
        if (holders === undefined)
            return editRefusal(interaction, bootyCallMessages.unavailable);
        if (!holders.includes(memberId))
            return editRefusal(interaction, bootyCallMessages.notInAlliance);
        const nowMs = deps.now().getTime();
        const cooling = activeCooldown(alliance.roleName, nowMs);
        if (cooling !== undefined) {
            return editRefusal(interaction, bootyCallMessages.coolingDown(alliance.roleName, cooling.link));
        }
        const confirmId = `booty:confirm:${memberId}:${nowMs.toString()}`;
        const cancelId = `booty:cancel:${memberId}`;
        await answer("Editing the /booty reply", () => interaction.editReply({
            content: bootyCallMessages.confirmation(alliance.roleName),
            components: [confirmRow(confirmId, cancelId)],
        }));
        return undefined;
    }
    async function onButton(interaction) {
        const action = parseButton(interaction.customId);
        if (action === undefined)
            return refuse(interaction, bootyCallMessages.unknownButton);
        if (action.memberId !== interaction.user.id)
            return refuse(interaction, bootyCallMessages.notYours);
        if (action.kind === "cancel") {
            return answer("Updating the Booty Call", () => interaction.update({ content: bootyCallMessages.cancelled, components: [] }));
        }
        const nowMs = deps.now().getTime();
        if (isConfirmationExpired(action.issuedAtMs, nowMs))
            return refuse(interaction, bootyCallMessages.expired);
        const alliance = allianceOf(interaction.channel);
        if (alliance === undefined)
            return refuse(interaction, bootyCallMessages.wrongChannel);
        const link = deps.links.linkFor(action.memberId);
        if (link === undefined)
            return refuse(interaction, bootyCallMessages.notLinked);
        const cooling = activeCooldown(alliance.roleName, nowMs);
        if (cooling !== undefined) {
            return refuse(interaction, bootyCallMessages.coolingDown(alliance.roleName, cooling.link));
        }
        // Claimed before the first await, so a second Confirm in the same moment finds the cooldown and posts nothing.
        const claim = { calledAtMs: nowMs, link: undefined };
        cooldowns.set(alliance.roleName, claim);
        await answer("Updating the Booty Call", () => interaction.update({ content: bootyCallMessages.calling, components: [] }));
        try {
            await callTheAlliance(interaction, alliance, claim, link.uid);
        }
        catch (error) {
            await failAfterClaim(interaction, alliance.roleName, claim, error);
        }
        return undefined;
    }
    /**
     * A throw anywhere in the call after the claim. Before the card is posted, the claim is released and the caller is
     * told the card could not be posted. Once it is posted, the card is out: the claim stays, and the caller gets the link.
     */
    async function failAfterClaim(interaction, roleName, claim, error) {
        deps.logError(`The Booty Call failed: ${errorMessage(error)}`);
        const link = claim.link;
        if (link === undefined) {
            release(roleName, claim);
            return answer("Editing the Booty Call reply", () => interaction.editReply({ content: bootyCallMessages.postFailed }));
        }
        return answer("Editing the Booty Call reply", () => interaction.editReply({ content: bootyCallMessages.posted(link) }));
    }
    /** Runs after the Confirm is acknowledged: the caller's holding is read now, and the Game API is asked only once it holds. */
    async function callTheAlliance(interaction, alliance, claim, callerUid) {
        const callerId = interaction.user.id;
        const holders = await holdersOf(alliance.roleName);
        if (holders === undefined || !holders.includes(callerId)) {
            release(alliance.roleName, claim);
            const content = holders === undefined ? bootyCallMessages.unavailable : bootyCallMessages.notInAlliance;
            return answer("Editing the Booty Call reply", () => interaction.editReply({ content }));
        }
        const reach = await rosterOf(callerUid);
        const mentioned = await alertedMembers(callerId, holders, reach);
        const [first = [], ...rest] = chunksOf(mentioned, MENTIONS_PER_MESSAGE);
        let link;
        try {
            link = await deps.server.post(alliance.channelId, cardMessage(interaction.user.displayName, alliance.roleName, first));
        }
        catch (error) {
            release(alliance.roleName, claim);
            deps.logError(`Posting the Booty Call failed: ${errorMessage(error)}`);
            return answer("Editing the Booty Call reply", () => interaction.editReply({ content: bootyCallMessages.postFailed }));
        }
        claim.link = link;
        for (const ids of rest) {
            try {
                await deps.server.post(alliance.channelId, mentionsMessage(ids));
            }
            catch (error) {
                deps.logError(`Posting mentions of a Booty Call failed: ${errorMessage(error)}`);
            }
        }
        try {
            await deps.server.log(bootyCallMessages.logLine(callerId, alliance.roleName, mentioned.length, reach !== undefined));
        }
        catch (error) {
            deps.logError(`Logging a Booty Call failed: ${errorMessage(error)}`);
        }
        return answer("Editing the Booty Call reply", () => interaction.editReply({ content: bootyCallMessages.posted(link) }));
    }
    function release(roleName, claim) {
        if (cooldowns.get(roleName) === claim)
            cooldowns.delete(roleName);
    }
    /** The Members to mention: the roster matched to Links, or the Alliance role's holders when the Game gave no roster. */
    async function alertedMembers(callerId, holders, reach) {
        const candidates = reach === undefined
            ? holders.map((memberId) => ({ memberId, game: undefined }))
            : reach.roster.flatMap((row) => {
                const memberId = deps.links.memberForUid(row.uid);
                return memberId === undefined ? [] : [{ memberId, game: row }];
            });
        const matched = [];
        for (const { memberId, game } of candidates) {
            if (memberId !== callerId && (await matches(memberId, game)))
                matched.push(memberId);
        }
        return matched;
    }
    /** Whether a Member's Booty Alerts match now. A Member whose Booty Alerts do not read, or whose time zone is unknown, is skipped. */
    async function matches(memberId, game) {
        let alerts;
        try {
            alerts = deps.bootyAlerts.get(memberId);
        }
        catch (error) {
            deps.logError(`Booty Alerts of ${memberId} were skipped: ${errorMessage(error)}`);
            return false;
        }
        if (alerts === undefined || alerts.mode === "off")
            return false;
        const localMinute = localMinuteOf(deps.now(), alerts.timeZone);
        if (localMinute === undefined) {
            deps.logError(`Booty Alerts of ${memberId} were skipped: the time zone is not known`);
            return false;
        }
        const online = isBootyOnline(game, await discordOnline(memberId));
        return isBootyMatch(alerts, { online, localMinute });
    }
    async function discordOnline(memberId) {
        try {
            const status = await deps.server.presenceOf(memberId);
            return status !== undefined && status !== "offline";
        }
        catch (error) {
            deps.logError(`Reading the presence of ${memberId} failed: ${errorMessage(error)}`);
            return false;
        }
    }
    /** The Alliance role's holders, or undefined when Discord could not say who holds it. */
    async function holdersOf(roleName) {
        try {
            return await deps.server.holdersOf(roleName);
        }
        catch (error) {
            deps.logError(`Reading the holders of ${roleName} failed: ${errorMessage(error)}`);
            return undefined;
        }
    }
    /** The Alliance roster from the caller's Player lookup; undefined when the Game gave none (a refusal, a failure, no roster or an empty one). */
    async function rosterOf(callerUid) {
        try {
            const result = await deps.game.getPlayer(callerUid, "lookup");
            if (result.kind !== "found")
                return undefined;
            const roster = result.value.roster;
            return roster === undefined || roster.length === 0 ? undefined : { roster };
        }
        catch (error) {
            deps.logError(`The Game API lookup for the Booty Call failed: ${errorMessage(error)}`);
            return undefined;
        }
    }
    return { onCommand, onButton };
}
function allianceOf(channel) {
    if (channel === undefined || channel.name !== ALLIANCE_CHAT || channel.categoryName === undefined)
        return undefined;
    if (tagOfAllianceRole(channel.categoryName) === undefined)
        return undefined;
    return { roleName: channel.categoryName, channelId: channel.id };
}
/** Reads the custom id of a Booty Call button; any other id reads as undefined. */
function parseButton(customId) {
    const confirm = CONFIRM_ID.exec(customId);
    if (confirm !== null) {
        const [, memberId, issued] = confirm;
        const issuedAtMs = Number(issued);
        if (memberId === undefined || !Number.isSafeInteger(issuedAtMs))
            return undefined;
        return { kind: "confirm", memberId, issuedAtMs };
    }
    const cancel = CANCEL_ID.exec(customId);
    const memberId = cancel?.[1];
    return memberId === undefined ? undefined : { kind: "cancel", memberId };
}
function confirmRow(confirmId, cancelId) {
    return {
        type: ComponentType.ActionRow,
        components: [
            { type: ComponentType.Button, style: ButtonStyle.Danger, label: "Confirm", custom_id: confirmId },
            { type: ComponentType.Button, style: ButtonStyle.Secondary, label: "Cancel", custom_id: cancelId },
        ],
    };
}
/** The card: the caller's line and the first mentions in the content, the card's embed, and allowedMentions exactly those Members. */
function cardMessage(callerName, roleName, mentioned) {
    const embed = {
        color: CARD_COLOR,
        title: bootyCallMessages.card.title,
        description: bootyCallMessages.card.description,
    };
    const line = bootyCallMessages.callLine(escapeText(callerName), escapeText(roleName));
    const content = mentioned.length === 0 ? line : `${line} ${mentionText(mentioned)}`;
    return { content, embeds: [embed], allowedMentions: { parse: [], users: [...mentioned] } };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=booty-call.js.map