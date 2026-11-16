import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AvailabilityStore } from "./availability-store.js";
import { openDatabase } from "./database.js";

const RAID_ID = "2026-11-21";
const OPENED = new Date("2026-11-18T22:00:00.000Z");
const ALICE = "111111111111111111";
const BOB = "222222222222222222";

describe("AvailabilityStore", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: AvailabilityStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-availability-store-"));
    db = openDatabase(dataDir);
    store = new AvailabilityStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("migration 18 applies to a version-17 database", () => {
    db.exec("DROP TABLE availability_answers; DROP TABLE availability_cards; DROP TABLE availability_polls");
    db.exec("DELETE FROM schema_migrations WHERE version = 18");
    db.close();

    db = openDatabase(dataDir);
    store = new AvailabilityStore(db);

    expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 18 });
    expect(store.poll(RAID_ID)).toBeUndefined();
  });

  test("a poll is opened once; its cards and summary are kept", () => {
    expect(store.poll(RAID_ID)).toBeUndefined();
    expect(store.open(RAID_ID, OPENED)).toBe(true);
    expect(store.open(RAID_ID, new Date())).toBe(false);
    store.saveCard(RAID_ID, "NML", { channelId: "1", messageId: "2" });
    store.saveSummaryCard(RAID_ID, { channelId: "3", messageId: "4" });

    const poll = store.poll(RAID_ID);
    expect(poll?.state).toEqual({ kind: "open" });
    expect(poll?.summaryCard).toEqual({ channelId: "3", messageId: "4" });
    expect([...(poll?.cards ?? new Map()).entries()]).toEqual([["NML", { channelId: "1", messageId: "2" }]]);
    expect(store.openPolls()).toEqual([RAID_ID]);
  });

  test("one answer per Member per Raid: a second answer replaces the first, also its Alliance", () => {
    store.open(RAID_ID, OPENED);
    store.record(RAID_ID, { memberId: ALICE, tag: "NML", availability: { kind: "available", fighterClass: "whale" } }, OPENED);
    store.record(RAID_ID, { memberId: BOB, tag: "NML", availability: { kind: "not-available" } }, OPENED);
    store.record(RAID_ID, { memberId: ALICE, tag: "ABC", availability: { kind: "available", fighterClass: "seal" } }, OPENED);

    expect(store.answers(RAID_ID)).toEqual([
      { memberId: ALICE, tag: "ABC", availability: { kind: "available", fighterClass: "seal" } },
      { memberId: BOB, tag: "NML", availability: { kind: "not-available" } },
    ]);
    expect(store.answerOf(RAID_ID, BOB)).toEqual({ memberId: BOB, tag: "NML", availability: { kind: "not-available" } });
  });

  test("answers and cards survive reopening the database", () => {
    store.open(RAID_ID, OPENED);
    store.saveCard(RAID_ID, "NML", { channelId: "1", messageId: "2" });
    store.record(RAID_ID, { memberId: ALICE, tag: "NML", availability: { kind: "available", fighterClass: "dolphin" } }, OPENED);
    db.close();
    db = openDatabase(dataDir);
    store = new AvailabilityStore(db);

    expect(store.poll(RAID_ID)?.cards.get("NML")).toEqual({ channelId: "1", messageId: "2" });
    expect(store.answerOf(RAID_ID, ALICE)?.availability).toEqual({ kind: "available", fighterClass: "dolphin" });
  });

  test("closing keeps the poll and its cards and deletes the Raid's answers", () => {
    store.open(RAID_ID, OPENED);
    store.saveCard(RAID_ID, "NML", { channelId: "1", messageId: "2" });
    store.record(RAID_ID, { memberId: ALICE, tag: "NML", availability: { kind: "not-available" } }, OPENED);
    store.close(RAID_ID, new Date("2026-11-21T22:00:00.000Z"), "cancelled");

    expect(store.poll(RAID_ID)?.state).toEqual({ kind: "closed", reason: "cancelled" });
    expect(store.poll(RAID_ID)?.cards.size).toBe(1);
    expect(store.answers(RAID_ID)).toEqual([]);
    expect(store.openPolls()).toEqual([]);
  });

  test("an Unlink forgets the Member's answers only", () => {
    store.open(RAID_ID, OPENED);
    store.record(RAID_ID, { memberId: ALICE, tag: "NML", availability: { kind: "not-available" } }, OPENED);
    store.record(RAID_ID, { memberId: BOB, tag: "NML", availability: { kind: "not-available" } }, OPENED);
    store.forget(ALICE);

    expect(store.answers(RAID_ID).map((answer) => answer.memberId)).toEqual([BOB]);
  });

  test("the database refuses an available answer without a class", () => {
    store.open(RAID_ID, OPENED);
    expect(() =>
      db
        .prepare("INSERT INTO availability_answers (raid_id, member_id, tag, available, fighter_class, answered_at) VALUES (?, ?, ?, 1, NULL, ?)")
        .run(RAID_ID, ALICE, "NML", OPENED.toISOString()),
    ).toThrow();
  });
});
