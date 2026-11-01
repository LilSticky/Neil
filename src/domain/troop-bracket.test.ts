import { describe, expect, test } from "vitest";
import { bracketFor } from "./troop-bracket.js";

/** The default first levels of T1…T10 (configuration default, FR-006). */
const DEFAULT_LEVELS = [1, 3, 6, 10, 14, 17, 20, 24, 27, 30] as const;

describe("bracketFor", () => {
  test.each([
    [1, "T1"],
    [2, "T1"],
    [3, "T2"],
    [5, "T2"],
    [6, "T3"],
    [9, "T3"],
    [10, "T4"],
    [13, "T4"],
    [14, "T5"],
    [16, "T5"],
    [17, "T6"],
    [19, "T6"],
    [20, "T7"],
    [21, "T7"],
    [23, "T7"],
    [24, "T8"],
    [26, "T8"],
    [27, "T9"],
    [29, "T9"],
    [30, "T10"],
    [50, "T10"],
  ])("gives the bracket of sanctuary level %d as %s with the default table", (level, bracket) => {
    expect(bracketFor(level, DEFAULT_LEVELS)).toBe(bracket);
  });

  test("gives no bracket for sanctuary level 0", () => {
    expect(bracketFor(0, DEFAULT_LEVELS)).toBeUndefined();
  });

  test("gives no bracket for a level below the first level of the table", () => {
    expect(bracketFor(4, [5, 10, 15])).toBeUndefined();
  });

  test("uses the given table, so a new tier needs no code change", () => {
    expect(bracketFor(12, [5, 10, 15])).toBe("T2");
    expect(bracketFor(15, [5, 10, 15])).toBe("T3");
  });
});
