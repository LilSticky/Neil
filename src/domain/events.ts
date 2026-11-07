import { parseAllianceKey, type AllianceKey } from "./lookup-input.js";
import type { AllianceRank } from "./player.js";

/** Who owns an Event: an Alliance by its tag, or the whole Home Kingdom. */
export type EventOwner = { readonly kind: "alliance"; readonly tag: AllianceKey } | { readonly kind: "kingdom" };

/** An Event's Alliance tag is the text in brackets at the very start of its name, e.g. "[NML] Hive move". */
const LEADING_TAG_PATTERN = /^\[([^\]]*)\]/;

/** Who owns an Event, read from its Discord event's name. A bracketed tag that is not at the start does not count. */
export function eventOwnerOf(name: string): EventOwner {
  const match = LEADING_TAG_PATTERN.exec(name);
  if (match === null) return { kind: "kingdom" };
  const tag = parseAllianceKey(match[1] ?? "");
  return tag.ok ? { kind: "alliance", tag: tag.value } : { kind: "kingdom" };
}

/** At most this many lead times in one Event Kind. */
const MAX_LEAD_TIMES = 3;
/** The shortest lead time, in minutes: one minute. */
const MIN_LEAD_MINUTES = 1;
/** The longest lead time, in minutes: seven days. */
const MAX_LEAD_MINUTES = 7 * 24 * 60;

const MINUTES_PER_UNIT = { m: 1, h: 60, d: 24 * 60 } as const;
const LEAD_TIME_PATTERN = /^(\d+)([mhd])$/;

export type LeadTimesRefusal = "unreadable" | "too-many" | "out-of-range";

export type LeadTimesResult =
  | { readonly ok: true; readonly value: readonly number[] }
  | { readonly ok: false; readonly reason: LeadTimesRefusal };

/** Reads a comma-separated list of lead times such as "24h, 1h, 10m" or "2d" as minutes, in the order written. */
export function parseLeadTimes(text: string): LeadTimesResult {
  const items = text.split(",").map((item) => item.trim());
  const minutes: number[] = [];
  for (const item of items) {
    const match = LEAD_TIME_PATTERN.exec(item);
    if (match === null) return { ok: false, reason: "unreadable" };
    const unit = match[2] as keyof typeof MINUTES_PER_UNIT;
    minutes.push(Number(match[1]) * MINUTES_PER_UNIT[unit]);
  }
  if (minutes.length > MAX_LEAD_TIMES) return { ok: false, reason: "too-many" };
  if (minutes.some((value) => value < MIN_LEAD_MINUTES || value > MAX_LEAD_MINUTES)) {
    return { ok: false, reason: "out-of-range" };
  }
  return { ok: true, value: minutes };
}

/** What a reminder is about: the start of the Event, or its Sign-up Deadline. */
export type ReminderTarget = "start" | "signup";

/** A reminder already sent for one Event: its target and how many minutes before that target it went out. */
export interface SentReminder {
  readonly target: ReminderTarget;
  readonly leadMinutes: number;
}

/** Who keeps an Event Kind: "kingdom" for the Home Kingdom, or an Alliance's tag. */
export type EventKindOwner = string;

/**
 * An Event Kind: a name matched in an Event's name, the lead times (minutes) of its start reminders, and its Sign-up
 * Deadline as minutes before the start (undefined when it has none, and then it has no Sign-up reminders).
 */
export interface EventKind {
  readonly name: string;
  readonly beforeStart: readonly number[];
  readonly signupOffsetMinutes: number | undefined;
  readonly beforeSignup: readonly number[];
}

/** An Event's status as Neil knows it: Discord's four states, or "deleted" once the Discord event is gone. */
export type EventStatus = "scheduled" | "active" | "completed" | "cancelled" | "deleted";

