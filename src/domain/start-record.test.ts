import { describe, expect, test } from "vitest";
import { recordStart, startCount } from "./start-record.js";

const first = new Date("2026-10-29T12:00:00Z");
const later = new Date("2026-10-30T08:30:00Z");

describe("recordStart", () => {
  test("the first start sets the first-start time and a count of 1", () => {
    expect(recordStart(undefined, first)).toEqual({ firstStartedAt: first, startCount: 1 });
  });

  test("a later start keeps the first-start time and adds one", () => {
    const previous = { firstStartedAt: first, startCount: startCount(3) };

    expect(recordStart(previous, later)).toEqual({ firstStartedAt: first, startCount: 4 });
  });
});

describe("startCount", () => {
  test("accepts integers of 1 or more", () => {
    expect(startCount(1)).toBe(1);
    expect(startCount(42)).toBe(42);
  });

  test.each([0, -1, 1.5, Number.NaN])("rejects %s", (value) => {
    expect(() => startCount(value)).toThrow("start count must be an integer ≥ 1");
  });
});
