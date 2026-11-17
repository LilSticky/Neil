import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { uidOf } from "../domain/__fixtures__/players.js";
import type { KingMove } from "../domain/king-move.js";
import { openDatabase } from "./database.js";
import { KingMoveStore } from "./king-move-store.js";

const PREPARED: KingMove = {
  holdingTag: "NML",
  leaderUid: uidOf("145563254785"),
  leaderName: "Rogue",
  newKing: "111111111111111111",
  previousKings: ["222222222222222222", "333333333333333333"],
  messageId: "423456789012345678",
  preparedAt: new Date("2026-11-20T20:05:00.000Z"),
  state: { kind: "prepared" },
};

describe("KingMoveStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-king-move-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("has no King Move before the first", () => {
    expect(new KingMoveStore(db).load()).toBeUndefined();
  });

  test("keeps a prepared King Move across a reopen of neil.db", () => {
    new KingMoveStore(db).save(PREPARED);
    db.close();
    db = openDatabase(dataDir);
    expect(new KingMoveStore(db).load()).toEqual(PREPARED);
  });

  test("keeps an applied King Move with who applied it and when", () => {
    const applied: KingMove = {
      ...PREPARED,
      leaderName: undefined,
      messageId: undefined,
      state: { kind: "applied", appliedBy: "444444444444444444", appliedAt: new Date("2026-11-20T21:00:00.000Z") },
    };
    const store = new KingMoveStore(db);
    store.save(applied);
    expect(store.load()).toEqual(applied);
  });

  test("keeps only the latest King Move", () => {
    const store = new KingMoveStore(db);
    store.save(PREPARED);
    const next: KingMove = { ...PREPARED, holdingTag: "ABC", preparedAt: new Date("2026-11-27T20:05:00.000Z") };
    store.save(next);
    expect(store.load()).toEqual(next);
    expect(db.prepare("SELECT COUNT(*) AS n FROM king_moves").get()).toEqual({ n: 1 });
  });

  test("update changes the stored move, and stores nothing when there is none", () => {
    const store = new KingMoveStore(db);
    expect(store.update((move) => move)).toBeUndefined();
    store.save(PREPARED);
    store.update((move) => ({ ...move, state: { kind: "superseded" } }));
    expect(store.load()?.state).toEqual({ kind: "superseded" });
  });

  test("refuses a corrupt row", () => {
    new KingMoveStore(db).save(PREPARED);
    db.prepare("UPDATE king_moves SET previous_kings_json = 'nope'").run();
    expect(() => new KingMoveStore(db).load()).toThrow("corrupt");
  });
});
