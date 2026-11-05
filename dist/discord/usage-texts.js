import { nextReset } from "../domain/daily-quota.js";
import { timeLeft, utcTime } from "./lookup-cards.js";
/** The Link note: how to look up, the Daily Allowance and /usage. It ends the Link message and is sent privately after a Link. */
export const LINK_NOTE = "You can look up Players and Alliances with /player and /alliance. Each Member has a Daily Allowance of Game API requests; cached answers are free. /usage shows yours.";
/**
 * The /usage reply: the caller's requests against the Daily Allowance (an Officer is not limited), what costs a request,
 * that Onboarding is never charged, and when the usage resets with the time left until it.
 */
export function usageReply({ used, allowance, officer, now }) {
    const summary = officer
        ? `Your lookups today: ${used.toString()} Game API requests used. Officers are not limited.`
        : `Your lookups today: ${used.toString()} of ${allowance.toString()} Game API requests used.`;
    return [
        summary,
        "A lookup costs a request when Neil has not answered it in the last 10 minutes; cached answers are free.",
        "Onboarding is never charged.",
        `Resets at 00:00 UTC (${timeLeft(nextReset(now), now)}).`,
    ].join("\n");
}
/**
 * The private refusal of a lookup that the Member's Daily Allowance kept from the Game API: the allowance is spent, cached
 * answers still work, and the reset with the time left until it.
 */
export function refusalMessage(resetsAt, allowance, now) {
    const used = allowance.toString();
    return `Your Daily Allowance is spent: ${used} of ${used} Game API requests used today. Cached answers still work. It resets at ${utcTime(resetsAt)} (${timeLeft(resetsAt, now)}).`;
}
export { usageLine, withUsage } from "./usage-line.js";
//# sourceMappingURL=usage-texts.js.map