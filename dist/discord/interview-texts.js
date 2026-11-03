import { ButtonStyle, ComponentType, escapeMarkdown, MessageFlags, TextInputStyle, } from "discord.js";
import { optionLabel, timeLeft, utcTime } from "./lookup-cards.js";
const THREAD_NAME_MAX_LENGTH = 100;
const MAX_TRIES = 5;
const EXAMPLE_UID = "145563254785";
const UID_HELP = "In the game, tap your profile picture in the top left, then the feather next to your name. The number under the picture is your uid; the button next to it copies it.";
const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const PICK_LIST_MAX_OPTIONS = 25;
const INTERVIEW_ACTIONS = ["uid", "modal", "confirm", "reject", "accept", "decline", "pick"];
const APPROVABLE_RANKS = ["R1", "R2", "R3", "R4", "R5"];
const INTERVIEW_CUSTOM_ID = /^interview:([a-z]+):(\d+)$/;
const RANK_CUSTOM_ID = /^rank:(\d+):([A-Za-z0-9]+)$/;
/** Escapes Game API and user text for Discord markdown; discord.js leaves a lone `~` alone, so it is escaped here. */
function escapeText(text) {
    return escapeMarkdown(text).replaceAll("~", "\\~");
}
function noMentions() {
    return { parse: [] };
}
/** The attempts left as a sentence, shown when 1 to 4 remain; empty otherwise. */
function triesLeftText(triesLeft) {
    if (triesLeft <= 0 || triesLeft >= MAX_TRIES)
        return "";
    return triesLeft === 1 ? "1 try left." : `${triesLeft.toString()} tries left.`;
}
/** Joins the non-empty parts with single spaces. */
function sentences(...parts) {
    return parts.filter((part) => part !== "").join(" ");
}
/** A timeout as whole hours when it divides evenly, else as minutes: "24 hours", "1 hour", "3 minutes". */
function durationText(ms) {
    const minutes = Math.floor(ms / MINUTE_MS);
    if (minutes >= MINUTES_PER_HOUR && minutes % MINUTES_PER_HOUR === 0) {
        const hours = minutes / MINUTES_PER_HOUR;
        return hours === 1 ? "1 hour" : `${hours.toString()} hours`;
    }
    return minutes === 1 ? "1 minute" : `${minutes.toString()} minutes`;
}
function rankText(rank) {
    return rank === "unknown" ? "rank unknown" : rank;
}
/** The Alliance a Player belongs to, as a Rank Approval names it: "[TAG]", or "no alliance". */
function allianceTagText(player) {
    return player.alliance === undefined ? "no alliance" : `[${escapeText(player.alliance.tag)}]`;
}
/** The Alliance and rank as the found card shows them: "[TAG] Name, R5", or "no alliance". */
function allianceCardText(player) {
    if (player.alliance === undefined)
        return "no alliance";
    return `[${escapeText(player.alliance.tag)}] ${escapeText(player.alliance.name)}, ${rankText(player.allianceRank)}`;
}
function giveUidRow(interviewId) {
    return {
        type: ComponentType.ActionRow,
        components: [
            {
                type: ComponentType.Button,
                style: ButtonStyle.Primary,
                label: "Give my uid",
                custom_id: interviewCustomId("uid", interviewId),
            },
        ],
    };
}
function giveUidMessage(content, interviewId, allowedMentions) {
    return { content, components: [giveUidRow(interviewId)], allowedMentions };
}
/** The question for the uid with its help, without a greeting. */
function askUid() {
    return `Tell me who you are in the game: press the button and enter your uid.\n${UID_HELP}`;
}
function askBody(member) {
    return `Welcome, <@${member}>! ${askUid()}`;
}
/** The thread's name for an Interview: "Interview – {username}", cut to 100 characters. */
export function interviewThreadName(username) {
    return `Interview – ${username}`.slice(0, THREAD_NAME_MAX_LENGTH);
}
/** The custom id of a button or modal on an Interview thread: interview:{action}:{id}. */
export function interviewCustomId(action, interviewId) {
    return `interview:${action}:${interviewId.toString()}`;
}
function asInterviewAction(text) {
    return INTERVIEW_ACTIONS.find((action) => action === text);
}
/** Reads an Interview custom id; undefined when it is not one, or its id is not a whole number. */
export function parseInterviewCustomId(customId) {
    const match = INTERVIEW_CUSTOM_ID.exec(customId);
    if (match === null)
        return undefined;
    const action = asInterviewAction(match[1] ?? "");
    const interviewId = Number(match[2]);
    if (action === undefined || !Number.isSafeInteger(interviewId))
        return undefined;
    return { action, interviewId };
}
export function asApprovableRank(text) {
    return APPROVABLE_RANKS.find((rank) => rank === text);
}
/** The custom id of a Rank Approval's rank button: rank:{approvalId}:{rank}. */
export function rankCustomId(approvalId, rank) {
    return `rank:${approvalId.toString()}:${rank}`;
}
/** Reads a Rank Approval's rank button; undefined when it is not one, or the rank is not R1 to R5. */
export function parseRankCustomId(customId) {
    const match = RANK_CUSTOM_ID.exec(customId);
    if (match === null)
        return undefined;
    const approvalId = Number(match[1]);
    const rank = asApprovableRank(match[2] ?? "");
    if (rank === undefined || !Number.isSafeInteger(approvalId))
        return undefined;
    return { approvalId, rank };
}
/** The private reply to /interview when a new Interview opens. */
export function interviewOpenedReply(threadId) {
    return {
        content: `Your interview is waiting in <#${threadId}>.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The private reply to /interview when an Interview is already open. */
export function interviewAlreadyOpenReply(threadId) {
    return {
        content: `Your interview is already open: <#${threadId}>.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The private reply to /interview for a Member who is already Linked: the uid of the Player they are linked to. */
export function interviewLinkedReply(uid) {
    return {
        content: `You're already linked to the player with uid ${uid}.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The thread message that welcomes a Member and asks for their uid, with the Give my uid button. */
export function askUidMessage(interviewId, member) {
    return giveUidMessage(askBody(member), interviewId, { users: [member] });
}
/** The uid help as its own message, without buttons. */
export function uidHelpMessage() {
    return { content: UID_HELP, allowedMentions: noMentions() };
}
/** The thread message for a submitted uid that is not only digits. */
export function malformedUidMessage(interviewId) {
    return giveUidMessage(`That isn't a uid: it's only digits, like ${EXAMPLE_UID}.\n${UID_HELP}`, interviewId, noMentions());
}
/** The private reply while a submitted uid is being looked up. */
export function checkingReply() {
    return {
        content: "One moment, I'm still looking that up.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The modal in which a Member types their uid. */
export function uidModal(interviewId) {
    return {
        custom_id: interviewCustomId("modal", interviewId),
        title: "Your uid",
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.TextInput,
                        custom_id: "uid",
                        label: "Your uid",
                        style: TextInputStyle.Short,
                        min_length: 1,
                        max_length: 32,
                        placeholder: EXAMPLE_UID,
                    },
                ],
            },
        ],
    };
}
/** The card of a Player as text: name, uid with kingdom, and Alliance and rank, one line each. */
export function playerCardText(player) {
    return [
        escapeText(player.name),
        `uid ${escapeText(player.uid)} · Kingdom #${player.kingdom.toString()}`,
        allianceCardText(player),
    ].join("\n");
}
/** The thread message with the card of a found Player and the buttons to confirm or reject it. */
export function foundCardMessage(interviewId, player) {
    const content = `${playerCardText(player)}\nIs this you?`;
    return {
        content,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Success,
                        label: "That's me",
                        custom_id: interviewCustomId("confirm", interviewId),
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Danger,
                        label: "That's not me",
                        custom_id: interviewCustomId("reject", interviewId),
                    },
                ],
            },
        ],
        allowedMentions: noMentions(),
    };
}
/** The thread message that recommends the one free match: it greets the Member, and offers That's me or That's not me. */
export function recommendationMessage(interviewId, member, player) {
    return {
        content: `Welcome, <@${member}>! Is this you?\n${escapeText(player.name)}, Kingdom #${player.kingdom.toString()}, ${allianceCardText(player)}.`,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Success,
                        label: "That's me",
                        custom_id: interviewCustomId("accept", interviewId),
                    },
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Danger,
                        label: "That's not me",
                        custom_id: interviewCustomId("decline", interviewId),
                    },
                ],
            },
        ],
        allowedMentions: { users: [member] },
    };
}
/**
 * The thread message for an ambiguous name: one select menu of the matches, valued by their index, then None of these.
 * No uid is shown; the options are labelled Name · Kingdom #N.
 */
