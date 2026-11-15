/**
 * Discord timestamps: `<t:UNIX:STYLE>` renders in each reader's own time zone. They work in message content, embed
 * descriptions and field values, not in titles, footers, author names, field names or component labels.
 */

/** The styles of a Discord timestamp: short/long time, short/long date, short/long date and time, relative. */
export type TimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

/** Discord's Unix seconds for a moment, as <t:…> takes them. */
export function unixOf(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

/** A moment as a Discord timestamp in the given style. */
export function timestamp(moment: Date, style: TimestampStyle): string {
  return `<t:${unixOf(moment)}:${style}>`;
}
