import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
    ]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'start_record'").get()).toEqual({
      name: "start_record",
    });
    db.close();
  });

  test("does not reapply migrations on a second open", () => {
    openDatabase(dataDir).close();
    const db = openDatabase(dataDir);

    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
    ]);
    db.close();
  });

  test("refuses a database written by a newer build", () => {
    const db = openDatabase(dataDir);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (99, '2026-10-29T12:00:00.000Z')").run();
    db.close();

    expect(() => openDatabase(dataDir)).toThrow("neil.db has schema version 99, this build knows only up to 3");
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

  test("migration 3 creates onboarding_interview, link and rank_approval", () => {
    const db = openDatabase(dataDir);

    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('onboarding_interview', 'link', 'rank_approval') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: "link" }, { name: "onboarding_interview" }, { name: "rank_approval" }]);
    db.close();
  });

  test("link allows one Link per uid", () => {
    const db = openDatabase(dataDir);
    const insert = db.prepare("INSERT INTO link (member_id, uid, linked_at, rank_source) VALUES (?, ?, ?, ?)");

    insert.run("member-1", "uid-1", "2026-10-29T12:00:00.000Z", "unknown");
    expect(() => insert.run("member-2", "uid-1", "2026-10-29T12:00:00.000Z", "unknown")).toThrow(/UNIQUE/);
    db.close();
  });

  test("onboarding_interview allows one open Interview per Member", () => {
    const db = openDatabase(dataDir);
    const insert = db.prepare(
      "INSERT INTO onboarding_interview (member_id, thread_id, step, failed_attempts, started_at) VALUES (?, ?, ?, ?, ?)",
    );

    insert.run("member-1", "thread-1", "awaiting-uid", 0, "2026-10-29T12:00:00.000Z");
    expect(() => insert.run("member-1", "thread-2", "checking", 0, "2026-10-29T12:05:00.000Z")).toThrow(/UNIQUE/);
    db.close();
  });

  test("onboarding_interview allows an ended Interview next to an open one for the same Member", () => {
    const db = openDatabase(dataDir);
    const insert = db.prepare(
      "INSERT INTO onboarding_interview (member_id, thread_id, step, failed_attempts, started_at, ended_at, end_reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    insert.run("member-1", "thread-1", "linked", 0, "2026-10-29T12:00:00.000Z", "2026-10-29T12:10:00.000Z", null);
    expect(() =>
      insert.run("member-1", "thread-2", "awaiting-uid", 0, "2026-10-30T12:00:00.000Z", null, null),
    ).not.toThrow();
    db.close();
  });

  test("onboarding_interview rejects failed_attempts above 5", () => {
    const db = openDatabase(dataDir);
    const insert = db.prepare(
      "INSERT INTO onboarding_interview (member_id, thread_id, step, failed_attempts, started_at) VALUES (?, ?, ?, ?, ?)",
    );

    expect(() => insert.run("member-1", "thread-1", "awaiting-uid", 6, "2026-10-29T12:00:00.000Z")).toThrow(/CHECK/);
    insert.run("member-1", "thread-1", "awaiting-uid", 5, "2026-10-29T12:00:00.000Z");
    db.close();
  });

  test("upgrades a version 2 database and keeps its rows", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    legacy.exec(`CREATE TABLE start_record (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      first_started_at TEXT NOT NULL,
      start_count INTEGER NOT NULL CHECK (start_count >= 1)
    )`);
    legacy.exec(`CREATE TABLE daily_quota (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      day TEXT NOT NULL,
      used INTEGER NOT NULL CHECK (used >= 0),
      quota_limit INTEGER NOT NULL CHECK (quota_limit >= 1),
      limit_reached INTEGER NOT NULL CHECK (limit_reached IN (0, 1)),
      confirmed_at TEXT
    )`);
    const record = legacy.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
    record.run(1, "2026-10-28T12:00:00.000Z");
    record.run(2, "2026-10-28T12:00:00.000Z");
    legacy
      .prepare("INSERT INTO daily_quota (id, day, used, quota_limit, limit_reached, confirmed_at) VALUES (1, ?, ?, ?, ?, ?)")
      .run("2026-10-29", 3, 10, 0, "2026-10-29T08:00:00.000Z");
    legacy.close();

    const db = openDatabase(dataDir);

    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
    ]);
    expect(db.prepare("SELECT day, used FROM daily_quota").all()).toEqual([{ day: "2026-10-29", used: 3 }]);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'onboarding_interview'").get(),
    ).toEqual({ name: "onboarding_interview" });
    db.close();
  });
});
