/** The limit assumed until the Game API reports one. */
export const DEFAULT_LIMIT = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** The UTC day a moment falls on. */
export function utcDayOf(now) {
    return now.toISOString().slice(0, 10);
}
/** The next 00:00 UTC strictly after a moment. */
export function nextReset(now) {
    const startOfDay = Date.parse(`${utcDayOf(now)}T00:00:00Z`);
    return new Date(startOfDay + MS_PER_DAY);
}
/** The quota for today: the stored one if it is from today, otherwise a fresh one keeping only the limit. */
export function todaysQuota(stored, now) {
    const day = utcDayOf(now);
    if (stored !== undefined && stored.day === day)
        return stored;
    return { day, used: 0, limit: stored?.limit ?? DEFAULT_LIMIT, limitReached: false, confirmedAt: undefined };
}
/** Whether Neil may send another Game API request today. */
export function canSend(q) {
    return !q.limitReached && q.used < q.limit;
}
/** Counts one request sent today. Call only when canSend is true. */
export function countRequest(q) {
    return { ...q, used: q.used + 1 };
}
/** Takes the Game API's figures as the truth, plus the requests still in flight that it cannot know about. */
export function adoptReported(q, reported, inFlight, now) {
    return { ...q, used: reported.used + inFlight, limit: reported.limit, confirmedAt: now };
}
/**
 * Whether a request for the given purpose may be sent today. Lookups stop once the Quota Reserve is all that
 * remains; an Onboarding Interview may use the reserve.
 */
export function canSendFor(q, purpose, reserve) {
    if (!canSend(q))
        return false;
    return purpose === "onboarding-interview" || remaining(q) > reserve;
}
/** Records that the Game API refused a request because today's limit is spent. */
export function markLimitReached(q, now) {
    return { ...q, limitReached: true, confirmedAt: now };
}
/** Requests left today, never below 0. */
export function remaining(q) {
    return Math.max(0, q.limit - q.used);
}
/** Requests a Member's lookup may still use today: what remains above the Quota Reserve, never below 0. */
export function leftForLookups(q, reserve) {
    return Math.max(0, remaining(q) - reserve);
}
//# sourceMappingURL=daily-quota.js.map