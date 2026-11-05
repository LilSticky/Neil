/** What joins the usage line to the rest of a footer or of a text. */
export const USAGE_SEPARATOR = " · ";
/**
 * The usage line a lookup's answer ends with: the requests the Member made today against the Daily Allowance, or for an
 * Officer, the requests alone, since an Officer is not limited.
 */
export function usageLine({ used, allowance, officer }) {
    const count = used.toString();
    return officer
        ? `${count} Game API requests used today${USAGE_SEPARATOR}Officers are not limited${USAGE_SEPARATOR}cached answers are free${USAGE_SEPARATOR}resets 00:00 UTC`
        : `${count} of ${allowance.toString()} Game API requests used today${USAGE_SEPARATOR}cached answers are free${USAGE_SEPARATOR}resets 00:00 UTC`;
}
/**
 * Adds the usage line to a reply: last in the footer of its first embed, or at the end of the text when it has no embed.
 * The message it is given is not changed.
 */
export function withUsage(message, line) {
    const [first, ...rest] = message.embeds ?? [];
    if (first !== undefined) {
        const footer = first.footer?.text;
        const text = footer === undefined ? line : `${footer}${USAGE_SEPARATOR}${line}`;
        return { ...message, embeds: [{ ...first, footer: { ...first.footer, text } }, ...rest] };
    }
    const content = message.content;
    return { ...message, content: content === undefined ? line : `${content}\n${line}` };
}
//# sourceMappingURL=usage-line.js.map