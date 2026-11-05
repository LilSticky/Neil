import { describe, expect, test } from "vitest";
import { refusalMessage } from "./usage-texts.js";

const NOW = new Date("2026-10-30T16:00:00Z");
const RESETS_AT = new Date("2026-10-31T00:00:00Z");

describe("refusalMessage", () => {
  test("says the Daily Allowance is spent with M of M requests, that cached answers still work, and when it resets with the time left", () => {
    expect(refusalMessage(RESETS_AT, 3, NOW)).toBe(
      "Your Daily Allowance is spent: 3 of 3 Game API requests used today. Cached answers still work. It resets at 00:00 UTC (in 8 h 0 min).",
    );
  });
});
