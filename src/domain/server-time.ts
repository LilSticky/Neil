/**
 * Server Time: the game's clock, UTC-2. The game's daily reset is at 00:00 Server Time, which is 02:00 UTC. This is the
 * only place the offset is written down. The offset never changes: the game has no daylight saving (confirmed by the
 * user 2026-11-15).
 */
export const SERVER_TIME_OFFSET_MINUTES = -120;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const OFFSET_MS = SERVER_TIME_OFFSET_MINUTES * MINUTE_MS;

/** A day in Server Time: its date as YYYY-MM-DD, and its weekday, 0 for Sunday to 6 for Saturday. */
export interface ServerDay {
  readonly date: string;
  readonly weekday: number;
}

/** The moment shifted to Server Time: read it with the UTC getters only. */
export function serverTimeOf(now: Date): Date {
  return new Date(now.getTime() + OFFSET_MS);
}

/** The Server Time day the moment falls on. */
export function serverDayOf(now: Date): ServerDay {
  const shifted = serverTimeOf(now);
  return { date: shifted.toISOString().slice(0, 10), weekday: shifted.getUTCDay() };
}

/** The next daily reset, 00:00 Server Time, strictly after the moment. */
export function nextServerReset(now: Date): Date {
  const shifted = serverTimeOf(now).getTime();
  const nextMidnight = (Math.floor(shifted / DAY_MS) + 1) * DAY_MS;
  return new Date(nextMidnight - OFFSET_MS);
}
