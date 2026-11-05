import { describe, expect, test } from "vitest";
import {
  dailyAllowance,
  daysToRecord,
  expectedLookupMembers,
  mayUse,
  type LookupMemberRecord,
} from "./daily-allowance.js";
import { utcDayOf, type UtcDay } from "./daily-quota.js";

const SATURDAY = utcDay("2026-11-07");
const TODAY = utcDay("2026-11-05");
const YESTERDAY = utcDay("2026-11-04");

function utcDay(iso: string): UtcDay {
  return utcDayOf(new Date(`${iso}T00:00:00Z`));
}

function lookupMemberDay(iso: string, lookupMembers: number): LookupMemberRecord {
  return { day: utcDay(iso), lookupMembers };
}

describe("expectedLookupMembers", () => {
  test("is 100 with no records", () => {
    expect(expectedLookupMembers([], SATURDAY)).toBe(100);
  });

  test("is 100 when the same-weekday records average 0", () => {
    const records = [lookupMemberDay("2026-10-31", 0), lookupMemberDay("2026-10-24", 0)];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(100);
  });

  test("is 100 when the last four same-weekday records are 1, 0, 0 and 0", () => {
    const records = [
      lookupMemberDay("2026-10-10", 1),
      lookupMemberDay("2026-10-17", 0),
      lookupMemberDay("2026-10-24", 0),
      lookupMemberDay("2026-10-31", 0),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(100);
  });

  test("is 100 when the last four same-weekday records are 40, 60, 80 and 100, an average of 70", () => {
    const records = [
      lookupMemberDay("2026-10-10", 40),
      lookupMemberDay("2026-10-17", 60),
      lookupMemberDay("2026-10-24", 80),
      lookupMemberDay("2026-10-31", 100),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(100);
  });

  test("ignores records on other weekdays, on the day itself and on later days", () => {
    const records = [
      lookupMemberDay("2026-10-30", 900),
      lookupMemberDay("2026-11-07", 900),
      lookupMemberDay("2026-11-14", 900),
      lookupMemberDay("2026-10-17", 160),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(160);
  });

  test("averages two earlier same-weekday records of 130 and 150 to 140", () => {
    const records = [lookupMemberDay("2026-10-24", 130), lookupMemberDay("2026-10-31", 150)];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(140);
  });

  test("averages the last four same-weekday records of 140, 160, 180 and 200 to 170", () => {
    const records = [
      lookupMemberDay("2026-10-10", 140),
      lookupMemberDay("2026-10-17", 160),
      lookupMemberDay("2026-10-24", 180),
      lookupMemberDay("2026-10-31", 200),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(170);
  });

  test("averages only the latest four same-weekday records, all above 100", () => {
    const records = [
      lookupMemberDay("2026-10-03", 5000),
      lookupMemberDay("2026-10-10", 110),
      lookupMemberDay("2026-10-17", 120),
      lookupMemberDay("2026-10-24", 130),
      lookupMemberDay("2026-10-31", 140),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(125);
  });

  test("keeps a non-whole average above 100 unrounded: 150 and 151 give 150.5", () => {
    const records = [lookupMemberDay("2026-10-24", 150), lookupMemberDay("2026-10-31", 151)];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(150.5);
  });
});

describe("dailyAllowance", () => {
  test("divides 1,400 by an expected 170 to 8", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 170 })).toBe(8);
  });

  test("divides 1,400 by the default expected 100 to 14", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 100 })).toBe(14);
  });

  test("rounds down, not to nearest: 1,400 over 145.5 is 9, where rounding would give 10", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 145.5 })).toBe(9);
  });

  test("is at least 1 when the division gives less than 1", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 2000 })).toBe(1);
  });

  test("is at least 1 when the budget is negative", () => {
    expect(dailyAllowance({ limit: 300, reserve: 100, syncShare: 500, expected: 100 })).toBe(1);
  });
});

describe("mayUse", () => {
  test("a Member below the Daily Allowance may use", () => {
    expect(mayUse(2, 3, false)).toBe(true);
  });

  test("a Member at the Daily Allowance may not use", () => {
    expect(mayUse(3, 3, false)).toBe(false);
  });

  test("an Officer may use even at the Daily Allowance", () => {
    expect(mayUse(3, 3, true)).toBe(true);
  });
});

describe("daysToRecord", () => {
  test("is empty when the latest record is yesterday", () => {
    expect(daysToRecord(YESTERDAY, undefined, TODAY)).toEqual([]);
  });

  test("is the days after the latest record through yesterday", () => {
    expect(daysToRecord(utcDay("2026-11-02"), undefined, TODAY)).toEqual([
      utcDay("2026-11-03"),
      utcDay("2026-11-04"),
    ]);
  });

  test("starts at the first usage day when nothing is recorded", () => {
    expect(daysToRecord(undefined, utcDay("2026-11-03"), TODAY)).toEqual([
      utcDay("2026-11-03"),
      utcDay("2026-11-04"),
    ]);
  });

  test("is empty when nothing is recorded and nothing was used", () => {
    expect(daysToRecord(undefined, undefined, TODAY)).toEqual([]);
  });

  test("is at most 28 days, the latest ones", () => {
    const days = daysToRecord(utcDay("2026-09-01"), undefined, TODAY);
    expect(days).toHaveLength(28);
    expect(days[0]).toEqual(utcDay("2026-10-08"));
    expect(days[27]).toEqual(YESTERDAY);
  });
});
