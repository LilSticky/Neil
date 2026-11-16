/** What Neil posts before a Royal City siege: the two Handover Reminders and the next-holder announcement. */
export type HandoverPostKind = "reminder-24h" | "reminder-1h" | "announcement";

const HOUR_MS = 60 * 60_000;

/** A Handover Reminder and how long before the Royal City siege it is due. */
export interface HandoverReminderLead {
  readonly kind: "reminder-24h" | "reminder-1h";
  readonly leadMs: number;
}

/** The Handover Reminders, 24 hours and 1 hour before the Royal City siege; the announcement goes with the first. */
export const HANDOVER_REMINDER_LEADS: readonly [HandoverReminderLead, HandoverReminderLead] = [
  { kind: "reminder-24h", leadMs: 24 * HOUR_MS },
  { kind: "reminder-1h", leadMs: HOUR_MS },
];

/** Every kind of Handover post, in the order Neil sends them. */
export const HANDOVER_POST_KINDS: readonly HandoverPostKind[] = ["reminder-24h", "announcement", "reminder-1h"];

/** What is due for one Royal City siege now: the posts to send, and the posts overtaken and dropped. */
export interface DueHandoverPosts {
  readonly post: readonly HandoverPostKind[];
  readonly drop: readonly HandoverPostKind[];
}

/**
 * The posts due for the Royal City siege at this moment. Nothing is due before the 24-hour mark or from the siege on.
 * A post not sent yet is due once its moment has come (late, if Neil was off then); the announcement goes with the
 * 24-hour reminder, or late until the siege. A 24-hour reminder not sent by the 1-hour mark is dropped.
 */
export function dueHandoverPosts(siege: Date, sent: ReadonlySet<HandoverPostKind>, now: Date): DueHandoverPosts {
  const [first, last] = HANDOVER_REMINDER_LEADS;
  const at = now.getTime();
  const siegeAt = siege.getTime();
  if (at >= siegeAt || at < siegeAt - first.leadMs) return { post: [], drop: [] };

  const post: HandoverPostKind[] = [];
  const drop: HandoverPostKind[] = [];
  const lastDue = at >= siegeAt - last.leadMs;
  if (!sent.has(first.kind)) (lastDue ? drop : post).push(first.kind);
  if (lastDue && !sent.has(last.kind)) post.push(last.kind);
  if (!sent.has("announcement")) post.push("announcement");
  return { post, drop };
}
