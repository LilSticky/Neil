import { describe, expect, test } from "vitest";
import { timestamp, unixOf, type TimestampStyle } from "./timestamps.js";

/** 2026-11-14 19:00:30.900 UTC: the milliseconds are dropped, not rounded. */
const MOMENT = new Date(Date.UTC(2026, 10, 14, 19, 0, 30, 900));
const UNIX = "1794682830";

describe("unixOf", () => {
  test("gives Discord's Unix seconds for a moment, rounded down", () => {
    expect(unixOf(MOMENT)).toBe(UNIX);
  });
});

describe("timestamp", () => {
  test.each<TimestampStyle>(["t", "T", "d", "D", "f", "F", "R"])("writes the moment in style %s", (style) => {
    expect(timestamp(MOMENT, style)).toBe(`<t:${UNIX}:${style}>`);
  });
});
