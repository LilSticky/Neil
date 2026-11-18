import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "./database.js";
import { ShieldStore } from "./shield-store.js";

const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const OFFICER = "999999999999999999";
const WEEK = "2026-11-21";
const NEXT_WEEK = "2026-11-28";
const AT = new Date("2026-11-18T12:00:00.000Z");

describe("ShieldStore", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ShieldStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-shield-"));
    db = openDatabase(dataDir);
    store = new ShieldStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("a week is not marked until an Officer marks it, and marking it twice changes nothing", () => {
    expect(store.markOf(WEEK)).toBeUndefined();
    expect(store.mark(WEEK, AT, OFFICER)).toBe(true);
    expect(store.mark(WEEK, new Date("2026-11-19T00:00:00.000Z"), ALICE)).toBe(false);
    expect(store.markOf(WEEK)).toEqual({ week: WEEK, markedAt: AT, markedBy: OFFICER });
    expect(store.markOf(NEXT_WEEK)).toBeUndefined();
  });

  test("unmark deletes the mark and that week's Shield Confirmations only", () => {
    store.mark(WEEK, AT, OFFICER);
    store.confirm(WEEK, ALICE, AT);
    store.confirm(NEXT_WEEK, BOB, AT);

    expect(store.unmark(WEEK)).toBe(true);

    expect(store.markOf(WEEK)).toBeUndefined();
    expect(store.confirmed(WEEK)).toEqual(new Set());
    expect(store.confirmed(NEXT_WEEK)).toEqual(new Set([BOB]));
  });

  test("unmarking a week that is not marked changes nothing", () => {
    store.confirm(WEEK, ALICE, AT);
    expect(store.unmark(WEEK)).toBe(false);
    expect(store.confirmed(WEEK)).toEqual(new Set([ALICE]));
  });

  test("records each lead time sent once per week", () => {
    store.recordSent(WEEK, 240);
    store.recordSent(WEEK, 720);
    store.recordSent(WEEK, 240);
    expect(store.sentLeads(WEEK)).toEqual([720, 240]);
    expect(store.sentLeads(NEXT_WEEK)).toEqual([]);
  });

  test("records a Shield Confirmation once", () => {
    expect(store.confirm(WEEK, ALICE, AT)).toBe(true);
    expect(store.confirm(WEEK, ALICE, AT)).toBe(false);
    expect(store.confirmed(WEEK)).toEqual(new Set([ALICE]));
  });

  test("deletes the Shield Confirmations of the weeks before", () => {
    store.confirm(WEEK, ALICE, AT);
    store.confirm(NEXT_WEEK, BOB, AT);
    store.deleteConfirmationsBefore(NEXT_WEEK);
    expect(store.confirmed(WEEK)).toEqual(new Set());
    expect(store.confirmed(NEXT_WEEK)).toEqual(new Set([BOB]));
  });

  test("Shield Reminders are on until switched off, and on again", () => {
    expect(store.isOff(ALICE)).toBe(false);
    store.setOff(ALICE, true);
    store.setOff(ALICE, true);
    expect(store.isOff(ALICE)).toBe(true);
    expect(store.remindersOff()).toEqual(new Set([ALICE]));
    store.setOff(ALICE, false);
    expect(store.isOff(ALICE)).toBe(false);
  });

  test("forget deletes the Member's confirmations and Shield Reminders Off, and nobody else's", () => {
    store.mark(WEEK, AT, OFFICER);
    store.confirm(WEEK, ALICE, AT);
    store.confirm(WEEK, BOB, AT);
    store.setOff(ALICE, true);

    store.forget(ALICE);

    expect(store.confirmed(WEEK)).toEqual(new Set([BOB]));
    expect(store.isOff(ALICE)).toBe(false);
    expect(store.markOf(WEEK)).toBeDefined();
  });

  test("a row that does not read is refused", () => {
    db.prepare("INSERT INTO kvk_week (week, marked_at, marked_by) VALUES (?, 'not a date', ?)").run(WEEK, OFFICER);
    expect(() => store.markOf(WEEK)).toThrow(/corrupt/);
  });
});
