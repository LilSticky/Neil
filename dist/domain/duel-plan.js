import { nextServerReset, serverDayOf } from "./server-time.js";
/** The Duel days by Server Time weekday, 0 for Sunday, which has none. */
const DUEL_DAYS_BY_WEEKDAY = [
    undefined,
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
];
/** The Duel day the moment falls on in Server Time, or undefined on a Sunday. */
export function duelDayOf(now) {
    return DUEL_DAYS_BY_WEEKDAY[serverDayOf(now).weekday];
}
/** The next daily reset that starts a Duel day: the Sunday reset is skipped. */
export function nextDuelReset(now) {
    const reset = nextServerReset(now);
    return duelDayOf(reset) === undefined ? nextServerReset(reset) : reset;
}
//# sourceMappingURL=duel-plan.js.map