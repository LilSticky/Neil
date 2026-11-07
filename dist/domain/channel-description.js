/** Starts every description message; Neil finds its own description by it (research R3). */
export const PIN_MARK = "📌";
const NO_POSTS = "read only";
/**
 * Describes a channel from its wanted overwrites (research R5). `hidden` are the targets Neil never names as seers
 * (Neil itself and the external roles).
 */
export function describeChannel(channel, overwrites, hidden) {
    const topic = channel.type === "voice" ? undefined : channel.description;
    if (channel.type === "forum")
        return { topic, message: undefined };
    const seers = overwrites.filter((overwrite) => isSeer(overwrite, hidden)).map((overwrite) => overwrite.target);
    const posters = overwrites
        .filter((overwrite) => overwrite.allow.includes("SendMessages") || (isSeer(overwrite, hidden) && !overwrite.deny.includes("SendMessages")))
        .map((overwrite) => overwrite.target);
    const lines = [`${PIN_MARK} **#${channel.name}**`, channel.description, "", `👀 Seen by: ${seers.join(", ")}`];
    if (channel.type !== "voice")
        lines.push(`✍️ Posts: ${posters.length > 0 ? posters.join(", ") : NO_POSTS}`);
    if (channel.codeOfConduct !== undefined && channel.codeOfConduct.length > 0)
        lines.push("", ...channel.codeOfConduct);
    return { topic, message: lines.join("\n") };
}
function isSeer(overwrite, hidden) {
    return overwrite.allow.includes("ViewChannel") && !hidden.has(overwrite.target);
}
//# sourceMappingURL=channel-description.js.map