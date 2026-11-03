import { escapeMarkdown } from "discord.js";
const REASON_TEXT = {
    left: "left the server",
    missing: "is not on the server",
};
/** The log line of an Unlink: the Member, the uid, and the nickname Neil had given them when it had given one. */
export function unlinkedLogLine(memberId, uid, nickname, reason) {
    const nicknamePart = nickname === undefined ? "" : `, nickname ${escapeMarkdown(nickname)}`;
    return {
        content: `🔓 <@${memberId}> ${REASON_TEXT[reason]}: Link to uid ${uid} ended${nicknamePart}.`,
        allowedMentions: { parse: [] },
    };
}
/** The private message to a Member whose Link ended; Discord may refuse it. */
export function unlinkedPrivateMessage() {
    return {
        content: "Your Link has ended, since you are no longer on the Last Asylum: Plague server. " +
            "If you come back, you will go through a new Onboarding Interview.",
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