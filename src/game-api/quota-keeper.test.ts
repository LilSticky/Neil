import { beforeEach, describe, expect, test } from "vitest";
import { canSend, utcDayOf, type DailyQuota, type UtcDay } from "../domain/daily-quota.js";
import { QuotaKeeper } from "./quota-keeper.js";

const reported = new Date("2026-10-30T09:00:00Z");
const QUOTA_RESERVE = 100;

/** An in-memory DailyQuotaStore that records every save. */
class FakeQuotaStore {
  current: DailyQuota | undefined;
  readonly saves: DailyQuota[] = [];

  constructor(initial: DailyQuota | undefined) {
    this.current = initial;
  }

  load(): DailyQuota | undefined {
    return this.current;
  }

  save(q: DailyQuota): void {
    this.current = q;
    this.saves.push(q);
  }
}

let clock: Date;
const now = (): Date => clock;

beforeEach(() => {
  clock = new Date("2026-10-30T10:15:00Z");
});

/** The day a request was counted on; fails the test when the request was refused. */
function countedDay(keeper: QuotaKeeper): UtcDay {
  const attempt = keeper.tryCount("lookup");
  if (!attempt.ok) throw new Error(`the request should have been counted, refused for ${attempt.reason}`);
  return attempt.day;
}

/** Today's row with the given number of requests used, at the default limit of 1000. */
function usedToday(used: number): DailyQuota {
  return { day: utcDayOf(clock), used, limit: 1000, limitReached: false, confirmedAt: undefined };
}

describe("QuotaKeeper.today", () => {
  test("with no stored row, starts today at 0 used with the default limit and saves the roll", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.today()).toEqual({
      day: "2026-10-30",
      used: 0,
      limit: 1000,
      limitReached: false,
      confirmedAt: undefined,
    });
    expect(store.current?.day).toBe("2026-10-30");
  });

  test("rolls yesterday's row to today, keeping only its limit, and saves the roll", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(new Date("2026-10-29T12:00:00Z")),
      used: 500,
      limit: 2000,
      limitReached: true,
      confirmedAt: reported,
    });
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.today()).toEqual({
      day: "2026-10-30",
      used: 0,
      limit: 2000,
      limitReached: false,
      confirmedAt: undefined,
    });
    expect(store.current).toEqual(keeper.today());
  });
});

describe("QuotaKeeper.tryCount", () => {
  test("counts the request and saves the count at once when the Daily Quota allows it, returning today's day", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.tryCount("lookup")).toEqual({ ok: true, day: "2026-10-30" });
    expect(store.current?.used).toBe(1);
  });

  test("refuses with reason spent, without saving, when the day is marked limit reached", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 5,
      limit: 1000,
      limitReached: true,
      confirmedAt: reported,
    });
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.tryCount("lookup")).toEqual({ ok: false, reason: "spent" });
    expect(store.saves).toHaveLength(0);
  });

  test("refuses with reason spent, without saving, when used has reached the limit", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 1000,
      limit: 1000,
      limitReached: false,
      confirmedAt: undefined,
    });
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.tryCount("lookup")).toEqual({ ok: false, reason: "spent" });
    expect(keeper.tryCount("onboarding-interview")).toEqual({ ok: false, reason: "spent" });
    expect(store.saves).toHaveLength(0);
  });

  test("counts from zero again after midnight UTC, returning the new day", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 1000,
      limit: 1000,
      limitReached: false,
      confirmedAt: undefined,
    });
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    clock = new Date("2026-10-31T00:00:00Z");

    expect(keeper.tryCount("lookup")).toEqual({ ok: true, day: "2026-10-31" });
    expect(store.current).toMatchObject({ day: "2026-10-31", used: 1 });
  });
});

describe("QuotaKeeper.tryCount with the Quota Reserve", () => {
  test("refuses a lookup with exactly the Quota Reserve left, with reason reserve, and saves nothing", () => {
    const store = new FakeQuotaStore(usedToday(900));
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.tryCount("lookup")).toEqual({ ok: false, reason: "reserve" });
    expect(store.saves).toHaveLength(0);
  });

  test("counts a lookup with one request more than the Quota Reserve left", () => {
    const store = new FakeQuotaStore(usedToday(899));
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.tryCount("lookup")).toEqual({ ok: true, day: "2026-10-30" });
    expect(store.current?.used).toBe(900);
  });

  test("counts an onboarding interview even with only the Quota Reserve left", () => {
    const store = new FakeQuotaStore(usedToday(900));
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.tryCount("onboarding-interview")).toEqual({ ok: true, day: "2026-10-30" });
    expect(store.current?.used).toBe(901);
  });

  test("reports spent, not reserve, for a lookup once the Daily Quota is used up", () => {
    const store = new FakeQuotaStore(usedToday(1000));
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(keeper.tryCount("lookup")).toEqual({ ok: false, reason: "spent" });
  });
});

