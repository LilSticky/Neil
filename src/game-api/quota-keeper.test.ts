import { beforeEach, describe, expect, test } from "vitest";
import { utcDayOf, type DailyQuota } from "../domain/daily-quota.js";
import { QuotaKeeper } from "./quota-keeper.js";

const reported = new Date("2026-10-30T09:00:00Z");

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

describe("QuotaKeeper.today", () => {
  test("with no stored row, starts today at 0 used with the default limit and saves the roll", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now });

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
    const keeper = new QuotaKeeper({ store, now });

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
  test("counts the request and saves the count at once when the Daily Quota allows it", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now });

    expect(keeper.tryCount()).toBe(true);
    expect(store.current?.used).toBe(1);
  });

  test("refuses without saving when the day is marked limit reached", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 5,
      limit: 1000,
      limitReached: true,
      confirmedAt: reported,
    });
    const keeper = new QuotaKeeper({ store, now });

    expect(keeper.tryCount()).toBe(false);
    expect(store.saves).toHaveLength(0);
  });

  test("refuses without saving when used has reached the limit", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 1000,
      limit: 1000,
      limitReached: false,
      confirmedAt: undefined,
    });
    const keeper = new QuotaKeeper({ store, now });

    expect(keeper.tryCount()).toBe(false);
    expect(store.saves).toHaveLength(0);
  });

  test("counts from zero again after midnight UTC", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 1000,
      limit: 1000,
      limitReached: false,
      confirmedAt: undefined,
    });
    const keeper = new QuotaKeeper({ store, now });
    clock = new Date("2026-10-31T00:00:00Z");

    expect(keeper.tryCount()).toBe(true);
    expect(store.current).toMatchObject({ day: "2026-10-31", used: 1 });
  });
});

describe("QuotaKeeper.settle", () => {
  test("with figures, adopts them plus the requests still in flight, and saves", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now });
    keeper.tryCount();
    keeper.tryCount();

    keeper.settle({ used: 10, limit: 2000 });

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
    const keeper = new QuotaKeeper({ store, now });
    keeper.tryCount();

    keeper.settle(undefined);

    expect(keeper.today()).toMatchObject({ used: 1, confirmedAt: undefined });
  });

  test("without figures, ends that request so a later report counts only the requests still in flight", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now });
    keeper.tryCount();
    keeper.tryCount();
    keeper.settle(undefined);

    keeper.settle({ used: 10, limit: 2000 });

    expect(keeper.today().used).toBe(10);
  });
});

describe("QuotaKeeper.limitReached", () => {
  test("marks the day as limit reached and saves it", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now });
    keeper.tryCount();

    keeper.limitReached();

    expect(keeper.today()).toMatchObject({ limitReached: true, confirmedAt: clock });
    expect(store.current).toMatchObject({ limitReached: true, confirmedAt: clock });
  });

  test("makes tryCount refuse from then on", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now });
    keeper.limitReached();

    expect(keeper.tryCount()).toBe(false);
  });

  test("also ends one request in flight", () => {
    const store = new FakeQuotaStore(undefined);
    const keeper = new QuotaKeeper({ store, now });
    keeper.tryCount();
    keeper.tryCount();
    keeper.limitReached();

    keeper.settle({ used: 10, limit: 2000 });

    expect(keeper.today().used).toBe(10);
  });
});

describe("QuotaKeeper across restarts", () => {
  test("a keeper built on a store with today's limit-reached row refuses tryCount at once", () => {
    const store = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 5,
      limit: 1000,
      limitReached: true,
      confirmedAt: reported,
    });
    const restarted = new QuotaKeeper({ store, now });

    expect(restarted.tryCount()).toBe(false);
    expect(store.saves).toHaveLength(0);
  });

  test("a new keeper on the same store keeps the figures the first one adopted", () => {
    const store = new FakeQuotaStore(undefined);
    const first = new QuotaKeeper({ store, now });
    first.tryCount();
    first.settle({ used: 10, limit: 2000 });

    const restarted = new QuotaKeeper({ store, now });

    expect(restarted.today()).toMatchObject({ used: 10, limit: 2000, confirmedAt: clock });
  });
});
