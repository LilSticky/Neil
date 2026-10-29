import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startCount } from "../domain/start-record.js";
import { openDatabase } from "./database.js";
import { StartRecordStore } from "./start-record-store.js";

describe("StartRecordStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-store-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("loads nothing from an empty data folder", () => {
    expect(new StartRecordStore(db).load()).toBeUndefined();
  });

  test("loads what was saved, and a second save replaces it", () => {
    const store = new StartRecordStore(db);
    const firstStartedAt = new Date("2026-10-29T12:00:00Z");

    store.save({ firstStartedAt, startCount: startCount(1) });
    store.save({ firstStartedAt, startCount: startCount(2) });

    expect(store.load()).toEqual({ firstStartedAt, startCount: 2 });
  });

  test.each([
    ["a time that is not ISO 8601", "yesterday", 3],
    ["a count of the wrong type", "2026-10-29T12:00:00.000Z", "three"],
  ])("refuses a corrupt row with %s instead of resetting it", (_label, firstStartedAt, count) => {
    db.prepare("INSERT INTO start_record (id, first_started_at, start_count) VALUES (1, ?, ?)").run(
      firstStartedAt,
      count,
    );

    expect(() => new StartRecordStore(db).load()).toThrow(/start record in neil\.db is corrupt/);
  });
});
