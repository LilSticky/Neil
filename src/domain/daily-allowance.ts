import { utcDayOf, type UtcDay } from "./daily-quota.js";

/** How many Lookup Members a UTC day had, as recorded once that day is over. */
export interface LookupMemberRecord {
  readonly day: UtcDay;
  readonly lookupMembers: number;
}

/** The fewest Lookup Members expected: the floor under the average, and the expectation with no history. */
const MINIMUM_EXPECTED_LOOKUP_MEMBERS = 100;

/** How many earlier same-weekday records the expectation averages. */
const SAMPLE_SIZE = 4;

/** How many days the usage history keeps. */
const MAX_DAYS_TO_RECORD = 28;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The day shifted by a number of days, negative for earlier. */
function shiftDays(day: UtcDay, days: number): UtcDay {
  return utcDayOf(new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY));
}

/** The weekday of a UTC day, 0 for Sunday to 6 for Saturday. */
function weekdayOf(day: UtcDay): number {
  return new Date(Date.parse(`${day}T00:00:00Z`)).getUTCDay();
}

/**
 * The Lookup Members expected on a day: the average of the latest four records on the same weekday before it, not
 * rounded, but never below 100. 100 as well when there are no such records.
 */
export function expectedLookupMembers(records: readonly LookupMemberRecord[], day: UtcDay): number {
  const weekday = weekdayOf(day);
  const sample = records
    .filter((record) => record.day < day && weekdayOf(record.day) === weekday)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
    .slice(0, SAMPLE_SIZE);
  if (sample.length === 0) return MINIMUM_EXPECTED_LOOKUP_MEMBERS;
  const average = sample.reduce((sum, record) => sum + record.lookupMembers, 0) / sample.length;
  return Math.max(MINIMUM_EXPECTED_LOOKUP_MEMBERS, average);
}

/**
 * The Daily Allowance: how many Game API requests a Member's lookups may cause in a UTC day. The Daily Quota's limit,
 * less the Quota Reserve and the Sync Share, divided by Expected Lookup Members, rounded down and never below 1.
 */
export function dailyAllowance(input: {
  readonly limit: number;
  readonly reserve: number;
  readonly syncShare: number;
  readonly expected: number;
}): number {
  const budget = input.limit - input.reserve - input.syncShare;
  return Math.max(1, Math.floor(budget / input.expected));
}

/** Whether a Member's lookup may cause another request: an Officer always may, a Member while below the allowance. */
export function mayUse(used: number, allowance: number, officer: boolean): boolean {
  return officer || used < allowance;
}

/**
 * The UTC days whose Lookup Members must be recorded before today: the days after the latest record, or from the first
 * usage day when nothing is recorded, through yesterday. At most the latest 28 days.
 */
export function daysToRecord(
  lastRecorded: UtcDay | undefined,
  firstUsage: UtcDay | undefined,
  today: UtcDay,
): UtcDay[] {
  const yesterday = shiftDays(today, -1);
  const first = lastRecorded !== undefined ? shiftDays(lastRecorded, 1) : firstUsage;
  if (first === undefined) return [];
  const earliest = shiftDays(yesterday, -(MAX_DAYS_TO_RECORD - 1));
  const from = first > earliest ? first : earliest;
  const days: UtcDay[] = [];
  for (let day = from; day <= yesterday; day = shiftDays(day, 1)) {
    days.push(day);
  }
  return days;
}
