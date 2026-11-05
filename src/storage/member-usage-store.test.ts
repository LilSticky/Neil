import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { utcDayOf, type UtcDay } from "../domain/daily-quota.js";
import type { MemberId } from "../domain/rank-approval.js";
import { openDatabase } from "./database.js";
import { MemberUsageStore } from "./member-usage-store.js";

const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
const CAROL: MemberId = "333333333333333333";
const TODAY: UtcDay = utcDayOf(new Date("2026-11-05T09:00:00Z"));

/** The UTC day `days` days before `day`. */
function dayBefore(day: UtcDay, days: number): UtcDay {
  return utcDayOf(new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000));
}

const YESTERDAY = dayBefore(TODAY, 1);
const TWO_DAYS_AGO = dayBefore(TODAY, 2);
const DAY_28_AGO = dayBefore(TODAY, 28);
const DAY_29_AGO = dayBefore(TODAY, 29);

describe("MemberUsageStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-usage-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("a Member with no request on a day has 0 requests that day, and no records exist", () => {
    const store = new MemberUsageStore(db);

    expect(store.requestsOf(ALICE, TODAY)).toBe(0);
    expect(store.usageOn(TODAY)).toEqual([]);
    expect(store.records()).toEqual([]);
  });

  test("each counted request adds one to the Member's requests on that day, and no other day", () => {
    const store = new MemberUsageStore(db);

    store.countRequest(ALICE, TODAY);
    store.countRequest(ALICE, TODAY);
    store.countRequest(ALICE, TODAY);

    expect(store.requestsOf(ALICE, TODAY)).toBe(3);
    expect(store.requestsOf(ALICE, YESTERDAY)).toBe(0);
  });

  test("Members are counted separately on the same day", () => {
    const store = new MemberUsageStore(db);

    store.countRequest(ALICE, TODAY);
    store.countRequest(ALICE, TODAY);
    store.countRequest(BOB, TODAY);

    expect(store.requestsOf(ALICE, TODAY)).toBe(2);
    expect(store.requestsOf(BOB, TODAY)).toBe(1);
  });

  test("usageOn lists the Members of that day with their requests, most requests first", () => {
    const store = new MemberUsageStore(db);
    store.countRequest(ALICE, TODAY);
    store.countRequest(BOB, TODAY);
    store.countRequest(BOB, TODAY);
    store.countRequest(BOB, TODAY);
    store.countRequest(CAROL, TODAY);
    store.countRequest(CAROL, TODAY);
    store.countRequest(CAROL, YESTERDAY);

    expect(store.usageOn(TODAY)).toEqual([
      { memberId: BOB, requests: 3 },
      { memberId: CAROL, requests: 2 },
      { memberId: ALICE, requests: 1 },
    ]);
  });

  test.each([
    ["an empty Member id", ""],
    ["a Member id that is not a snowflake", "not-a-snowflake"],
    ["a Member id with a letter in it", "12345a"],
  ])("the database refuses %s", (_label, memberId) => {
    expect(() =>
      db.prepare("INSERT INTO member_usage (day, member_id, requests) VALUES (?, ?, ?)").run(TODAY, memberId, 1),
    ).toThrow(/CHECK constraint failed/);
  });

  test("the rollover records each given day with its Lookup Member count, and 0 for a day with no requests", () => {
    const store = new MemberUsageStore(db);
    store.countRequest(ALICE, TWO_DAYS_AGO);
    store.countRequest(ALICE, TWO_DAYS_AGO);
    store.countRequest(BOB, TWO_DAYS_AGO);

    store.rollover([TWO_DAYS_AGO, YESTERDAY], TODAY);

    expect(store.records()).toEqual([
      { day: TWO_DAYS_AGO, lookupMembers: 2 },
      { day: YESTERDAY, lookupMembers: 0 },
    ]);
  });

  test("the rollover deletes the usage of days before today and keeps today's", () => {
    const store = new MemberUsageStore(db);
    store.countRequest(ALICE, YESTERDAY);
    store.countRequest(BOB, TODAY);

    store.rollover([YESTERDAY], TODAY);

    expect(store.requestsOf(ALICE, YESTERDAY)).toBe(0);
    expect(store.requestsOf(BOB, TODAY)).toBe(1);
  });

  test("the rollover deletes the records older than 28 days and keeps the one 28 days back", () => {
    const store = new MemberUsageStore(db);
    store.rollover([DAY_29_AGO, DAY_28_AGO], dayBefore(TODAY, 27));

    store.rollover([], TODAY);

    expect(store.records()).toEqual([{ day: DAY_28_AGO, lookupMembers: 0 }]);
  });

  test("a rollover that fails halfway changes nothing: its records and its usage deletes are rolled back", () => {
    const store = new MemberUsageStore(db);
    store.countRequest(ALICE, YESTERDAY);
    db.exec(
      "CREATE TRIGGER refuse_usage_delete BEFORE DELETE ON member_usage BEGIN SELECT RAISE(ABORT, 'refused'); END",
    );

    expect(() => {
      store.rollover([YESTERDAY], TODAY);
    }).toThrow();

    expect(store.records()).toEqual([]);
    expect(store.requestsOf(ALICE, YESTERDAY)).toBe(1);
  });

  test("the usage and the records survive reopening the database", () => {
    const store = new MemberUsageStore(db);
    store.countRequest(BOB, YESTERDAY);
    store.countRequest(ALICE, TODAY);
    store.countRequest(ALICE, TODAY);
    store.rollover([YESTERDAY], TODAY);
    db.close();

    db = openDatabase(dataDir);

    const reopened = new MemberUsageStore(db);
    expect(reopened.records()).toEqual([{ day: YESTERDAY, lookupMembers: 1 }]);
    expect(reopened.requestsOf(ALICE, TODAY)).toBe(2);
  });

  test.each([
    [
      "a usage row whose requests is not a whole number",
      () => db.prepare("INSERT INTO member_usage (day, member_id, requests) VALUES (?, ?, ?)").run(TODAY, ALICE, 1.5),
      (store: MemberUsageStore) => store.usageOn(TODAY),
    ],
    [
      "a record whose day is not a date",
      () =>
        db.prepare("INSERT INTO lookup_member_day (day, lookup_members) VALUES (?, ?)").run("yesterday", 2),
      (store: MemberUsageStore) => store.records(),
    ],
    [
      "a record whose Lookup Member count is not a whole number",
      () =>
        db.prepare("INSERT INTO lookup_member_day (day, lookup_members) VALUES (?, ?)").run(YESTERDAY, 1.5),
      (store: MemberUsageStore) => store.records(),
    ],
  ])("refuses %s instead of skipping it", (_label, insertCorruptRow, read) => {
    insertCorruptRow();

    expect(() => read(new MemberUsageStore(db))).toThrow(/neil\.db is corrupt/);
  });
});
