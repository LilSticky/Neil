/**
 * Discord timestamps: `<t:UNIX:STYLE>` renders in each reader's own time zone. They work in message content, embed
 * descriptions and field values, not in titles, footers, author names, field names or component labels.
 */
/** Discord's Unix seconds for a moment, as <t:…> takes them. */
export function unixOf(moment) {
    return Math.floor(moment.getTime() / 1000).toString();
}
/** A moment as a Discord timestamp in the given style. */
export function timestamp(moment, style) {
    return `<t:${unixOf(moment)}:${style}>`;
}
//# sourceMappingURL=timestamps.js.map