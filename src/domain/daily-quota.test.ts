import { describe, expect, test } from "vitest";
import {
  adoptReported,
  canSend,
  countRequest,
  markLimitReached,
  nextReset,
  remaining,
  todaysQuota,
  utcDayOf,
  type DailyQuota,
} from "./daily-quota.js";

const today = new Date("2026-10-30T10:15:00Z");
const yesterday = new Date("2026-10-29T12:00:00Z");
const reported = new Date("2026-10-30T09:00:00Z");

function quotaWith(used: number, limit: number, limitReached = false): DailyQuota {
  return { day: utcDayOf(today), used, limit, limitReached, confirmedAt: undefined };
}

describe("utcDayOf", () => {
  test("23:59:59 UTC and 00:00:00 UTC fall on different days", () => {
    expect(utcDayOf(new Date("2026-10-29T23:59:59Z"))).toBe("2026-10-29");
    expect(utcDayOf(new Date("2026-10-30T00:00:00Z"))).toBe("2026-10-30");
  });
});

describe("nextReset", () => {
  test("is the next 00:00 UTC after a time within the day", () => {
    expect(nextReset(new Date("2026-10-29T23:59:59Z"))).toEqual(new Date("2026-10-30T00:00:00Z"));
  });

  test("at exactly 00:00 UTC is the following midnight", () => {
    expect(nextReset(new Date("2026-10-30T00:00:00Z"))).toEqual(new Date("2026-10-31T00:00:00Z"));
  });
});

describe("todaysQuota", () => {
  test("without a stored quota starts today at 0 used with a limit of 1000", () => {
    expect(todaysQuota(undefined, today)).toEqual({
      day: "2026-10-30",
      used: 0,
      limit: 1000,
      limitReached: false,
      confirmedAt: undefined,
    });
  });

  test("a stored quota from yesterday keeps only its limit", () => {
    const stored: DailyQuota = {
      day: utcDayOf(yesterday),
      used: 500,
      limit: 2000,
      limitReached: true,
      confirmedAt: reported,
    };

    expect(todaysQuota(stored, today)).toEqual({
      day: "2026-10-30",
      used: 0,
      limit: 2000,
      limitReached: false,
      confirmedAt: undefined,
    });
  });

  test("a stored quota from today is returned unchanged", () => {
    const stored: DailyQuota = {
      day: utcDayOf(today),
      used: 12,
      limit: 2000,
      limitReached: false,
      confirmedAt: reported,
    };

    expect(todaysQuota(stored, today)).toEqual(stored);
  });
});

describe("canSend", () => {
  test("is true while used is below the limit and the day is not marked reached", () => {
    expect(canSend(quotaWith(999, 1000))).toBe(true);
  });

  test("is false when used has reached the limit", () => {
    expect(canSend(quotaWith(1000, 1000))).toBe(false);
  });

  test("is false when used is above the limit", () => {
    expect(canSend(quotaWith(1002, 1000))).toBe(false);
  });

  test("is false when the day is marked as limit reached, even with budget left", () => {
    expect(canSend(quotaWith(5, 1000, true))).toBe(false);
  });
});

describe("countRequest", () => {
  test("adds one to used and leaves the other fields alone", () => {
    expect(countRequest(quotaWith(7, 1000))).toEqual(quotaWith(8, 1000));
  });
});

describe("adoptReported", () => {
  test("sets used to the reported used plus the in-flight requests, and takes the reported limit", () => {
    const q = quotaWith(3, 1000);

    expect(adoptReported(q, { used: 10, limit: 2000 }, 2, reported)).toEqual({
      day: "2026-10-30",
      used: 12,
      limit: 2000,
      limitReached: false,
      confirmedAt: reported,
    });
  });
});

describe("markLimitReached", () => {
  test("sets limitReached and records when it was seen", () => {
    expect(markLimitReached(quotaWith(1000, 1000), reported)).toEqual({
      day: "2026-10-30",
      used: 1000,
      limit: 1000,
      limitReached: true,
      confirmedAt: reported,
    });
  });
});

describe("remaining", () => {
  test("is the limit minus used", () => {
    expect(remaining(quotaWith(12, 2000))).toBe(1988);
  });

  test("is 0 when used is above the limit, never negative", () => {
    expect(remaining(quotaWith(1005, 1000))).toBe(0);
  });
});