describe("QuotaKeeper.settle", () => {
  test("with figures, adopts them plus the requests still in flight, and saves", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    const day = countedDay(keeper);
    countedDay(keeper);

    keeper.settle(day, { used: 10, limit: 2000 });

    expect(keeper.today()).toEqual({
      day: "2026-10-30",
      used: 11,
      limit: 2000,
      limitReached: false,
      confirmedAt: clock,
    });
    expect(store.current?.used).toBe(11);
  });

  test("without figures, ends the request and keeps the count as it was", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    const day = countedDay(keeper);

    keeper.settle(day, undefined);

    expect(keeper.today()).toMatchObject({ used: 1, confirmedAt: undefined });
  });

  test("without figures, ends that request so a later report counts only the requests still in flight", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    const day = countedDay(keeper);
    countedDay(keeper);
    keeper.settle(day, undefined);

    keeper.settle(day, { used: 10, limit: 2000 });

    expect(keeper.today().used).toBe(10);
  });
});

describe("QuotaKeeper.limitReached", () => {
  test("marks the day as limit reached and saves it", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    const day = countedDay(keeper);

    keeper.limitReached(day);

    expect(keeper.today()).toMatchObject({ limitReached: true, confirmedAt: clock });
    expect(store.current).toMatchObject({ limitReached: true, confirmedAt: clock });
  });

  test("makes tryCount refuse from then on, with reason spent", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    const day = countedDay(keeper);
    keeper.limitReached(day);

    expect(keeper.tryCount("lookup")).toEqual({ ok: false, reason: "spent" });
  });

  test("also ends one request in flight", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    const day = countedDay(keeper);
    countedDay(keeper);
    keeper.limitReached(day);

    keeper.settle(day, { used: 10, limit: 2000 });

    expect(keeper.today().used).toBe(10);
  });
});

describe("QuotaKeeper across midnight UTC", () => {
  test("a 429 for a request counted at 23:59:58 does not mark the next day, which stays sendable", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    clock = new Date("2026-10-30T23:59:58Z");
    const day = countedDay(keeper);

    clock = new Date("2026-10-31T00:00:01Z");
    keeper.limitReached(day);

    expect(keeper.today()).toMatchObject({ day: "2026-10-31", limitReached: false });
    expect(canSend(keeper.today())).toBe(true);
    expect(keeper.tryCount("lookup")).toEqual({ ok: true, day: "2026-10-31" });
  });

  test("figures from a request counted the day before leave the next day's used and limit unchanged", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    clock = new Date("2026-10-30T23:59:58Z");
    const day = countedDay(keeper);

    clock = new Date("2026-10-31T00:00:01Z");
    countedDay(keeper);
    keeper.settle(day, { used: 990, limit: 2000 });

    expect(keeper.today()).toMatchObject({ day: "2026-10-31", used: 1, limit: 1000, confirmedAt: undefined });
  });
});

describe("QuotaKeeper across restarts", () => {
  test("a keeper built on a store with today's limit-reached row refuses tryCount at once, with reason spent", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 5,
      limit: 1000,
      limitReached: true,
      confirmedAt: reported,
    });
    const restarted = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(restarted.tryCount("lookup")).toEqual({ ok: false, reason: "spent" });
    expect(store.saves).toHaveLength(0);
  });

  test("a new keeper on the same store keeps the figures the first one adopted", () => {
    const store = new FakeQuotaStore(undefined);
    const first = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });
    const day = countedDay(first);
    first.settle(day, { used: 10, limit: 2000 });

    const restarted = new QuotaKeeper({ store, now, reserve: QUOTA_RESERVE });

    expect(restarted.today()).toMatchObject({ used: 10, limit: 2000, confirmedAt: clock });
  });
});
