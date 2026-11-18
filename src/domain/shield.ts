import type { EventKind } from "./events.js";
import type { MemberId } from "./rank-approval.js";
import { serverDatePlusDays, serverDayOf, serverTimeInstant } from "./server-time.js";

/**
 * Shield Reminders (slice 045): in a KvK Week, Neil reminds the Members of each Home Kingdom Alliance to shield before
 * the Shield Deadline, Friday's reset. The Game API cannot tell whether a city is shielded, so a Member confirms it.
 */

/** The name of the built-in kingdom Event Kind whose lead times the Shield Reminders use. */
export const SHIELD_KIND_NAME = "Shield";

/** The lead times of the Shield Reminders, in minutes, while the kingdom has no Shield kind: 12h, 4h and 1h. */
export const SHIELD_LEAD_MINUTES: readonly number[] = [720, 240, 60];

/** A KvK Week, by the Server Time date (YYYY-MM-DD) of the Saturday its Shield Deadline falls on. */
export type ShieldWeek = string;

const SATURDAY = 6;
const DAYS_PER_WEEK = 7;
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The Shield Deadline next after the moment: Saturday 00:00 Server Time (02:00 UTC), Friday's reset. */
export function shieldDeadlineOf(now: Date): Date {
  const today = serverDayOf(now);
  const daysAhead = (SATURDAY - today.weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const candidate = serverTimeInstant(serverDatePlusDays(today.date, daysAhead), 0);
  if (candidate.getTime() > now.getTime()) return candidate;
  return serverTimeInstant(serverDatePlusDays(today.date, daysAhead + DAYS_PER_WEEK), 0);
}

/** The week of a Shield Deadline: the date of its Saturday in Server Time. */
export function shieldWeekOf(deadline: Date): ShieldWeek {
  return serverDayOf(deadline).date;
}

/** Whether a text reads as a week, YYYY-MM-DD, a Saturday in Server Time. */
export function isShieldWeek(text: string): text is ShieldWeek {
  if (!WEEK_PATTERN.test(text)) return false;
  const deadline = serverTimeInstant(text, 0);
  return !Number.isNaN(deadline.getTime()) && shieldWeekOf(deadline) === text && serverDayOf(deadline).weekday === SATURDAY;
}

/** The Shield Deadline of a week: its Saturday at 00:00 Server Time. */
export function deadlineOfWeek(week: ShieldWeek): Date {
  return serverTimeInstant(week, 0);
}

/** The start of a week: the Sunday 00:00 Server Time before its Shield Deadline. Lead times before it are never sent. */
export function weekStartOf(week: ShieldWeek): Date {
  return serverTimeInstant(serverDatePlusDays(week, 1 - DAYS_PER_WEEK), 0);
}

/** The lead times of the Shield Reminders: those of the kingdom's Shield kind (any case), else the defaults. */
export function shieldLeadMinutesOf(kingdomKinds: readonly EventKind[]): readonly number[] {
  const kind = kingdomKinds.find((candidate) => candidate.name.toLowerCase() === SHIELD_KIND_NAME.toLowerCase());
  return kind === undefined || kind.beforeStart.length === 0 ? SHIELD_LEAD_MINUTES : kind.beforeStart;
}

/** The Shield kind as an Event Kind, for the reminder plan: its lead times before the deadline, no Sign-up Deadline. */
export function shieldKindOf(leadMinutes: readonly number[]): EventKind {
  return { name: SHIELD_KIND_NAME, beforeStart: leadMinutes, signupOffsetMinutes: undefined, beforeSignup: [] };
}

/** Where an Alliance stands before the Shield Deadline: who to remind, who switched reminders off, and the counts. */
export interface ShieldStanding {
  /** The Members to mention: not confirmed, reminders on. */
  readonly toRemind: readonly MemberId[];
  /** The Members who have not confirmed and have Shield Reminders Off. */
  readonly remindersOff: readonly MemberId[];
  readonly confirmed: number;
  readonly total: number;
}

/** The standing of an Alliance from its Linked Members, the week's Shield Confirmations and the Shield Reminders Off. */
export function shieldStandingOf(
  members: readonly MemberId[],
  confirmed: ReadonlySet<MemberId>,
  remindersOff: ReadonlySet<MemberId>,
): ShieldStanding {
  const unique = [...new Set(members)];
  const open = unique.filter((member) => !confirmed.has(member));
  return {
    toRemind: open.filter((member) => !remindersOff.has(member)),
    remindersOff: open.filter((member) => remindersOff.has(member)),
    confirmed: unique.length - open.length,
    total: unique.length,
  };
}
