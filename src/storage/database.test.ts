import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
      { version: 12 },
      { version: 13 },
      { version: 14 },
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
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
      { version: 12 },
      { version: 13 },
      { version: 14 },
    ]);
    db.close();
  });

  test("refuses a database written by a newer build", () => {
    const db = openDatabase(dataDir);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (99, '2026-10-29T12:00:00.000Z')").run();
    db.close();

    expect(() => openDatabase(dataDir)).toThrow("neil.db has schema version 99, this build knows only up to 14");
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
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
      { version: 12 },
      { version: 13 },
      { version: 14 },
    ]);
    expect(db.prepare("SELECT day, used FROM daily_quota").all()).toEqual([{ day: "2026-10-29", used: 3 }]);
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'onboarding_interview'").get(),
    ).toEqual({ name: "onboarding_interview" });
    db.close();
  });

  test("migration 4 adds chosen_uid, chosen_player_json and matches_json to onboarding_interview", () => {
    const db = openDatabase(dataDir);

    const columns: { name: string; type: string }[] = db
      .prepare("SELECT name, type FROM pragma_table_info('onboarding_interview')")
      .all()
      .map((row) => ({ name: String(row.name), type: String(row.type) }));
    expect(columns).toEqual(
      expect.arrayContaining([
        { name: "chosen_uid", type: "TEXT" },
        { name: "chosen_player_json", type: "TEXT" },
        { name: "matches_json", type: "TEXT" },
      ]),
    );
    db.close();
  });

  test.each(["recommending", "awaiting-recommendation", "awaiting-pick"])(
    "one_open_interview counts a %s Interview as open for its Member",
    (step) => {
      const db = openDatabase(dataDir);
      const insert = db.prepare(
        "INSERT INTO onboarding_interview (member_id, thread_id, step, failed_attempts, started_at) VALUES (?, ?, ?, ?, ?)",
      );

      insert.run("member-1", "thread-1", step, 0, "2026-10-29T12:00:00.000Z");
      expect(() => insert.run("member-1", "thread-2", "awaiting-uid", 0, "2026-10-29T12:05:00.000Z")).toThrow(/UNIQUE/);
      db.close();
    },
  );

  test("migration 5 creates applied with the columns of the Applied State", () => {
    const db = openDatabase(dataDir);
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('applied')")
        .all()
        .map((row) => String(row.name));
      expect(columns).toEqual(expect.arrayContaining(["member_id", "nickname", "roles_json", "applied_at", "complete"]));
    } finally {
      db.close();
    }
  });

  test("migration 6 creates known_alliance with the columns of a Known Alliance", () => {
    const db = openDatabase(dataDir);
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('known_alliance')")
        .all()
        .map((row) => String(row.name));
      expect(columns).toEqual(["kingdom", "tag", "name", "last_seen"]);
    } finally {
      db.close();
    }
  });

  test("known_alliance allows one row per Kingdom and tag", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare("INSERT INTO known_alliance (kingdom, tag, name, last_seen) VALUES (?, ?, ?, ?)");

      insert.run(330, "NML", "No Man's Land", "2026-11-02T12:00:00.000Z");
      expect(() => insert.run(330, "NML", "No Mans Land", "2026-11-02T13:00:00.000Z")).toThrow(/UNIQUE/);
      expect(() => insert.run(1, "NML", "No Man's Land", "2026-11-02T13:00:00.000Z")).not.toThrow();
    } finally {
      db.close();
    }
  });

  test("migration 7 adds the last Alliance columns to applied", () => {
    const db = openDatabase(dataDir);
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('applied')")
        .all()
        .map((row) => String(row.name));
      expect(columns).toEqual([
        "member_id",
        "nickname",
        "roles_json",
        "applied_at",
        "complete",
        "alliance_kingdom",
        "alliance_tag",
        "alliance_recorded",
      ]);
    } finally {
      db.close();
    }
  });

  test("migration 7 creates daily_sync with the day of the last run and the Members left over", () => {
    const db = openDatabase(dataDir);
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('daily_sync')")
        .all()
        .map((row) => String(row.name));
      expect(columns).toEqual(expect.arrayContaining(["day", "left_over_json"]));
    } finally {
      db.close();
    }
  });

  test("migration 8 adds alliance_recorded to applied, 0 unless a row says its Alliance was recorded", () => {
    const db = openDatabase(dataDir);
    try {
      const column = db
        .prepare("SELECT name, dflt_value FROM pragma_table_info('applied') WHERE name = 'alliance_recorded'")
        .get();
      expect(column).toEqual({ name: "alliance_recorded", dflt_value: "0" });
    } finally {
      db.close();
    }
  });

  test("migration 9 adds a nullable linked_by to link, the Officer of an Officer Link", () => {
    const db = openDatabase(dataDir);
    try {
      const column = db
        .prepare("SELECT name, type, \"notnull\" AS not_null FROM pragma_table_info('link') WHERE name = 'linked_by'")
        .get();
      expect(column).toEqual({ name: "linked_by", type: "TEXT", not_null: 0 });
    } finally {
      db.close();
    }
  });

  test("migration 10 lets linked_by be NULL or digits only, on insert and on update", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare("INSERT INTO link (member_id, uid, linked_at, rank_source, linked_by) VALUES (?, ?, ?, ?, ?)");
      const linkedAt = "2026-10-29T12:00:00.000Z";

      expect(() => insert.run("member-1", "uid-1", linkedAt, "unknown", "officer-1")).toThrow();
      expect(() => insert.run("member-2", "uid-2", linkedAt, "unknown", "")).toThrow();
      expect(() => insert.run("member-3", "uid-3", linkedAt, "unknown", "12a")).toThrow();
      insert.run("member-4", "uid-4", linkedAt, "unknown", "888888888888888888");
      insert.run("member-5", "uid-5", linkedAt, "unknown", null);

      const update = db.prepare("UPDATE link SET linked_by = ? WHERE member_id = ?");
      expect(() => update.run("officer-1", "member-5")).toThrow();
      update.run("888888888888888888", "member-5");
      expect(db.prepare("SELECT linked_by FROM link WHERE member_id = 'member-5'").get()).toEqual({
        linked_by: "888888888888888888",
      });
    } finally {
      db.close();
    }
  });

  test("migration 11 creates reaper with the columns of an Exile", () => {
    const db = openDatabase(dataDir);
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('reaper')")
        .all()
        .map((row) => String(row.name));
      expect(columns).toEqual([
        "uid",
        "name",
        "kingdom",
        "x",
        "y",
        "position_at",
        "reason",
        "added_at",
        "added_by",
      ]);
    } finally {
      db.close();
    }
  });

  test("reaper refuses a reason of 0 or more than 200 characters, and a position with only x or only y", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare(
        "INSERT INTO reaper (uid, name, kingdom, x, y, position_at, reason, added_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      const addedAt = "2026-10-29T12:00:00.000Z";

      expect(() => insert.run("uid-1", "Alice", 330, null, null, null, "", addedAt, "111")).toThrow(/CHECK/);
      expect(() => insert.run("uid-2", "Alice", 330, null, null, null, "a".repeat(201), addedAt, "111")).toThrow(/CHECK/);
      expect(() => insert.run("uid-3", "Alice", 330, 1, null, null, "reason", addedAt, "111")).toThrow(/CHECK/);
      expect(() => insert.run("uid-4", "Alice", 330, 1, 2, null, "reason", addedAt, "111")).toThrow(/CHECK/);
      insert.run("uid-5", "Alice", 330, 1, 2, "2026-10-29T12:00:00.000Z", "reason", addedAt, "111");
      insert.run("uid-6", "Bob", 330, null, null, null, "a".repeat(200), addedAt, "111");
    } finally {
      db.close();
    }
  });

  test("upgrades a version 8 database and keeps its Links, which read as made from In-game Proof", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec(readFileSync(join(import.meta.dirname, "__fixtures__", "schema-v8.sql"), "utf8"));
    legacy
      .prepare("INSERT INTO link (member_id, uid, linked_at, rank_source) VALUES (?, ?, ?, ?)")
      .run("member-1", "145563254785", "2026-10-29T12:00:00.000Z", "unknown");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
        { version: 7 },
        { version: 8 },
        { version: 9 },
        { version: 10 },
        { version: 11 },
        { version: 12 },
        { version: 13 },
        { version: 14 },
      ]);
      expect(db.prepare("SELECT member_id, uid, linked_by FROM link").all()).toEqual([
        { member_id: "member-1", uid: "145563254785", linked_by: null },
      ]);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 6 database to 7 and keeps its Applied States, with no last Alliance", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec(readFileSync(join(import.meta.dirname, "__fixtures__", "schema-v6.sql"), "utf8"));
    legacy
      .prepare("INSERT INTO link (member_id, uid, linked_at, rank_source) VALUES (?, ?, ?, ?)")
      .run("member-1", "145563254785", "2026-10-29T12:00:00.000Z", "unknown");
    legacy
      .prepare("INSERT INTO applied (member_id, nickname, roles_json, applied_at, complete) VALUES (?, ?, ?, ?, ?)")
      .run("member-1", "DrLOL", "[]", "2026-10-30T12:00:00.000Z", 1);
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
        { version: 7 },
        { version: 8 },
        { version: 9 },
        { version: 10 },
        { version: 11 },
        { version: 12 },
        { version: 13 },
        { version: 14 },
      ]);
      expect(db.prepare("SELECT member_id, nickname, complete, alliance_kingdom, alliance_tag FROM applied").all()).toEqual(
        [{ member_id: "member-1", nickname: "DrLOL", complete: 1, alliance_kingdom: null, alliance_tag: null }],
      );
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'daily_sync'").get()).toEqual({
        name: "daily_sync",
      });
    } finally {
      db.close();
    }
  });

  test("upgrades a version 5 database to 6 and keeps its Links and Applied States", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec(readFileSync(join(import.meta.dirname, "__fixtures__", "schema-v5.sql"), "utf8"));
    legacy
      .prepare("INSERT INTO link (member_id, uid, linked_at, rank_source) VALUES (?, ?, ?, ?)")
      .run("member-1", "145563254785", "2026-10-29T12:00:00.000Z", "unknown");
    legacy
      .prepare("INSERT INTO applied (member_id, nickname, roles_json, applied_at, complete) VALUES (?, ?, ?, ?, ?)")
      .run("member-1", "DrLOL", "[]", "2026-10-30T12:00:00.000Z", 1);
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
        { version: 7 },
        { version: 8 },
        { version: 9 },
        { version: 10 },
        { version: 11 },
        { version: 12 },
        { version: 13 },
        { version: 14 },
      ]);
      expect(db.prepare("SELECT member_id, uid FROM link").all()).toEqual([
        { member_id: "member-1", uid: "145563254785" },
      ]);
      expect(db.prepare("SELECT member_id, nickname, complete FROM applied").all()).toEqual([
        { member_id: "member-1", nickname: "DrLOL", complete: 1 },
      ]);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'known_alliance'").get()).toEqual(
        { name: "known_alliance" },
      );
    } finally {
      db.close();
    }
  });

  test("upgrades a version 4 database to 5 and keeps its Links", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec(readFileSync(join(import.meta.dirname, "__fixtures__", "schema-v4.sql"), "utf8"));
    legacy
      .prepare("INSERT INTO link (member_id, uid, linked_at, rank_source) VALUES (?, ?, ?, ?)")
      .run("member-1", "145563254785", "2026-10-29T12:00:00.000Z", "unknown");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
        { version: 7 },
        { version: 8 },
        { version: 9 },
        { version: 10 },
        { version: 11 },
        { version: 12 },
        { version: 13 },
        { version: 14 },
      ]);
      expect(db.prepare("SELECT member_id, uid FROM link").all()).toEqual([
        { member_id: "member-1", uid: "145563254785" },
      ]);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'applied'").get()).toEqual({
        name: "applied",
      });
    } finally {
      db.close();
    }
  });

  test("upgrades a version 3 database and keeps its Interviews", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    legacy.exec(`CREATE TABLE onboarding_interview (
      id INTEGER PRIMARY KEY,
      member_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      step TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL CHECK (failed_attempts BETWEEN 0 AND 5),
      uid TEXT,
      player_json TEXT,
      started_at TEXT NOT NULL,
      last_asked_at TEXT,
      resumes_at TEXT,
      ended_at TEXT,
      end_reason TEXT,
      due_at TEXT
    )`);
    legacy.exec("CREATE INDEX onboarding_interview_due ON onboarding_interview (due_at)");
    legacy.exec(`CREATE UNIQUE INDEX one_open_interview ON onboarding_interview (member_id)
      WHERE step IN ('awaiting-uid', 'checking', 'awaiting-confirmation', 'paused-for-quota')`);
    // Migration 3 also creates link, which later migrations alter.
    legacy.exec(`CREATE TABLE link (
      member_id TEXT PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      linked_at TEXT NOT NULL,
      rank_source TEXT NOT NULL,
      alliance_rank TEXT,
      approved_by TEXT,
      approved_at TEXT
    )`);
    const record = legacy.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
    record.run(1, "2026-10-28T12:00:00.000Z");
    record.run(2, "2026-10-28T12:00:00.000Z");
    record.run(3, "2026-10-28T12:00:00.000Z");
    legacy
      .prepare(
        "INSERT INTO onboarding_interview (id, member_id, thread_id, step, failed_attempts, started_at, last_asked_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        1,
        "member-1",
        "thread-1",
        "awaiting-uid",
        2,
        "2026-10-29T12:00:00.000Z",
        "2026-10-29T12:00:00.000Z",
        "2026-10-30T12:00:00.000Z",
      );
    legacy.close();

    const db = openDatabase(dataDir);

    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
      { version: 12 },
      { version: 13 },
      { version: 14 },
    ]);
    expect(
      db.prepare("SELECT member_id, step, failed_attempts, last_asked_at, chosen_uid, matches_json FROM onboarding_interview").all(),
    ).toEqual([
      {
        member_id: "member-1",
        step: "awaiting-uid",
        failed_attempts: 2,
        last_asked_at: "2026-10-29T12:00:00.000Z",
        chosen_uid: null,
        matches_json: null,
      },
    ]);
    expect(() =>
      db
        .prepare(
          "INSERT INTO onboarding_interview (member_id, thread_id, step, failed_attempts, started_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run("member-1", "thread-2", "recommending", 0, "2026-10-29T13:00:00.000Z"),
    ).toThrow(/UNIQUE/);
    db.close();
  });

  test("migration 12 creates preference with one row per Member, kind and value", () => {
    const db = openDatabase(dataDir);
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('preference')")
        .all()
        .map((row) => String(row.name));
      expect(columns).toEqual(["member_id", "kind", "value"]);

      const insert = db.prepare("INSERT INTO preference (member_id, kind, value) VALUES (?, ?, ?)");
      insert.run("111111111111111111", "language", "en");
      insert.run("111111111111111111", "language", "de");
      expect(() => insert.run("111111111111111111", "language", "en")).toThrow(/UNIQUE/);
    } finally {
      db.close();
    }
  });

  test("migration 12 lets member_id of preference and preference_prompt be a snowflake only", () => {
    const db = openDatabase(dataDir);
    try {
      const preference = db.prepare("INSERT INTO preference (member_id, kind, value) VALUES (?, ?, ?)");
      expect(() => preference.run("member-1", "language", "en")).toThrow();
      preference.run("111111111111111111", "language", "en");

      const prompt = db.prepare("INSERT INTO preference_prompt (member_id, thread_id, posted_at) VALUES (?, ?, ?)");
      expect(() => prompt.run("member-1", "thread-1", "2026-11-04T12:00:00.000Z")).toThrow();
      prompt.run("111111111111111111", "thread-1", "2026-11-04T12:00:00.000Z");
    } finally {
      db.close();
    }
  });

  test("migration 12 creates preference_prompt with one open prompt per Member", () => {
    const db = openDatabase(dataDir);
    try {
      const columns = db
        .prepare("SELECT name FROM pragma_table_info('preference_prompt')")
        .all()
        .map((row) => String(row.name));
      expect(columns).toEqual(["member_id", "thread_id", "posted_at"]);

      const insert = db.prepare("INSERT INTO preference_prompt (member_id, thread_id, posted_at) VALUES (?, ?, ?)");
      insert.run("111111111111111111", "thread-1", "2026-11-04T12:00:00.000Z");
      expect(() => insert.run("111111111111111111", "thread-2", "2026-11-04T13:00:00.000Z")).toThrow(/UNIQUE/);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 10 database to 12 and keeps its Links and Applied States", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec(readFileSync(join(import.meta.dirname, "__fixtures__", "schema-v10.sql"), "utf8"));
    legacy
      .prepare("INSERT INTO link (member_id, uid, linked_at, rank_source, linked_by) VALUES (?, ?, ?, ?, ?)")
      .run("member-1", "145563254785", "2026-10-29T12:00:00.000Z", "unknown", null);
    legacy
      .prepare("INSERT INTO applied (member_id, nickname, roles_json, applied_at, complete) VALUES (?, ?, ?, ?, ?)")
      .run("member-1", "DrLOL", "[]", "2026-10-30T12:00:00.000Z", 1);
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
        { version: 7 },
        { version: 8 },
        { version: 9 },
        { version: 10 },
        { version: 11 },
        { version: 12 },
        { version: 13 },
        { version: 14 },
      ]);
      expect(db.prepare("SELECT member_id, uid, linked_by FROM link").all()).toEqual([
        { member_id: "member-1", uid: "145563254785", linked_by: null },
      ]);
      expect(db.prepare("SELECT member_id, nickname, complete FROM applied").all()).toEqual([
        { member_id: "member-1", nickname: "DrLOL", complete: 1 },
      ]);
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('preference', 'preference_prompt') ORDER BY name")
          .all(),
      ).toEqual([{ name: "preference" }, { name: "preference_prompt" }]);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 11 database to 12 and keeps its reaper rows and Links", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec(readFileSync(join(import.meta.dirname, "__fixtures__", "schema-v11.sql"), "utf8"));
    legacy
      .prepare("INSERT INTO link (member_id, uid, linked_at, rank_source, linked_by) VALUES (?, ?, ?, ?, ?)")
      .run("member-1", "145563254785", "2026-10-29T12:00:00.000Z", "unknown", null);
    legacy
      .prepare("INSERT INTO reaper (uid, name, kingdom, x, y, position_at, reason, added_at, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run("145563254786", "Vex", 330, null, null, null, "Looted the Alliance", "2026-11-03T12:00:00.000Z", "888888888888888888");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
        { version: 7 },
        { version: 8 },
        { version: 9 },
        { version: 10 },
        { version: 11 },
        { version: 12 },
        { version: 13 },
        { version: 14 },
      ]);
      expect(db.prepare("SELECT member_id, uid, linked_by FROM link").all()).toEqual([
        { member_id: "member-1", uid: "145563254785", linked_by: null },
      ]);
      expect(db.prepare("SELECT uid, name, kingdom, reason, added_by FROM reaper").all()).toEqual([
        { uid: "145563254786", name: "Vex", kingdom: 330, reason: "Looted the Alliance", added_by: "888888888888888888" },
      ]);
    } finally {
      db.close();
    }
  });
});
