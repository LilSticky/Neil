import { nextServerReset, serverDayOf } from "./server-time.js";

/** A day of the Alliance Duel, Monday to Saturday in Server Time. Sunday has none. */
export type DuelDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

/** The Duel Plan of one Duel day: what scores today, and what to save for a later day. */
export interface DuelPlanEntry {
  readonly scores: string;
  readonly save: string;
}

/** The Duel Plan: one entry for each of the six Duel days, so a missing day does not compile. */
export type DuelPlan = Readonly<Record<DuelDay, DuelPlanEntry>>;

/** The Duel days by Server Time weekday, 0 for Sunday, which has none. */
const DUEL_DAYS_BY_WEEKDAY: readonly (DuelDay | undefined)[] = [
  undefined,
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** The Duel day the moment falls on in Server Time, or undefined on a Sunday. */
export function duelDayOf(now: Date): DuelDay | undefined {
  return DUEL_DAYS_BY_WEEKDAY[serverDayOf(now).weekday];
}

/** The next daily reset that starts a Duel day: the Sunday reset is skipped. */
export function nextDuelReset(now: Date): Date {
  const reset = nextServerReset(now);
  return duelDayOf(reset) === undefined ? nextServerReset(reset) : reset;
}
