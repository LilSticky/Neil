import { vi, type Mock } from "vitest";
import type { LookupCaller } from "../../game-api/allowance-keeper.js";

/** The Daily Allowance the fake usage line shows, as in the spec's scenarios: 4 of 14 before an uncached request. */
export const FAKE_LINE_ALLOWANCE = 14;

/** The Member's requests today before the test's lookup, as the spec's scenarios start. */
export const FAKE_USED_BEFORE = 4;

/** The finished usage line for a caller who has made `used` requests today, as client.ts builds it. */
export function usageLineFor(caller: LookupCaller, used: number): string {
  return caller.officer
    ? `${used.toString()} Game API requests used today · Officers are not limited · cached answers are free · resets 00:00 UTC`
    : `${used.toString()} of ${FAKE_LINE_ALLOWANCE.toString()} Game API requests used today · cached answers are free · resets 00:00 UTC`;
}

/**
 * The context's usage function, read by the handlers after a request. `used` is the count the line shows; a test that
 * makes a request charged to the Member raises it, as the Game API client does for an uncached answer.
 */
export class FakeUsage {
  used: number;
  readonly usage: Mock<(caller: LookupCaller) => string>;

  constructor(used: number = FAKE_USED_BEFORE) {
    this.used = used;
    this.usage = vi.fn((caller: LookupCaller) => usageLineFor(caller, this.used));
  }
}
