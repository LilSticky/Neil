import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { utcDayOf, type DailyQuota } from "../domain/daily-quota.js";
import type { MemberId } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { MemberUsageStore } from "../storage/member-usage-store.js";
import { AllowanceKeeper, type LookupCaller } from "./allowance-keeper.js";
import { QuotaKeeper, type DailyQuotaStorage } from "./quota-keeper.js";

const QUOTA_LIMIT = 2000;
const QUOTA_RESERVE = 100;
const SYNC_SHARE = 500;

const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
const CAROL: MemberId = "333333333333333333";

const alice: LookupCaller = { memberId: ALICE, officer: false };
const bob: LookupCaller = { memberId: BOB, officer: false };
const carol: LookupCaller = { memberId: CAROL, officer: false };
const officer: LookupCaller = { memberId: ALICE, officer: true };

/** An in-memory Daily Quota row store that records nothing else; the keeper reads its limit. */
class FakeQuotaStore implements DailyQuotaStorage {
  current: DailyQuota | undefined;

  constructor(initial: DailyQuota | undefined) {
    this.current = initial;
  }

  load(): DailyQuota | undefined {
    return this.current;
  }

  save(q: DailyQuota): void {
    this.current = q;
  }
}

/** A Member id of 18 digits, so ids of one length compare the same as strings and as numbers. */
function memberIdOf(n: number): MemberId {
  return `10000000000000${String(n).padStart(4, "0")}`;
}

let clock: Date;
const now = (): Date => clock;

beforeEach(() => {
  clock = new Date("2026-11-05T09:00:00Z");
});

