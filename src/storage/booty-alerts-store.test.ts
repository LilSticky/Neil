import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type BootyWindow, parseBootyWindow } from "../domain/booty.js";
import { openDatabase } from "./database.js";
import { BootyAlertsStore, type StoredBootyAlerts } from "./booty-alerts-store.js";

const ALICE = "111111111111111111";
const BOB = "222222222222222222";

function window(startMinute: number, endMinute: number): BootyWindow {
  const parsed = parseBootyWindow(startMinute, endMinute);
  if (!parsed.ok) throw new Error(`no Booty Alerts window from ${startMinute.toString()} to ${endMinute.toString()}`);
  return parsed.value;
}

const LISBON_OFFLINE: StoredBootyAlerts = {
  mode: "offline",
  window: window(480, 1380),
  timeZone: "Europe/Lisbon",
};

describe("BootyAlertsStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-booty-alerts-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("get gives undefined for a Member with no stored Booty Alerts, which means Off", () => {
    expect(new BootyAlertsStore(db).get(ALICE)).toBeUndefined();
  });

  test("save then get gives the mode, the window and the time zone", () => {
    const store = new BootyAlertsStore(db);

    store.save(ALICE, LISBON_OFFLINE);

    expect(store.get(ALICE)).toEqual(LISBON_OFFLINE);
  });

  test("a second save replaces the first", () => {
    const store = new BootyAlertsStore(db);

    store.save(ALICE, LISBON_OFFLINE);
    const replacement: StoredBootyAlerts = {
      mode: "always",
      window: window(1320, 360),
      timeZone: "Asia/Tokyo",
    };
    store.save(ALICE, replacement);

    expect(store.get(ALICE)).toEqual(replacement);
  });

  test("forget removes the Member's Booty Alerts, so they read as Off again", () => {
    const store = new BootyAlertsStore(db);
    store.save(ALICE, LISBON_OFFLINE);

    store.forget(ALICE);

    expect(store.get(ALICE)).toBeUndefined();
  });

  test("forget of a Member with no Booty Alerts changes nothing", () => {
    const store = new BootyAlertsStore(db);
    store.save(ALICE, LISBON_OFFLINE);

    expect(() => {
      store.forget(BOB);
    }).not.toThrow();

    expect(store.get(ALICE)).toEqual(LISBON_OFFLINE);
    expect(store.get(BOB)).toBeUndefined();
  });

  test("the Booty Alerts survive reopening the database", () => {
    new BootyAlertsStore(db).save(ALICE, LISBON_OFFLINE);
    db.close();
    db = openDatabase(dataDir);

    expect(new BootyAlertsStore(db).get(ALICE)).toEqual(LISBON_OFFLINE);
  });

  test.each([
    ["a mode that is not a known mode", { mode: "sometimes" }],
    ["a window start after the last minute of the day", { window_start: 1440 }],
    ["a window end below the first minute of the day", { window_end: -1 }],
  ])("refuses a corrupt row with %s instead of resetting it", (_label, change) => {
    const row = {
      member_id: ALICE,
      mode: "online",
      window_start: 480,
      window_end: 1380,
      time_zone: "Europe/Lisbon",
      ...change,
    };
    db.prepare(
      `INSERT INTO booty_alerts (member_id, mode, window_start, window_end, time_zone)
       VALUES (:member_id, :mode, :window_start, :window_end, :time_zone)`,
    ).run(row);

    expect(() => new BootyAlertsStore(db).get(ALICE)).toThrow(/the Booty Alerts in neil\.db is corrupt/);
  });
});
