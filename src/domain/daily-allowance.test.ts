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

  test("ignores records on other weekdays, on the day itself and on later days", () => {
    const records = [
      lookupMemberDay("2026-10-30", 900),
      lookupMemberDay("2026-11-07", 900),
      lookupMemberDay("2026-11-14", 900),
      lookupMemberDay("2026-10-17", 60),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(60);
  });

  test("averages two earlier same-weekday records of 30 and 50 to 40", () => {
    const records = [lookupMemberDay("2026-10-24", 30), lookupMemberDay("2026-10-31", 50)];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(40);
  });

  test("averages the last four same-weekday records of 40, 60, 80 and 100 to 70", () => {
    const records = [
      lookupMemberDay("2026-10-10", 40),
      lookupMemberDay("2026-10-17", 60),
      lookupMemberDay("2026-10-24", 80),
      lookupMemberDay("2026-10-31", 100),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(70);
  });

  test("averages only the latest four same-weekday records", () => {
    const records = [
      lookupMemberDay("2026-10-03", 5000),
      lookupMemberDay("2026-10-10", 40),
      lookupMemberDay("2026-10-17", 60),
      lookupMemberDay("2026-10-24", 80),
      lookupMemberDay("2026-10-31", 100),
    ];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(70);
  });

  test("is not rounded", () => {
    const records = [lookupMemberDay("2026-10-24", 1), lookupMemberDay("2026-10-31", 2)];
    expect(expectedLookupMembers(records, SATURDAY)).toBe(1.5);
  });
});

describe("dailyAllowance", () => {
  test("divides 1,400 by an expected 70 Lookup Members to 20", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 70 })).toBe(20);
  });

  test("divides 1,400 by the default expected 100 to 14", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 100 })).toBe(14);
  });

  test("rounds down", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 60 })).toBe(23);
  });

  test("is at least 1 when the division gives less than 1", () => {
    expect(dailyAllowance({ limit: 2000, reserve: 100, syncShare: 500, expected: 2000 })).toBe(1);
  });

  test("is at least 1 when the budget is negative", () => {
    expect(dailyAllowance({ limit: 300, reserve: 100, syncShare: 500, expected: 70 })).toBe(1);
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