/** The Member who created an Event: their Alliance Link (tag and rank) if any, and whether they are an Officer. */
export interface EventCreator {
  readonly alliance: { readonly tag: AllianceKey; readonly rank: AllianceRank } | undefined;
  readonly officer: boolean;
}

/** Officers may act on any Event. An Alliance Event also allows that Alliance's R4 and R5; a Kingdom Event does not. */
export function mayActOnEvent(owner: EventOwner, creator: EventCreator | undefined): boolean {
  if (creator === undefined) return false;
  if (creator.officer) return true;
  if (owner.kind === "kingdom" || creator.alliance === undefined) return false;
  return creator.alliance.tag === owner.tag && (creator.alliance.rank === "R4" || creator.alliance.rank === "R5");
}

/** The Event Kind whose name appears in the Event's name, ignoring case; the longest name wins. */
export function kindForEventName(kinds: readonly EventKind[], eventName: string): EventKind | undefined {
  const lowerName = eventName.toLowerCase();
  let best: EventKind | undefined;
  for (const kind of kinds) {
    if (!lowerName.includes(kind.name.toLowerCase())) continue;
    if (best === undefined || kind.name.length > best.name.length) best = kind;
  }
  return best;
}

/** A reminder with no Event Kind: one reminder 30 minutes before the start. */
const DEFAULT_START_LEAD_MINUTES = 30;
const MINUTE_MS = 60_000;

/** The reminders to send now, and those to record as sent without sending (collapsed into a shorter one). */
export interface ReminderPlan {
  readonly send: readonly SentReminder[];
  readonly record: readonly SentReminder[];
}

/** The lead times of one target, and the moment that target is. */
interface ReminderOffer {
  readonly target: ReminderTarget;
  readonly targetAt: Date;
  readonly leads: readonly number[];
}

function minutesBefore(at: Date, minutes: number): Date {
  return new Date(at.getTime() - minutes * MINUTE_MS);
}

function offersFor(start: Date, kind: EventKind | undefined): readonly ReminderOffer[] {
  if (kind === undefined) {
    return [{ target: "start", targetAt: start, leads: [DEFAULT_START_LEAD_MINUTES] }];
  }
  const offers: ReminderOffer[] = [{ target: "start", targetAt: start, leads: kind.beforeStart }];
  if (kind.signupOffsetMinutes !== undefined) {
    offers.push({
      target: "signup",
      targetAt: minutesBefore(start, kind.signupOffsetMinutes),
      leads: kind.beforeSignup,
    });
  }
  return offers;
}

/**
 * Which reminders of an Event are due at `now`. A reminder is due once `now` has passed its target minus its lead time,
 * and it is skipped when that moment is before `firstSeenAt`, when its target has passed, or when the Event is
 * cancelled, completed or deleted. Several due reminders for one target collapse into the shortest lead time.
 */
export function dueReminders(
  start: Date,
  status: EventStatus,
  kind: EventKind | undefined,
  sent: readonly SentReminder[],
  firstSeenAt: Date,
  now: Date,
): ReminderPlan {
  if (status === "cancelled" || status === "completed" || status === "deleted") {
    return { send: [], record: [] };
  }
  const send: SentReminder[] = [];
  const record: SentReminder[] = [];
  for (const offer of offersFor(start, kind)) {
    if (now.getTime() >= offer.targetAt.getTime()) continue;
    const due = offer.leads
      .filter((leadMinutes) => !sent.some((done) => done.target === offer.target && done.leadMinutes === leadMinutes))
      .filter((leadMinutes) => {
        const dueAt = minutesBefore(offer.targetAt, leadMinutes);
        return dueAt.getTime() <= now.getTime() && dueAt.getTime() >= firstSeenAt.getTime();
      })
      .sort((a, b) => a - b)
      .map((leadMinutes): SentReminder => ({ target: offer.target, leadMinutes }));
    const [shortest, ...others] = due;
    if (shortest !== undefined) send.push(shortest);
    record.push(...others);
  }
  return { send, record };
}
