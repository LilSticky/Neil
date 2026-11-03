import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { utcDayOf } from "../domain/daily-quota.js";
import { openDatabase } from "./database.js";
import { DailySyncStore, type DailySyncRecord } from "./daily-sync-store.js";

const ANA = "111111111111111111";
const BEN = "222222222222222222";
const TODAY = utcDayOf(new Date("2026-11-02T03:00:00Z"));
const YESTERDAY = utcDayOf(new Date("2026-11-01T03:00:00Z"));

describe("DailySyncStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-daily-sync-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("load finds no run before the first Daily Sync", () => {
    const store = new DailySyncStore(db);

    expect(store.load()).toBeUndefined();
  });

  test("save then load returns the day of the run and the Members left over, in order", () => {
    const store = new DailySyncStore(db);
    const record: DailySyncRecord = { day: TODAY, leftOver: [BEN, ANA] };

    store.save(record);

    expect(store.load()).toEqual(record);
  });

  test("save with no Member left over keeps an empty list", () => {
    const store = new DailySyncStore(db);

    store.save({ day: TODAY, leftOver: [] });

    expect(store.load()).toEqual({ day: TODAY, leftOver: [] });
  });

  test("save replaces the record of the previous run", () => {
    const store = new DailySyncStore(db);
    store.save({ day: YESTERDAY, leftOver: [ANA] });

    store.save({ day: TODAY, leftOver: [] });

    expect(store.load()).toEqual({ day: TODAY, leftOver: [] });
  });
});
