const HOUR_MS = 60 * 60_000;
/** The Handover Reminders, 24 hours and 1 hour before the Royal City siege; the announcement goes with the first. */
export const HANDOVER_REMINDER_LEADS = [
    { kind: "reminder-24h", leadMs: 24 * HOUR_MS },
    { kind: "reminder-1h", leadMs: HOUR_MS },
];
/** Every kind of Handover post, in the order Neil sends them. */
export const HANDOVER_POST_KINDS = ["reminder-24h", "announcement", "reminder-1h"];
/**
 * The posts due for the Royal City siege at this moment. Nothing is due before the 24-hour mark or from the siege on.
 * A post not sent yet is due once its moment has come (late, if Neil was off then); the announcement goes with the
 * 24-hour reminder, or late until the siege. A 24-hour reminder not sent by the 1-hour mark is dropped.
 */
export function dueHandoverPosts(siege, sent, now) {
    const [first, last] = HANDOVER_REMINDER_LEADS;
    const at = now.getTime();
    const siegeAt = siege.getTime();
    if (at >= siegeAt || at < siegeAt - first.leadMs)
        return { post: [], drop: [] };
    const post = [];
    const drop = [];
    const lastDue = at >= siegeAt - last.leadMs;
    if (!sent.has(first.kind))
        (lastDue ? drop : post).push(first.kind);
    if (lastDue && !sent.has(last.kind))
        post.push(last.kind);
    if (!sent.has("announcement"))
        post.push("announcement");
    return { post, drop };
}
//# sourceMappingURL=handover.js.map