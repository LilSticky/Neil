/** Requests per lookup at most, the first one included (research R6). */
export const MAX_ATTEMPTS = 3;

const BASE_DELAY_MS = 1000;

/**
 * Milliseconds to wait after attempt `attempt` before the next one: doubling from 1 s, with jitter from `random`
 * (in [0, 1)) between half and one and a half times that.
 */
export function retryDelay(attempt: number, random: number): number {
  return BASE_DELAY_MS * 2 ** (attempt - 1) * (0.5 + random);
}
