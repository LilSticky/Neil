import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type DailyQuota, utcDayOf } from "../domain/daily-quota.js";
import { openDatabase } from "./database.js";
import { DailyQuotaStore } from "./daily-quota-store.js";

describe("DailyQuotaStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-quota-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("loads nothing from a new database", () => {
    expect(new DailyQuotaStore(db).load()).toBeUndefined();
  });

  test("loads every field of what was saved, including an unconfirmed day", () => {
    const store = new DailyQuotaStore(db);
    const quota: DailyQuota = {
      day: utcDayOf(new Date("2026-10-30T12:00:00Z")),
      used: 7,
      limit: 2000,
      limitReached: false,
      confirmedAt: undefined,
    };

    store.save(quota);

    expect(store.load()).toEqual(quota);
  });

  test("loads every field of a confirmed day, including a reached limit", () => {
    const store = new DailyQuotaStore(db);
    const quota: DailyQuota = {
      day: utcDayOf(new Date("2026-10-30T12:00:00Z")),
      used: 2000,
      limit: 2000,
      limitReached: true,
      confirmedAt: new Date("2026-10-30T14:05:00Z"),
    };

    store.save(quota);

    expect(store.load()).toEqual(quota);
  });

  test("keeps the saved quota when the database is reopened", () => {
    const quota: DailyQuota = {
      day: utcDayOf(new Date("2026-10-30T12:00:00Z")),
      used: 12,
      limit: 2000,
      limitReached: false,
      confirmedAt: new Date("2026-10-30T11:00:00Z"),
    };
    new DailyQuotaStore(db).save(quota);
    db.close();
    db = openDatabase(dataDir);

    expect(new DailyQuotaStore(db).load()).toEqual(quota);
  });

  test("a second save replaces the first", () => {
    const store = new DailyQuotaStore(db);
    const day = utcDayOf(new Date("2026-10-30T12:00:00Z"));

    store.save({ day, used: 1, limit: 1000, limitReached: false, confirmedAt: undefined });
    const replacement: DailyQuota = {
      day,
      used: 9,
      limit: 1000,
      limitReached: true,
      confirmedAt: new Date("2026-10-30T13:00:00Z"),
    };
    store.save(replacement);

    expect(store.load()).toEqual(replacement);
  });

  test("refuses a corrupt row instead of resetting it", () => {
    db.prepare(
      "INSERT INTO daily_quota (id, day, used, quota_limit, limit_reached, confirmed_at) VALUES (1, 'x', 0, 1000, 0, NULL)",
    ).run();

    expect(() => new DailyQuotaStore(db).load()).toThrow(/the Daily Quota in neil\.db is corrupt/);
  });
});
