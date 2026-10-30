/** A UTC calendar day as "YYYY-MM-DD". Only utcDayOf makes one. */
export type UtcDay = string & { readonly __brand: "UtcDay" };

/** The Daily Quota of Game API requests that Neil counts for one UTC day. */
export interface DailyQuota {
  readonly day: UtcDay;
  readonly used: number;
  readonly limit: number;
  readonly limitReached: boolean;
  readonly confirmedAt: Date | undefined;
}

/** The limit assumed until the Game API reports one. */
export const DEFAULT_LIMIT = 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The UTC day a moment falls on. */
export function utcDayOf(now: Date): UtcDay {
  return now.toISOString().slice(0, 10) as UtcDay;
}

/** The next 00:00 UTC strictly after a moment. */
export function nextReset(now: Date): Date {
  const startOfDay = Date.parse(`${utcDayOf(now)}T00:00:00Z`);
  return new Date(startOfDay + MS_PER_DAY);
}

/** The quota for today: the stored one if it is from today, otherwise a fresh one keeping only the limit. */
export function todaysQuota(stored: DailyQuota | undefined, now: Date): DailyQuota {
  const day = utcDayOf(now);
  if (stored !== undefined && stored.day === day) return stored;
  return { day, used: 0, limit: stored?.limit ?? DEFAULT_LIMIT, limitReached: false, confirmedAt: undefined };
}

/** Whether Neil may send another Game API request today. */
export function canSend(q: DailyQuota): boolean {
  return !q.limitReached && q.used < q.limit;
}

/** Counts one request sent today. Call only when canSend is true. */
export function countRequest(q: DailyQuota): DailyQuota {
  return { ...q, used: q.used + 1 };
}

/** Takes the Game API's figures as the truth, plus the requests still in flight that it cannot know about. */
export function adoptReported(
  q: DailyQuota,
  reported: { readonly used: number; readonly limit: number },
  inFlight: number,
  now: Date,
): DailyQuota {
  return { ...q, used: reported.used + inFlight, limit: reported.limit, confirmedAt: now };
}

/** Records that the Game API refused a request because today's limit is spent. */
export function markLimitReached(q: DailyQuota, now: Date): DailyQuota {
  return { ...q, limitReached: true, confirmedAt: now };
}

/** Requests left today, never below 0. */
export function remaining(q: DailyQuota): number {
  return Math.max(0, q.limit - q.used);
}
