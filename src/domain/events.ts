import { parseAllianceKey, type AllianceKey } from "./lookup-input.js";

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
