import type { KingdomNumber } from "./lookup-input.js";

/** How long a map time counts as current: five minutes. Older map times are old data. */
export const MAP_TIME_FRESH_MS = 5 * 60_000;

const TRACKER_MAP_PAGE = "https://lastasylumtracker.com/map";

/**
 * True when the answer's map time is old: unknown, or more than five minutes before `now`. A map time in the future is not
 * old, and exactly five minutes is not old.
 */
export function isOld(asOf: Date | undefined, now: Date): boolean {
  if (asOf === undefined) {
    return true;
  }
  return now.getTime() - asOf.getTime() > MAP_TIME_FRESH_MS;
}

/** The tracker's map page of the Kingdom, or the tracker's map page as a whole when the Kingdom is unknown. */
export function mapPageOf(kingdom: KingdomNumber | undefined): string {
  return kingdom === undefined ? TRACKER_MAP_PAGE : `${TRACKER_MAP_PAGE}?kid=${kingdom.toString()}`;
}
