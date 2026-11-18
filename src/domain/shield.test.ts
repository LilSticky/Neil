import { describe, expect, test } from "vitest";
import {
  deadlineOfWeek,
  isShieldWeek,
  SHIELD_LEAD_MINUTES,
  shieldDeadlineOf,
  shieldKindOf,
  shieldLeadMinutesOf,
  shieldStandingOf,
  shieldWeekOf,
  weekStartOf,
} from "./shield.js";

const at = (iso: string): Date => new Date(iso);

describe("shieldDeadlineOf", () => {
  test("is Saturday 02:00 UTC from a Wednesday", () => {
    expect(shieldDeadlineOf(at("2026-11-18T10:00:00Z")).toISOString()).toBe("2026-11-21T02:00:00.000Z");
  });

  test("is the same Saturday at Friday 23:59 Server Time", () => {
    expect(shieldDeadlineOf(at("2026-11-21T01:59:00Z")).toISOString()).toBe("2026-11-21T02:00:00.000Z");
  });

  test("is the next week's at exactly Saturday 00:00 Server Time", () => {
    expect(shieldDeadlineOf(at("2026-11-21T02:00:00Z")).toISOString()).toBe("2026-11-28T02:00:00.000Z");
  });

  test("is the coming Saturday from a Sunday", () => {
    expect(shieldDeadlineOf(at("2026-11-22T12:00:00Z")).toISOString()).toBe("2026-11-28T02:00:00.000Z");
  });

  test("counts Saturday 01:00 UTC, still Friday in Server Time, to that Saturday", () => {
    expect(shieldDeadlineOf(at("2026-11-21T01:00:00Z")).toISOString()).toBe("2026-11-21T02:00:00.000Z");
  });
});

describe("weeks", () => {
  test("a week is the Saturday's date, and reads back to its deadline", () => {
    const deadline = shieldDeadlineOf(at("2026-11-18T10:00:00Z"));
    expect(shieldWeekOf(deadline)).toBe("2026-11-21");
    expect(deadlineOfWeek("2026-11-21")).toEqual(deadline);
  });

  test("a week starts on the Sunday 00:00 Server Time before", () => {
    expect(weekStartOf("2026-11-21").toISOString()).toBe("2026-11-15T02:00:00.000Z");
  });

  test.each([
    ["2026-11-21", true],
    ["2026-11-20", false],
    ["2026-13-01", false],
    ["21.11.2026", false],
  ])("isShieldWeek(%s) is %s", (text, expected) => {
    expect(isShieldWeek(text)).toBe(expected);
  });
});

describe("shieldLeadMinutesOf", () => {
  test("is 12h, 4h, 1h without a Shield kind", () => {
    expect(shieldLeadMinutesOf([])).toEqual([720, 240, 60]);
    expect(SHIELD_LEAD_MINUTES).toEqual([720, 240, 60]);
  });

  test("is the lead times of the kingdom's Shield kind, in any case", () => {
    const kinds = [
      { name: "Hive", beforeStart: [30], signupOffsetMinutes: undefined, beforeSignup: [] },
      { name: "shield", beforeStart: [120, 30], signupOffsetMinutes: undefined, beforeSignup: [] },
    ];
    expect(shieldLeadMinutesOf(kinds)).toEqual([120, 30]);
  });

  test("the Shield kind has no Sign-up Deadline", () => {
    expect(shieldKindOf([60])).toEqual({ name: "Shield", beforeStart: [60], signupOffsetMinutes: undefined, beforeSignup: [] });
  });
});

describe("shieldStandingOf", () => {
  test("splits the Members into those to remind and those with reminders off, and counts the confirmed", () => {
    const standing = shieldStandingOf(["1", "2", "3", "4", "4"], new Set(["2", "4"]), new Set(["3", "4"]));
    expect(standing).toEqual({ toRemind: ["1"], remindersOff: ["3"], confirmed: 2, total: 4 });
  });

  test("with everyone confirmed, nobody is reminded", () => {
    expect(shieldStandingOf(["1"], new Set(["1"]), new Set())).toEqual({ toRemind: [], remindersOff: [], confirmed: 1, total: 1 });
  });
});
