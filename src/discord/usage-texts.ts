import { timeLeft, utcTime } from "./lookup-cards.js";

/**
 * The private refusal of a lookup that the Member's Daily Allowance kept from the Game API: the allowance is spent, cached
 * answers still work, and the reset with the time left until it.
 */
export function refusalMessage(resetsAt: Date, allowance: number, now: Date): string {
  const used = allowance.toString();
  return `Your Daily Allowance is spent: ${used} of ${used} Game API requests used today. Cached answers still work. It resets at ${utcTime(resetsAt)} (${timeLeft(resetsAt, now)}).`;
}
