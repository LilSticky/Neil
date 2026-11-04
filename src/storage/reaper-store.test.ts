import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { exileReasonOf, type Exile, type ExileReason, type Position } from "../domain/exile.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import { openDatabase } from "./database.js";
import { ReaperStore } from "./reaper-store.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

function reasonOf(text: string): ExileReason {
  const parsed = exileReasonOf(text);
  if (!parsed.ok) throw new Error(`the test reason "${text}" must be accepted`);
  return parsed.value;
}

const ADDED_BY = "111111111111111111";
const ALICE_UID = uidOf("145563254785");
const BOB_UID = uidOf("145563254786");
const CAROL_UID = uidOf("145563254787");
const HOME_KINGDOM = kingdomOf(330);
const OTHER_KINGDOM = kingdomOf(1);
const T0 = new Date("2026-11-01T12:00:00Z");
const T1 = new Date("2026-11-01T13:00:00Z");
const T2 = new Date("2026-11-01T14:00:00Z");
const POSITION: Position = { x: 120, y: 340 };

/** An Exile with no position unless one is given; the stored values are what the store must give back. */
function exileOf(
  uid: Uid,
  overrides: Partial<Pick<Exile, "name" | "kingdom" | "position" | "positionAt" | "reason" | "addedAt">> = {},
): Exile {
  return {
    uid,
    name: "Alice",
    kingdom: HOME_KINGDOM,
    position: undefined,
    positionAt: undefined,
    reason: reasonOf("Deserted the alliance"),
    addedAt: T0,
    addedBy: ADDED_BY,
    ...overrides,
  };
}

describe("ReaperStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("gives no Exiles and finds none from an empty database", () => {
    const store = new ReaperStore(db);

    expect(store.all()).toEqual([]);
    expect(store.find(ALICE_UID)).toBeUndefined();
  });

  test("adds an Exile with its position, reason, time and adder, and finds it by uid", () => {
    const store = new ReaperStore(db);
    const alice = exileOf(ALICE_UID, { position: POSITION, positionAt: T1 });

    expect(store.add(alice)).toBe("added");
    expect(store.find(ALICE_UID)).toEqual(alice);
  });

  test("adds an Exile with no position and reads it back with no position", () => {
    const store = new ReaperStore(db);
    const alice = exileOf(ALICE_UID);

    expect(store.add(alice)).toBe("added");
    expect(store.find(ALICE_UID)).toEqual(alice);
  });

  test("a second add of the same uid says already and keeps the Exile as it was", () => {
    const store = new ReaperStore(db);
    const first = exileOf(ALICE_UID, { reason: reasonOf("First reason") });

    store.add(first);

    expect(store.add(exileOf(ALICE_UID, { reason: reasonOf("Second reason"), addedAt: T2 }))).toBe("already");
    expect(store.find(ALICE_UID)).toEqual(first);
  });

  test("removes an Exile and says removed; the Exile is no longer found", () => {
    const store = new ReaperStore(db);
    store.add(exileOf(ALICE_UID));

    expect(store.remove(ALICE_UID)).toBe("removed");
    expect(store.find(ALICE_UID)).toBeUndefined();
    expect(store.all()).toEqual([]);
  });

  test("removing a uid that is not an Exile says not-an-exile", () => {
    const store = new ReaperStore(db);
    store.add(exileOf(ALICE_UID));

    expect(store.remove(BOB_UID)).toBe("not-an-exile");
    expect(store.find(ALICE_UID)).toEqual(exileOf(ALICE_UID));
  });

  test("all lists the Exiles newest first, by the time they were added", () => {
    const store = new ReaperStore(db);
    store.add(exileOf(ALICE_UID, { addedAt: T0 }));
    store.add(exileOf(BOB_UID, { addedAt: T2 }));
    store.add(exileOf(CAROL_UID, { addedAt: T1 }));

    expect(store.all().map((exile) => exile.uid)).toEqual([BOB_UID, CAROL_UID, ALICE_UID]);
  });

  test("inKingdom lists only the Exiles of that Kingdom, newest first", () => {
    const store = new ReaperStore(db);
    store.add(exileOf(ALICE_UID, { kingdom: HOME_KINGDOM, addedAt: T0 }));
    store.add(exileOf(BOB_UID, { kingdom: OTHER_KINGDOM, addedAt: T1 }));
    store.add(exileOf(CAROL_UID, { kingdom: HOME_KINGDOM, addedAt: T2 }));

    expect(store.inKingdom(HOME_KINGDOM).map((exile) => exile.uid)).toEqual([CAROL_UID, ALICE_UID]);
  });

  test("refresh replaces the name, Kingdom, position and when it was read, and keeps the rest", () => {
    const store = new ReaperStore(db);
    store.add(exileOf(ALICE_UID, { reason: reasonOf("Deserted the alliance"), addedAt: T0 }));

    store.refresh(ALICE_UID, { name: "Alice Renamed", kingdom: OTHER_KINGDOM, position: POSITION, readAt: T1 });

    expect(store.find(ALICE_UID)).toEqual(
      exileOf(ALICE_UID, {
        name: "Alice Renamed",
        kingdom: OTHER_KINGDOM,
        position: POSITION,
        positionAt: T1,
        reason: reasonOf("Deserted the alliance"),
        addedAt: T0,
      }),
    );
  });

  test("survives reopening the database with its Exiles and their order", () => {
    const store = new ReaperStore(db);
    store.add(exileOf(ALICE_UID, { position: POSITION, positionAt: T1, addedAt: T0 }));
    store.add(exileOf(BOB_UID, { addedAt: T2 }));
    db.close();

    db = openDatabase(dataDir);

    expect(new ReaperStore(db).all()).toEqual([
      exileOf(BOB_UID, { addedAt: T2 }),
      exileOf(ALICE_UID, { position: POSITION, positionAt: T1, addedAt: T0 }),
    ]);
  });

  test.each([
    ["a uid that is not a Player uid", { uid: "not-a-uid" }],
    ["a Kingdom that is not a Kingdom", { kingdom: 0 }],
    ["an adder that is not a snowflake", { added_by: "not-a-snowflake" }],
    ["an added time that is not a date", { added_at: "yesterday" }],
  ])("refuses a corrupt row with %s instead of skipping it", (_label, change) => {
    const row = {
      uid: ALICE_UID,
      name: "Alice",
      kingdom: 330,
      x: null,
      y: null,
      position_at: null,
      reason: "Deserted the alliance",
      added_at: T0.toISOString(),
      added_by: ADDED_BY,
      ...change,
    };
    db.prepare(
      `INSERT INTO reaper (uid, name, kingdom, x, y, position_at, reason, added_at, added_by)
       VALUES (:uid, :name, :kingdom, :x, :y, :position_at, :reason, :added_at, :added_by)`,
    ).run(row);

    expect(() => new ReaperStore(db).all()).toThrow(/the REAPER in neil\.db is corrupt/);
    expect(() => new ReaperStore(db).find(row.uid as Uid)).toThrow(/the REAPER in neil\.db is corrupt/);
  });
});