export function pickListMessage(interviewId, member, matches) {
    const options = matches.slice(0, PICK_LIST_MAX_OPTIONS).map((match, index) => ({
        label: optionLabel(`${match.name ?? "Unknown"} · Kingdom #${match.kingdom.toString()}`),
        value: index.toString(),
    }));
    return {
        content: `<@${member}>, which of these players is you?`,
        components: [
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.StringSelect,
                        custom_id: interviewCustomId("pick", interviewId),
                        options,
                    },
                ],
            },
            {
                type: ComponentType.ActionRow,
                components: [
                    {
                        type: ComponentType.Button,
                        style: ButtonStyle.Secondary,
                        label: "None of these",
                        custom_id: interviewCustomId("decline", interviewId),
                    },
                ],
            },
        ],
        allowedMentions: { users: [member] },
    };
}
/** The thread message that asks for the uid of the Player the Member chose from the pick list, with the help. */
export function askUidOfPlayerMessage(interviewId, name) {
    return giveUidMessage(`Now give me the uid of ${escapeText(name)}: press the button and enter it.\n${UID_HELP}`, interviewId, noMentions());
}
/** The thread message for a uid the Game does not know, with the attempts left. */
export function notFoundMessage(interviewId, uid, triesLeft) {
    const first = sentences(`I couldn't find a player with uid ${uid}. Check the number.`, triesLeftText(triesLeft));
    return giveUidMessage(`${first}\n${UID_HELP}`, interviewId, noMentions());
}
/** The thread message for a uid that already belongs to another Linked Member, with the attempts left. */
export function alreadyLinkedMessage(interviewId, triesLeft) {
    const content = sentences("That player is already linked to another member. If it's yours, an Officer can help.", triesLeftText(triesLeft));
    return giveUidMessage(content, interviewId, noMentions());
}
/** The thread message after a Member rejects the found card: try again, with the attempts left and the help. */
export function rejectedMessage(interviewId, triesLeft) {
    const first = sentences("Okay, let's try again.", triesLeftText(triesLeft));
    return giveUidMessage(`${first}\n${UID_HELP}`, interviewId, noMentions());
}
/** The thread message when the game tracker cannot answer. */
export function unavailableMessage(interviewId) {
    return giveUidMessage("The game tracker isn't answering right now. Try again in a few minutes.", interviewId, noMentions());
}
/** The thread message when the Daily Quota is spent: when lookups work again, and that Neil will ping then. */
export function quotaSpentMessage(resetsAt, now) {
    return {
        content: `I can't look players up again until ${utcTime(resetsAt)} (${timeLeft(resetsAt, now)}). I'll ping you here then.`,
        allowedMentions: noMentions(),
    };
}
/** The thread message when the Daily Quota resets: it pings the Member and asks for the uid again. */
export function quotaResetMessage(interviewId, member) {
    return giveUidMessage(`<@${member}>, I can look players up again.\n${askUid()}`, interviewId, { users: [member] });
}
/** The thread message when a Member is Linked: greets them by mention and names the Player. */
export function linkedMessage(member, player) {
    return {
        content: `Done, <@${member}>: you're linked to ${escapeText(player.name)} (uid ${escapeText(player.uid)}).`,
        allowedMentions: { users: [member] },
    };
}
/** The thread message that hands an Interview off to the Officers after five failed tries. */
export function handedOffMessage(member, officers) {
    const { moderatorRoleId, kingRoleId } = officers;
    return {
        content: `<@&${moderatorRoleId}> <@&${kingRoleId}>: <@${member}> couldn't be linked after 5 tries. Please help here.\n` +
            `An Officer will help you, <@${member}>. You can also start again later with /interview.`,
        allowedMentions: { users: [member], roles: [moderatorRoleId, kingRoleId] },
    };
}
/** The thread message when an Interview times out, naming how long the silence lasted. */
export function timedOutMessage(timeoutMs) {
    return {
        content: `No answer for ${durationText(timeoutMs)}, so this interview is closed. Run /interview to start again.`,
        allowedMentions: noMentions(),
    };
}
/** The thread message when the Member left the server; the username is escaped. */
export function leftMessage(username) {
    return {
        content: `${escapeText(username)} left the server; this interview is closed.`,
        allowedMentions: noMentions(),
    };
}
/** The private reply to a button press on an Interview that belongs to someone else. */
export function buttonOfSomeoneElseReply() {
    return {
        content: "This interview belongs to someone else.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The private reply when a press or submit failed before it was acknowledged: the Member may try again. */
export function somethingWentWrongReply() {
    return {
        content: "Something went wrong. Please try again, or ask an Officer.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The private reply to a button press on an Interview that has ended. */
export function interviewEndedReply() {
    return {
        content: "This interview has ended. Run /interview to start a new one.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The Rank Approval's question: it pings the leader's Member, or the Officers, and offers the rank buttons. */
export function rankAskedMessage(approval, player, officers) {
    const question = `the tracker shows no rank for ${escapeText(player.name)} in ${allianceTagText(player)}`;
    const { approver } = approval;
    const content = approver.kind === "member"
        ? `<@${approver.memberId}>, ${question}. Which rank do they have?`
        : `<@&${officers.moderatorRoleId}> <@&${officers.kingRoleId}>: ${question}, and their R5 isn't linked here. Which rank do they have?`;
    const allowedMentions = approver.kind === "member"
        ? { users: [approver.memberId] }
        : { roles: [officers.moderatorRoleId, officers.kingRoleId] };
    return {
        content,
        components: [
            {
                type: ComponentType.ActionRow,
                components: APPROVABLE_RANKS.map((rank) => ({
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: rank,
                    custom_id: rankCustomId(approval.id, rank),
                })),
            },
        ],
        allowedMentions,
    };
}
/** The thread message once a rank is approved: it names the approver, the Linked Member and the rank; only the approver is pinged. */
export function rankApprovedMessage(approval) {
    return {
        content: `<@${approval.approvedBy}> set <@${approval.linkedMemberId}>'s rank to ${approval.rank}.`,
        allowedMentions: { users: [approval.approvedBy] },
    };
}
/** The private reply to a rank button pressed by someone who may not approve it. */
export function rankNotAllowedReply() {
    return {
        content: "You can't approve this rank.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: noMentions(),
    };
}
/** The thread message when a Rank Approval is cancelled because the Member left; the username is escaped. */
export function rankCancelledLeftMessage(username) {
    return {
        content: `${escapeText(username)} left the server; the rank approval is cancelled.`,
        allowedMentions: noMentions(),
    };
}
/** The start of a Link's log line: the Member, the Player and the Alliance. */
function linkLogBase(member, player) {
    const alliance = player.alliance === undefined
        ? "no alliance"
        : `[${escapeText(player.alliance.tag)}], ${rankText(player.allianceRank)}`;
    return `🔗 <@${member}> linked to ${escapeText(player.name)} (uid ${escapeText(player.uid)}, #${player.kingdom.toString()}, ${alliance}).`;
}
/** The log line for a Link; it pings the Alliance's leader's Member only when given. */
export function linkLogLine(member, player, leaderMemberId) {
    const base = linkLogBase(member, player);
    if (leaderMemberId === undefined)
        return { content: base, allowedMentions: noMentions() };
    return { content: `${base} <@${leaderMemberId}>`, allowedMentions: { users: [leaderMemberId] } };
}
/** The log line for an Officer Link: the Link's line, then the Officer who made it. */
export function officerLinkLogLine(member, player, officerId) {
    return {
        content: `${linkLogBase(member, player)} Made by <@${officerId}>.`,
        allowedMentions: { users: [officerId] },
    };
}
/** The log line for a uid that was already Linked to another Member. */
export function refusedLogLine(member, uid) {
    return {
        content: `⛔ <@${member}> gave uid ${escapeText(uid)}, which is already linked.`,
        allowedMentions: noMentions(),
    };
}
/** The log line for an Interview handed off to the Officers. */
export function handedOffLogLine(member, threadId) {
    return {
        content: `🙋 <@${member}> was handed off after 5 failed tries: <#${threadId}>.`,
        allowedMentions: noMentions(),
    };
}
const ABANDONED_REASON_TEXT = { "timed-out": "timed out", left: "left" };
/** The log line for an Interview that closed without a Link: it timed out, or the Member left. */
export function abandonedLogLine(member, reason) {
    return {
        content: `💤 <@${member}>'s interview closed (${ABANDONED_REASON_TEXT[reason]}).`,
        allowedMentions: noMentions(),
    };
}
/** The log line for a rank set by an approver. */
export function rankSetLogLine(approver, member, rank) {
    return {
        content: `🎖️ <@${approver}> set <@${member}>'s rank to ${rank}.`,
        allowedMentions: noMentions(),
    };
}
/** The log line for a Rank Approval cancelled because the Member left. */
export function rankCancelledLogLine(member) {
    return {
        content: `🎖️ Rank approval for <@${member}> cancelled (left).`,
        allowedMentions: noMentions(),
    };
}
//# sourceMappingURL=interview-texts.js.map