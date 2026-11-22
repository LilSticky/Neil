import { splitBetweenLines } from "./nap-motion-texts.js";
/** The channels whose posts are Feedback Posts, by name. */
export const FEEDBACK_CHANNELS = ["feedback", "suggestions"];
/** The Feedback Template as Neil pins it in each feedback channel: a heading, the template, and how to use it. */
export const FEEDBACK_TEMPLATE = [
    "How to give feedback Neil can act on",
    "```text",
    "Type: Bug | Idea",
    "Where: <command, button or channel, e.g. /player or #alliance-chat>",
    "What happened: <Bug: what Neil did>",
    "Expected: <Bug: what it should have done>",
    "What: <Idea: what Neil should do, and for whom>",
    "Steps: <optional: how to make it happen again>",
    "```",
    "Post one bug or idea per message.",
].join("\n");
/** The entry for a Feedback Post in #neil-log, as one or more message contents of at most 2000 characters. */
export function feedbackEntry(post) {
    const where = post.threadName === undefined ? `#${post.channelName}` : `#${post.channelName} › ${post.threadName}`;
    const lines = [`Feedback Post in ${where} by ${post.memberName}:`];
    if (post.text === "")
        lines.push("(no text)");
    else
        lines.push(...post.text.split("\n"));
    if (post.stickerNames.length > 0)
        lines.push(`Stickers: ${post.stickerNames.join(", ")}`);
    if (post.hasEmbeds)
        lines.push("The post has embeds.");
    for (const url of post.attachmentUrls)
        lines.push(`Attachment: ${url}`);
    lines.push(`Jump: ${post.jumpLink}`);
    return splitBetweenLines(lines);
}
/** The #neil-log line for a feedback channel that is missing from the guild: its template is not pinned. */
export function missingChannelLine(channelName) {
    return `#${channelName} is missing, so Neil could not pin the Feedback Template there.`;
}
/** The #neil-log line for a Feedback Template that Neil could not post or pin in a feedback channel. */
export function pinFailedLine(channelName) {
    return `Neil could not pin the Feedback Template in #${channelName}.`;
}
/** The #neil-log line for a Feedback Post whose entry is logged but which could not be reacted to. */
export function reactionFailedLine(emoji, jumpLink) {
    return `Neil could not react ${emoji} to the Feedback Post at ${jumpLink}; its entry is logged above.`;
}
/** The #neil-log line after only the first parts of an entry could be logged: the entry above is incomplete. */
export function incompleteEntryLine(jumpLink) {
    return `The entry above is incomplete: Neil could not log the rest of the Feedback Post at ${jumpLink}.`;
}
//# sourceMappingURL=feedback-texts.js.map