import { escapeMarkdown } from "discord.js";
/** The part of an Unlink's log line that says why it happened. */
function reasonText(reason) {
    if (reason === "left")
        return "left the server";
    if (reason === "missing")
        return "is not on the server";
    if (reason === "self")
        return "unlinked themselves";
    return `was Unlinked by <@${reason.officerId}>`;
}
/**
 * The log line of an Unlink: the Member, the uid, the nickname Neil had given them when it had given one, and the
 * steps Discord did not let Neil take (by role name, or "nickname").
 */
export function unlinkedLogLine(memberId, uid, nickname, reason, notChanged = []) {
    const nicknamePart = nickname === undefined ? "" : `, nickname ${escapeMarkdown(nickname)}`;
    const notChangedPart = notChanged.length === 0 ? "" : `, not changed: ${notChanged.map((name) => escapeMarkdown(name)).join(", ")}`;
    return {
        content: `🔓 <@${memberId}> ${reasonText(reason)}: Link to uid ${uid} ended${nicknamePart}${notChangedPart}.`,
        allowedMentions: { parse: [] },
    };
}
/** The private message to a Member whose Link ended when they left or were found missing; Discord may refuse it. */
export function unlinkedPrivateMessage() {
    return {
        content: "Your Link has ended, since you are no longer on the Last Asylum: Plague server. " +
            "If you come back, you will go through a new Onboarding Interview.",
        allowedMentions: { parse: [] },
    };
}
/** The private message to a Member an Officer Unlinked; Discord may refuse it. */
export function unlinkedByOfficerPrivateMessage() {
    return {
        content: "An Officer has ended your Link to the Last Asylum: Plague server. " +
            "To be linked again, run /interview in the server.",
        allowedMentions: { parse: [] },
    };
}
/** The message in a Rank Approval's thread when the Link it is for ended by an Unlink of the Member themselves or by an Officer. */
export function rankCancelledByUnlinkMessage() {
    return {
        content: "The Link this Rank Approval is for has ended, so the rank approval is cancelled.",
        allowedMentions: { parse: [] },
    };
}
/** The message in a Rank Approval's thread once it went to the Officers; it pings the Officer roles. */
export function rankHandedToOfficersMessage(officers) {
    const { moderatorRoleId, kingRoleId } = officers;
    return {
        content: `<@&${moderatorRoleId}> <@&${kingRoleId}>: the Member who was to approve this Rank Approval has left the server, ` +
            "so the Officers approve it now.",
        allowedMentions: { roles: [moderatorRoleId, kingRoleId] },
    };
}
//# sourceMappingURL=unlink-texts.js.map