describe("AllowanceKeeper", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: MemberUsageStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-allowance-"));
    db = openDatabase(dataDir);
    // The scenarios charge hundreds of requests; on disk each commit slows every other test file that uses SQLite.
    db.exec("PRAGMA synchronous = OFF; PRAGMA journal_mode = MEMORY");
    store = new MemberUsageStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** The Daily Quota row the keepers share, as the database keeps it across restarts. */
  let quotaStore: FakeQuotaStore;
  /** The Daily Quota keeper of the last keeper built; the Game API's reported limit goes through it. */
  let quota: QuotaKeeper;

  /** A keeper over the real usage store, with today's Daily Quota limit set to `limit`. */
  function keeperWithLimit(limit: number): AllowanceKeeper {
    quotaStore = new FakeQuotaStore({
      day: utcDayOf(clock),
      used: 0,
      limit,
      limitReached: false,
      confirmedAt: undefined,
    });
    return keeperOver(store);
  }

  /** A keeper over the given usage store and the same Daily Quota row: a restart over the same database. */
  function keeperOver(usage: MemberUsageStore): AllowanceKeeper {
    quota = new QuotaKeeper({ store: quotaStore, now, reserve: QUOTA_RESERVE });
    return new AllowanceKeeper({ store: usage, quota, now, reserve: QUOTA_RESERVE, syncShare: SYNC_SHARE });
  }

  /** On the UTC day given as YYYY-MM-DD, `count` different Members each make one lookup. */
  function lookUpsOn(keeper: AllowanceKeeper, day: string, count: number): void {
    clock = new Date(`${day}T09:00:00Z`);
    for (let n = 1; n <= count; n += 1) {
      keeper.charge({ memberId: memberIdOf(n), officer: false });
    }
  }

  /** Charges the caller `times` requests. */
  function chargeTimes(keeper: AllowanceKeeper, caller: LookupCaller, times: number): void {
    for (let i = 0; i < times; i += 1) keeper.charge(caller);
  }

  describe("expected", () => {
    test("is 100 Lookup Members with no history", () => {
      expect(keeperWithLimit(QUOTA_LIMIT).expected()).toBe(100);
    });
  });

  describe("allowance", () => {
    test("with no history is the limit less the Quota Reserve and the Sync Share, over 100: 14 at a limit of 2,000", () => {
      expect(keeperWithLimit(QUOTA_LIMIT).allowance()).toBe(14);
    });
  });

  describe("usageOf", () => {
    test("is 0 for a Member with no lookups today, then counts up by one with each charge", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      expect(keeper.usageOf(ALICE)).toBe(0);

      keeper.charge(alice);
      expect(keeper.usageOf(ALICE)).toBe(1);

      keeper.charge(alice);
      expect(keeper.usageOf(ALICE)).toBe(2);
      expect(keeper.usageOf(BOB)).toBe(0);
    });
  });

  describe("mayCharge", () => {
    test("is true for a Member below the allowance", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      chargeTimes(keeper, alice, 13);

      expect(keeper.mayCharge(alice)).toBe(true);
    });

    test("is false for a Member who has used the whole allowance", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      chargeTimes(keeper, alice, 14);

      expect(keeper.mayCharge(alice)).toBe(false);
    });

    test("is still true for an Officer who is past the allowance", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      chargeTimes(keeper, officer, 14);

      expect(keeper.mayCharge(officer)).toBe(true);
    });
  });

  describe("charge", () => {
    test("counts an Officer's lookup against the Officer, as for any Member", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      chargeTimes(keeper, officer, 3);

      expect(keeper.usageOf(ALICE)).toBe(3);
    });
  });

  describe("top", () => {
    test("lists at most 10 Members, most requests first", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      for (let n = 1; n <= 12; n += 1) {
        chargeTimes(keeper, { memberId: memberIdOf(n), officer: false }, n);
      }

      const top = keeper.top(10);

      expect(top.map((entry) => entry.requests)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
      expect(top.map((entry) => entry.memberId)).toEqual(
        [12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map((n) => memberIdOf(n)),
      );
    });

    test("breaks ties by Member id, lower first, whatever the order of the lookups", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      chargeTimes(keeper, carol, 2);
      chargeTimes(keeper, bob, 2);
      chargeTimes(keeper, alice, 2);

      expect(keeper.top(10)).toEqual([
        { memberId: ALICE, requests: 2 },
        { memberId: BOB, requests: 2 },
        { memberId: CAROL, requests: 2 },
      ]);
    });
  });

  describe("rollover", () => {
    test("a new UTC day resets every Member's usage to 0", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      chargeTimes(keeper, alice, 2);

      clock = new Date("2026-11-06T00:05:00Z");

      expect(keeper.usageOf(ALICE)).toBe(0);
    });

    test("the first read on a new UTC day records yesterday's Lookup Member count", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      chargeTimes(keeper, alice, 2);
      chargeTimes(keeper, bob, 1);
      chargeTimes(keeper, carol, 1);

      clock = new Date("2026-11-06T00:05:00Z");
      keeper.allowance();

      expect(store.records()).toEqual([{ day: "2026-11-05", lookupMembers: 3 }]);
    });
  });

  describe("the allowance follows how many Members look up (US2)", () => {
    test("Saturdays with 40, 60, 80 and 100 Lookup Members give an expected 70 and an allowance of 20", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      lookUpsOn(keeper, "2026-10-10", 40);
      lookUpsOn(keeper, "2026-10-17", 60);
      lookUpsOn(keeper, "2026-10-24", 80);
      lookUpsOn(keeper, "2026-10-31", 100);

      clock = new Date("2026-11-07T09:00:00Z");

      expect(keeper.expected()).toBe(70);
      expect(keeper.allowance()).toBe(20);
    });

    test("with only two earlier Saturdays, 30 and 50 Lookup Members, the expected is 40", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      lookUpsOn(keeper, "2026-10-24", 30);
      lookUpsOn(keeper, "2026-10-31", 50);

      clock = new Date("2026-11-07T09:00:00Z");

      expect(keeper.expected()).toBe(40);
    });

    test("a non-whole average is kept as the expected, and the allowance rounds down: 19, not 20", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      lookUpsOn(keeper, "2026-10-10", 40);
      lookUpsOn(keeper, "2026-10-17", 60);
      lookUpsOn(keeper, "2026-10-24", 80);
      lookUpsOn(keeper, "2026-10-31", 101);

      clock = new Date("2026-11-07T09:00:00Z");

      expect(keeper.expected()).toBe(70.25);
      expect(keeper.allowance()).toBe(19);
    });

    test("a day with no usage after a day with usage is recorded as 0", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      lookUpsOn(keeper, "2026-11-02", 3);

      clock = new Date("2026-11-04T09:00:00Z");
      keeper.allowance();

      expect(store.records()).toEqual([
        { day: "2026-11-02", lookupMembers: 3 },
        { day: "2026-11-03", lookupMembers: 0 },
      ]);
    });

    test("a Daily Quota limit reported during the day applies at the next read", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      expect(keeper.allowance()).toBe(14);

      quota.settle(utcDayOf(clock), { used: 0, limit: 2400 });

      expect(keeper.allowance()).toBe(18);
    });

    test("closing and reopening the database mid-day leaves each count and the allowance unchanged", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      lookUpsOn(keeper, "2026-11-04", 5);
      clock = new Date("2026-11-05T09:00:00Z");
      chargeTimes(keeper, alice, 2);
      chargeTimes(keeper, bob, 1);
      const before = {
        alice: keeper.usageOf(ALICE),
        bob: keeper.usageOf(BOB),
        allowance: keeper.allowance(),
        records: store.records(),
      };

      db.close();
      db = openDatabase(dataDir);
      store = new MemberUsageStore(db);
      const reopened = keeperOver(store);

      expect({
        alice: reopened.usageOf(ALICE),
        bob: reopened.usageOf(BOB),
        allowance: reopened.allowance(),
        records: store.records(),
      }).toEqual(before);
    });

    test("after Neil was down for several days, each missed day is recorded as 0", () => {
      const keeper = keeperWithLimit(QUOTA_LIMIT);
      lookUpsOn(keeper, "2026-11-02", 2);

      clock = new Date("2026-11-06T09:00:00Z");
      keeper.allowance();

      expect(store.records()).toEqual([
        { day: "2026-11-02", lookupMembers: 2 },
        { day: "2026-11-03", lookupMembers: 0 },
        { day: "2026-11-04", lookupMembers: 0 },
        { day: "2026-11-05", lookupMembers: 0 },
      ]);
    });
  });
});
