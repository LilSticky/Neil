import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "./database.js";
import { HandoverStore } from "./handover-store.js";

const SIEGE = new Date("2026-11-20T20:00:00.000Z");
const NEXT_SIEGE = new Date("2026-11-27T20:00:00.000Z");
const AT = new Date("2026-11-19T20:00:00.000Z");

describe("HandoverStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-handover-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("knows no post before one is recorded", () => {
    expect(new HandoverStore(db).handoverPosted(SIEGE, "reminder-24h")).toBe(false);
  });

  test("knows a recorded post by its siege and kind, and nothing else", () => {
    const store = new HandoverStore(db);
    store.recordHandoverPosted(SIEGE, "reminder-24h", AT);

    expect(store.handoverPosted(SIEGE, "reminder-24h")).toBe(true);
    expect(store.handoverPosted(SIEGE, "reminder-1h")).toBe(false);
    expect(store.handoverPosted(SIEGE, "announcement")).toBe(false);
    expect(store.handoverPosted(NEXT_SIEGE, "reminder-24h")).toBe(false);
  });

  test("recording a post again keeps the first time", () => {
    const store = new HandoverStore(db);
    store.recordHandoverPosted(SIEGE, "announcement", AT);
    store.recordHandoverPosted(SIEGE, "announcement", new Date(AT.getTime() + 60_000));

    expect(db.prepare("SELECT posted_at FROM handover_posts").all()).toEqual([{ posted_at: AT.toISOString() }]);
  });

  test("keeps what was recorded across a reopened database", () => {
    new HandoverStore(db).recordHandoverPosted(SIEGE, "reminder-1h", AT);
    db.close();
    db = openDatabase(dataDir);

    expect(new HandoverStore(db).handoverPosted(SIEGE, "reminder-1h")).toBe(true);
  });
});
