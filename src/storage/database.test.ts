import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "./database.js";

describe("openDatabase", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-db-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("creates neil.db and applies migration 1", () => {
    const db = openDatabase(dataDir);

    expect(existsSync(join(dataDir, "neil.db"))).toBe(true);
    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([{ version: 1 }, { version: 2 }]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'start_record'").get()).toEqual({
      name: "start_record",
    });
    db.close();
  });

  test("does not reapply migrations on a second open", () => {
    openDatabase(dataDir).close();
    const db = openDatabase(dataDir);

    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([{ version: 1 }, { version: 2 }]);
    db.close();
  });

  test("refuses a database written by a newer build", () => {
    const db = openDatabase(dataDir);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (99, '2026-10-29T12:00:00.000Z')").run();
    db.close();

    expect(() => openDatabase(dataDir)).toThrow("neil.db has schema version 99, this build knows only up to 2");
  });

  test("migration 2 creates daily_quota", () => {
    const db = openDatabase(dataDir);

    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'daily_quota'").get()).toEqual({
      name: "daily_quota",
    });
    db.close();
  });

  test("start_record allows one row with a count of at least 1", () => {
    const db = openDatabase(dataDir);
    const insert = db.prepare("INSERT INTO start_record (id, first_started_at, start_count) VALUES (?, ?, ?)");

    expect(() => insert.run(1, "2026-10-29T12:00:00.000Z", 0)).toThrow(/CHECK/);
    expect(() => insert.run(2, "2026-10-29T12:00:00.000Z", 1)).toThrow(/CHECK/);
    insert.run(1, "2026-10-29T12:00:00.000Z", 1);
    db.close();
  });
});
