import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "./database.js";

/** Takes a database back to schema version 28: without the NaP Reports. */
const UNDO_MIGRATION_29 = `DROP TABLE nap_report_proposals;
  DROP TABLE nap_reports;
  DELETE FROM schema_migrations WHERE version = 29`;

/** Takes a database back to schema version 27: without the Shield Reminders. */
const UNDO_MIGRATION_28 = `${UNDO_MIGRATION_29};
  DROP TABLE shield_reminders_off;
  DROP TABLE shield_confirmation;
  DROP TABLE shield_reminder_sent;
  DROP TABLE kvk_week;
  DELETE FROM schema_migrations WHERE version = 28`;

/** Takes a database back to schema version 26: without the NaP Rules. */
const UNDO_MIGRATION_27 = `${UNDO_MIGRATION_28};
  DROP TABLE nap_rules_versions;
  DELETE FROM schema_migrations WHERE version = 27`;

/** Takes a database back to schema version 25: without the NaP Motions. */
const UNDO_MIGRATION_26 = `${UNDO_MIGRATION_27};
  DROP TABLE nap_motion_votes;
  DROP TABLE nap_motions;
  DELETE FROM schema_migrations WHERE version = 26`;

/** Takes a database back to schema version 24: the NaP tables as migration 21 made them, without votes or vote ends. */
const UNDO_MIGRATION_25 = `${UNDO_MIGRATION_26};
  DROP TABLE nap_votes;
  ALTER TABLE nap_join_requests DROP COLUMN vote_ends_at;
  DROP TABLE nap_history;
  CREATE TABLE nap_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag TEXT NOT NULL CHECK (tag <> ''),
    kind TEXT NOT NULL CHECK (kind IN ('joined', 'left')),
    at TEXT NOT NULL,
    actor_id TEXT NOT NULL CHECK (actor_id <> '' AND actor_id NOT GLOB '*[^0-9]*'),
    requested_by TEXT CHECK (requested_by IS NULL OR (requested_by <> '' AND requested_by NOT GLOB '*[^0-9]*')),
    requested_at TEXT,
    approved_as TEXT CHECK (approved_as IS NULL OR approved_as IN ('council', 'officer')),
    CHECK ((kind = 'joined') = (requested_by IS NOT NULL)),
    CHECK ((kind = 'joined') = (requested_at IS NOT NULL)),
    CHECK ((kind = 'joined') = (approved_as IS NOT NULL))
  );
  DELETE FROM schema_migrations WHERE version = 25`;

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
      { version: 15 },
      { version: 16 },
      { version: 17 },
      { version: 18 },
      { version: 19 },
      { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
      { version: 15 },
      { version: 16 },
      { version: 17 },
      { version: 18 },
      { version: 19 },
      { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
    ]);
    db.close();
  });

  test("refuses a database written by a newer build", () => {
    const db = openDatabase(dataDir);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (99, '2026-10-29T12:00:00.000Z')").run();
    db.close();

    expect(() => openDatabase(dataDir)).toThrow("neil.db has schema version 99, this build knows only up to 29");
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
      { version: 15 },
      { version: 16 },
      { version: 17 },
      { version: 18 },
      { version: 19 },
      { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
        { version: 15 },
        { version: 16 },
        { version: 17 },
        { version: 18 },
        { version: 19 },
        { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
        { version: 15 },
        { version: 16 },
        { version: 17 },
        { version: 18 },
        { version: 19 },
        { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
        { version: 15 },
        { version: 16 },
        { version: 17 },
        { version: 18 },
        { version: 19 },
        { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
        { version: 15 },
        { version: 16 },
        { version: 17 },
        { version: 18 },
        { version: 19 },
        { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
      { version: 15 },
      { version: 16 },
      { version: 17 },
      { version: 18 },
      { version: 19 },
      { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
        { version: 15 },
        { version: 16 },
        { version: 17 },
        { version: 18 },
        { version: 19 },
        { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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
        { version: 15 },
        { version: 16 },
        { version: 17 },
        { version: 18 },
        { version: 19 },
        { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
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

  test("migration 15 creates the Event tables", () => {
    const db = openDatabase(dataDir);
    try {
      expect(
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('events', 'event_reminders_sent', 'event_kinds', 'event_invitations_off') ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: "event_invitations_off" },
        { name: "event_kinds" },
        { name: "event_reminders_sent" },
        { name: "events" },
      ]);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 14 database to 15 and keeps its Booty Alerts", () => {
    const legacy = new DatabaseSync(join(dataDir, "neil.db"));
    legacy.exec(readFileSync(join(import.meta.dirname, "__fixtures__", "schema-v14.sql"), "utf8"));
    legacy
      .prepare("INSERT INTO booty_alerts (member_id, mode, window_start, window_end, time_zone) VALUES (?, ?, ?, ?, ?)")
      .run("member-1", "offline", 480, 1380, "Europe/Lisbon");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT version FROM schema_migrations WHERE version >= 14 ORDER BY version").all()).toEqual([
        { version: 14 },
        { version: 15 },
        { version: 16 },
        { version: 17 },
        { version: 18 },
        { version: 19 },
        { version: 20 },
      { version: 21 },
      { version: 22 },
      { version: 23 },
      { version: 24 },
      { version: 25 },
      { version: 26 },
      { version: 27 },
      { version: 28 },
      { version: 29 },
      ]);
      expect(db.prepare("SELECT member_id, mode, window_start, window_end, time_zone FROM booty_alerts").all()).toEqual([
        { member_id: "member-1", mode: "offline", window_start: 480, window_end: 1380, time_zone: "Europe/Lisbon" },
      ]);
    } finally {
      db.close();
    }
  });
  test("upgrades a version 17 database to 29 and creates the empty city_rotation table, keeping the Duel Plan days", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_28);
    legacy.exec("DROP TABLE nap_rules_versions; DROP TABLE nap_motion_votes; DROP TABLE nap_motions; DROP TABLE nap_list; DROP TABLE king_moves; DROP TABLE nap_votes; DROP TABLE nap_history; DROP TABLE nap_join_requests");
    legacy.exec("DROP TABLE availability_answers; DROP TABLE availability_cards; DROP TABLE availability_polls");
    legacy.exec("DROP TABLE handover_posts; DROP TABLE city_rotation; DELETE FROM schema_migrations WHERE version >= 18");
    legacy.prepare("INSERT INTO duel_plan_posts (server_day, posted_at) VALUES (?, ?)").run("2026-11-16", "2026-11-16T02:00:00.000Z");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM city_rotation").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT server_day FROM duel_plan_posts").all()).toEqual([{ server_day: "2026-11-16" }]);
    } finally {
      db.close();
    }
  });

  test("city_rotation holds one row, and a waiting Handover has both its tag and its siege", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare("INSERT INTO city_rotation (id, pending_tag, pending_siege_at) VALUES (?, ?, ?)");
      expect(() => insert.run(2, null, null)).toThrow(/CHECK/);
      expect(() => insert.run(1, "NML", null)).toThrow(/CHECK/);
      insert.run(1, "NML", "2026-11-20T20:00:00.000Z");
    } finally {
      db.close();
    }
  });

  test("upgrades a version 19 database to 29 and creates the empty handover_posts table, keeping the City Rotation", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_25);
    legacy.exec("DROP TABLE nap_list; DELETE FROM schema_migrations WHERE version = 24");
    legacy.exec("ALTER TABLE city_rotation DROP COLUMN paused; ALTER TABLE city_rotation DROP COLUMN next_tag; DELETE FROM schema_migrations WHERE version = 23");
    legacy.exec("DROP TABLE king_moves; DELETE FROM schema_migrations WHERE version = 22");
    legacy.exec("DROP TABLE nap_history; DROP TABLE nap_join_requests; DELETE FROM schema_migrations WHERE version = 21");
    legacy.exec("DROP TABLE handover_posts; DELETE FROM schema_migrations WHERE version = 20");
    legacy.prepare("INSERT INTO city_rotation (id, holding_tag) VALUES (1, ?)").run("NML");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM handover_posts").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT holding_tag FROM city_rotation").all()).toEqual([{ holding_tag: "NML" }]);
    } finally {
      db.close();
    }
  });

  test("handover_posts keeps one row per siege and kind, and only the three kinds", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare("INSERT INTO handover_posts (siege_at, kind, posted_at) VALUES (?, ?, ?)");
      insert.run("2026-11-20T20:00:00.000Z", "reminder-24h", "2026-11-19T20:00:00.000Z");
      expect(() => insert.run("2026-11-20T20:00:00.000Z", "reminder-24h", "2026-11-19T20:01:00.000Z")).toThrow(/UNIQUE/);
      expect(() => insert.run("2026-11-20T20:00:00.000Z", "reminder-2h", "2026-11-20T18:00:00.000Z")).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 20 database to 29 and creates the empty NaP tables, keeping the City Rotation", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_25);
    legacy.exec("DROP TABLE nap_list; DELETE FROM schema_migrations WHERE version = 24");
    legacy.exec("ALTER TABLE city_rotation DROP COLUMN paused; ALTER TABLE city_rotation DROP COLUMN next_tag; DELETE FROM schema_migrations WHERE version = 23");
    legacy.exec("DROP TABLE king_moves; DELETE FROM schema_migrations WHERE version = 22");
    legacy.exec("DROP TABLE nap_history; DROP TABLE nap_join_requests; DELETE FROM schema_migrations WHERE version = 21");
    legacy.prepare("INSERT INTO city_rotation (id, holding_tag) VALUES (1, ?)").run("NML");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_history").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_join_requests").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT holding_tag FROM city_rotation").all()).toEqual([{ holding_tag: "NML" }]);
    } finally {
      db.close();
    }
  });

  test("nap_history sets the request columns for a join or decline, and an actor exactly unless decided by vote", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare(
        `INSERT INTO nap_history (tag, kind, at, actor_id, requested_by, requested_at, decided_as, approve_votes, decline_votes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const at = "2026-11-16T20:00:00.000Z";
      insert.run("NML", "joined", at, "222222222222222222", "111111111111111111", at, "officer", null, null);
      insert.run("NML", "left", at, "111111111111111111", null, null, null, null, null);
      insert.run("ABC", "joined", at, null, "111111111111111111", at, "vote", 2, 1);
      insert.run("XYZ", "declined", at, null, "111111111111111111", at, "vote", 0, 0);
      insert.run("XYZ", "declined", at, "222222222222222222", "111111111111111111", at, "officer", null, null);
      expect(() => insert.run("NML", "joined", at, "2", null, null, null, null, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "left", at, "1", "1", at, "council", null, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "joined", at, "2", "1", at, "king", null, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "left", at, "Alice", null, null, null, null, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "voted", at, "1", null, null, null, null, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "joined", at, "2", "1", at, "vote", 1, 0)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "joined", at, null, "1", at, "vote", 1, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "joined", at, null, "1", at, "officer", null, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "joined", at, "2", "1", at, "officer", 1, 0)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "declined", at, "2", "1", at, "council", null, null)).toThrow(/CHECK/);
      expect(() => insert.run("NML", "joined", at, null, "1", at, "vote", -1, 0)).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  test("nap_votes keeps one vote per Alliance per request, ignoring letter case, with the voter's Discord user id", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare(
        "INSERT INTO nap_votes (tag, requested_at, alliance_tag, voter_id, vote, at) VALUES (?, '2026-11-16T20:00:00.000Z', ?, ?, ?, '2026-11-16T21:00:00.000Z')",
      );
      insert.run("ABC", "NML", "111111111111111111", "approve");
      insert.run("ABC", "XYZ", "111111111111111112", "decline");
      expect(() => insert.run("abc", "nml", "111111111111111113", "decline")).toThrow(/UNIQUE|PRIMARY/);
      expect(() => insert.run("ABC", "QQQ", "Alice", "approve")).toThrow(/CHECK/);
      expect(() => insert.run("ABC", "QQQ", "1", "abstain")).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 24 database to 29, keeping the NaP history and the open request with the same meaning", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_25);
    const at = "2026-11-16T20:00:00.000Z";
    const insert = legacy.prepare(
      "INSERT INTO nap_history (tag, kind, at, actor_id, requested_by, requested_at, approved_as) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insert.run("NML", "joined", at, "222222222222222222", "111111111111111111", at, "officer");
    insert.run("ABC", "joined", at, "111111111111111111", "333333333333333333", at, "council");
    insert.run("ABC", "left", at, "333333333333333333", null, null, null);
    legacy
      .prepare("INSERT INTO nap_join_requests (tag, requested_by, requested_at, channel_id, message_id) VALUES (?, ?, ?, ?, ?)")
      .run("XYZ", "444444444444444444", at, "555555555555555555", "666666666666666666");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(
        db.prepare("SELECT id, tag, kind, actor_id, decided_as, approve_votes, decline_votes FROM nap_history ORDER BY id").all(),
      ).toEqual([
        { id: 1, tag: "NML", kind: "joined", actor_id: "222222222222222222", decided_as: "officer", approve_votes: null, decline_votes: null },
        { id: 2, tag: "ABC", kind: "joined", actor_id: "111111111111111111", decided_as: "council", approve_votes: null, decline_votes: null },
        { id: 3, tag: "ABC", kind: "left", actor_id: "333333333333333333", decided_as: null, approve_votes: null, decline_votes: null },
      ]);
      expect(db.prepare("SELECT tag, message_id, vote_ends_at FROM nap_join_requests").all()).toEqual([
        { tag: "XYZ", message_id: "666666666666666666", vote_ends_at: null },
      ]);
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_votes").get()).toEqual({ count: 0 });
      db.prepare("INSERT INTO nap_history (tag, kind, at, actor_id) VALUES ('NML', 'left', ?, '1')").run(at);
      expect(db.prepare("SELECT MAX(id) AS id FROM nap_history").get()).toEqual({ id: 4 });
    } finally {
      db.close();
    }
  });

  test("nap_join_requests keeps one open request per tag, ignoring letter case", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare("INSERT INTO nap_join_requests (tag, requested_by, requested_at) VALUES (?, ?, ?)");
      insert.run("NML", "111111111111111111", "2026-11-16T20:00:00.000Z");
      expect(() => insert.run("nml", "111111111111111111", "2026-11-16T20:01:00.000Z")).toThrow(/UNIQUE/);
      expect(() => insert.run("ABC", "Alice", "2026-11-16T20:01:00.000Z")).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 21 database to 29 and creates the empty king_moves table, keeping the City Rotation", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_25);
    legacy.exec("DROP TABLE nap_list; DELETE FROM schema_migrations WHERE version = 24");
    legacy.exec("ALTER TABLE city_rotation DROP COLUMN paused; ALTER TABLE city_rotation DROP COLUMN next_tag; DELETE FROM schema_migrations WHERE version = 23");
    legacy.exec("DROP TABLE king_moves; DELETE FROM schema_migrations WHERE version = 22");
    legacy.prepare("INSERT INTO city_rotation (id, holding_tag) VALUES (1, ?)").run("NML");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM king_moves").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT holding_tag FROM city_rotation").all()).toEqual([{ holding_tag: "NML" }]);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 22 database to 29, keeping the City Rotation running and with no Alliance recorded as next", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_25);
    legacy.exec("DROP TABLE nap_list; DELETE FROM schema_migrations WHERE version = 24");
    legacy.exec(
      "ALTER TABLE city_rotation DROP COLUMN paused; ALTER TABLE city_rotation DROP COLUMN next_tag; DELETE FROM schema_migrations WHERE version = 23",
    );
    legacy.prepare("INSERT INTO city_rotation (id, holding_tag) VALUES (1, ?)").run("NML");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT holding_tag, paused, next_tag FROM city_rotation").all()).toEqual([
        { holding_tag: "NML", paused: 0, next_tag: null },
      ]);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 23 database to 29 and creates the empty nap_list table, keeping the NaP history", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_25);
    legacy.exec("DROP TABLE nap_list; DELETE FROM schema_migrations WHERE version = 24");
    legacy
      .prepare("INSERT INTO nap_history (tag, kind, at, actor_id) VALUES ('NML', 'left', ?, '111111111111111111')")
      .run("2026-11-16T20:00:00.000Z");
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_list").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT tag FROM nap_history").all()).toEqual([{ tag: "NML" }]);
    } finally {
      db.close();
    }
  });

  test("nap_list holds one row with a message id of digits", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare("INSERT INTO nap_list (id, message_id) VALUES (?, ?)");
      expect(() => insert.run(2, "123")).toThrow(/CHECK/);
      expect(() => insert.run(1, "")).toThrow(/CHECK/);
      expect(() => insert.run(1, "abc")).toThrow(/CHECK/);
      insert.run(1, "123456789012345678");
    } finally {
      db.close();
    }
  });

  test("king_moves holds one row, and an applied move names who applied it and when", () => {
    const db = openDatabase(dataDir);
    try {
      const insert = db.prepare(
        `INSERT INTO king_moves (id, holding_tag, leader_uid, new_king_id, previous_kings_json, prepared_at, state,
                                 applied_by, applied_at)
         VALUES (?, 'NML', '145563254785', '111', '[]', '2026-11-20T20:05:00.000Z', ?, ?, ?)`,
      );
      expect(() => insert.run(2, "prepared", null, null)).toThrow(/CHECK/);
      expect(() => insert.run(1, "applied", null, null)).toThrow(/CHECK/);
      expect(() => insert.run(1, "prepared", "222", "2026-11-20T21:00:00.000Z")).toThrow(/CHECK/);
      insert.run(1, "applied", "222", "2026-11-20T21:00:00.000Z");
    } finally {
      db.close();
    }
  });

  test("upgrades a version 25 database to 29 and creates the empty NaP Motion tables, keeping the NaP votes", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_26);
    legacy
      .prepare(
        "INSERT INTO nap_votes (tag, requested_at, alliance_tag, voter_id, vote, at) VALUES ('ABC', '2026-11-16T20:00:00.000Z', 'NML', '111111111111111111', 'approve', '2026-11-16T21:00:00.000Z')",
      )
      .run();
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_motions").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_motion_votes").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_votes").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  test("nap_motions keeps a closed motion's outcome and counts, and nap_motion_votes one vote per Alliance per motion", () => {
    const db = openDatabase(dataDir);
    try {
      const at = "2026-11-18T12:00:00.000Z";
      const insert = db.prepare(
        `INSERT INTO nap_motions (text, opened_by, opener_tag, opened_at, ends_at, closed_at, outcome, approve_votes, decline_votes)
         VALUES (?, ?, 'NML', '${at}', '${at}', ?, ?, ?, ?)`,
      );
      insert.run("Open", "111111111111111111", null, null, null, null);
      insert.run("Closed", "111111111111111111", at, "approved", 2, 1);
      insert.run("Rejected", "111111111111111111", at, "rejected", 0, 0);
      expect(() => insert.run("", "111111111111111111", null, null, null, null)).toThrow(/CHECK/);
      expect(() => insert.run("Text", "Alice", null, null, null, null)).toThrow(/CHECK/);
      expect(() => insert.run("Text", "1", at, null, null, null)).toThrow(/CHECK/);
      expect(() => insert.run("Text", "1", at, "approved", null, 0)).toThrow(/CHECK/);
      expect(() => insert.run("Text", "1", null, "approved", 1, 0)).toThrow(/CHECK/);
      expect(() => insert.run("Text", "1", at, "declined", 1, 0)).toThrow(/CHECK/);
      expect(() => insert.run("Text", "1", at, "approved", -1, 0)).toThrow(/CHECK/);

      const vote = db.prepare(
        `INSERT INTO nap_motion_votes (motion_id, alliance_tag, voter_id, vote, at) VALUES (1, ?, ?, ?, '${at}')`,
      );
      vote.run("NML", "111111111111111111", "approve");
      vote.run("ABC", "111111111111111112", "decline");
      expect(() => vote.run("nml", "111111111111111113", "decline")).toThrow(/UNIQUE|PRIMARY/);
      expect(() => vote.run("QQQ", "Alice", "approve")).toThrow(/CHECK/);
      expect(() => vote.run("QQQ", "1", "abstain")).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });
  test("upgrades a version 26 database to 29 and creates the empty nap_rules_versions table, keeping the NaP Motions", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_27);
    legacy
      .prepare(
        "INSERT INTO nap_motions (text, opened_by, opener_tag, opened_at, ends_at) VALUES ('Text', '111111111111111111', 'NML', '2026-11-18T12:00:00.000Z', '2026-11-20T12:00:00.000Z')",
      )
      .run();
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_rules_versions").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM nap_motions").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  test("nap_rules_versions keeps a decided version with when it was decided, and refuses invalid states", () => {
    const db = openDatabase(dataDir);
    try {
      const at = "2026-11-18T12:00:00.000Z";
      const insert = db.prepare(
        `INSERT INTO nap_rules_versions (number, text, change, proposed_by, proposed_at, status, decided_at, motion)
         VALUES (?, ?, 'What changed', ?, '${at}', ?, ?, ?)`,
      );
      insert.run(1, "Rules", "111111111111111111", "approved", at, 1);
      insert.run(2, "Rules 2", "111111111111111111", "rejected", at, 2);
      insert.run(3, "Rules 3", "111111111111111111", "proposed", null, null);
      expect(() => insert.run(3, "Again", "111111111111111111", "proposed", null, null)).toThrow(/UNIQUE|PRIMARY/);
      expect(() => insert.run(4, "", "111111111111111111", "proposed", null, null)).toThrow(/CHECK/);
      expect(() => insert.run(4, "Rules", "Alice", "proposed", null, null)).toThrow(/CHECK/);
      expect(() => insert.run(4, "Rules", "1", "in-effect", at, null)).toThrow(/CHECK/);
      expect(() => insert.run(4, "Rules", "1", "approved", null, 1)).toThrow(/CHECK/);
      expect(() => insert.run(4, "Rules", "1", "proposed", at, null)).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 27 database to 29 and creates the empty Shield tables, keeping the NaP Rules", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec(UNDO_MIGRATION_28);
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      for (const table of ["kvk_week", "shield_reminder_sent", "shield_confirmation", "shield_reminders_off"]) {
        expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
    } finally {
      db.close();
    }
  });

  test("the Shield tables keep one row per key and refuse a member id that is not a snowflake", () => {
    const db = openDatabase(dataDir);
    try {
      const at = "2026-11-18T12:00:00.000Z";
      const mark = db.prepare(`INSERT INTO kvk_week (week, marked_at, marked_by) VALUES (?, '${at}', ?)`);
      mark.run("2026-11-21", "111111111111111111");
      expect(() => mark.run("2026-11-21", "111111111111111111")).toThrow(/UNIQUE|PRIMARY/);
      expect(() => mark.run("2026-11-28", "Alice")).toThrow(/CHECK/);
      const sent = db.prepare("INSERT INTO shield_reminder_sent (week, lead_minutes) VALUES ('2026-11-21', ?)");
      sent.run(60);
      expect(() => sent.run(60)).toThrow(/UNIQUE|PRIMARY/);
      expect(() => sent.run(0)).toThrow(/CHECK/);
      const confirm = db.prepare(`INSERT INTO shield_confirmation (week, member_id, confirmed_at) VALUES ('2026-11-21', ?, '${at}')`);
      confirm.run("111111111111111111");
      expect(() => confirm.run("111111111111111111")).toThrow(/UNIQUE|PRIMARY/);
      expect(() => confirm.run("Alice")).toThrow(/CHECK/);
      const off = db.prepare("INSERT INTO shield_reminders_off (member_id) VALUES (?)");
      off.run("111111111111111111");
      expect(() => off.run("111111111111111111")).toThrow(/UNIQUE|PRIMARY/);
      expect(() => off.run("")).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });

  test("upgrades a version 28 database to 29 and creates the empty NaP Report tables, keeping the Shield tables", () => {
    const legacy = openDatabase(dataDir);
    legacy.exec("INSERT INTO shield_reminders_off (member_id) VALUES ('111111111111111111')");
    legacy.exec(UNDO_MIGRATION_29);
    legacy.close();

    const db = openDatabase(dataDir);
    try {
      expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 29 });
      for (const table of ["nap_reports", "nap_report_proposals"]) {
        expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({ count: 0 });
      }
      expect(db.prepare("SELECT member_id FROM shield_reminders_off").all()).toEqual([{ member_id: "111111111111111111" }]);
    } finally {
      db.close();
    }
  });

  test("the NaP Report tables refuse invalid rows", () => {
    const db = openDatabase(dataDir);
    try {
      const at = "2026-11-19T12:00:00.000Z";
      const report = db.prepare(
        `INSERT INTO nap_reports (number, accused_tag, accused_uid, what, reported_by, reporter_tag, reported_at, thread_id)
         VALUES (?, ?, ?, ?, ?, 'ABC', '${at}', ?)`,
      );
      report.run(1, "XYZ", "12345", "Hit our farm", "111111111111111111", null);
      expect(() => report.run(1, "XYZ", null, "again", "111111111111111111", null)).toThrow(/UNIQUE|PRIMARY/);
      expect(() => report.run(0, "XYZ", null, "x", "111111111111111111", null)).toThrow(/CHECK/);
      expect(() => report.run(2, "", null, "x", "111111111111111111", null)).toThrow(/CHECK/);
      expect(() => report.run(2, "XYZ", "abc", "x", "111111111111111111", null)).toThrow(/CHECK/);
      expect(() => report.run(2, "XYZ", null, "", "111111111111111111", null)).toThrow(/CHECK/);
      expect(() => report.run(2, "XYZ", null, "x", "Alice", null)).toThrow(/CHECK/);
      expect(() => report.run(2, "XYZ", null, "x", "111111111111111111", "thread")).toThrow(/CHECK/);
      const proposal = db.prepare(
        `INSERT INTO nap_report_proposals (report, outcome, note, proposed_by, proposed_at, status, decided_at, motion)
         VALUES (?, ?, NULL, '111111111111111111', '${at}', ?, ?, ?)`,
      );
      proposal.run(1, "warning", "proposed", null, null);
      proposal.run(1, "exile", "approved", at, 3);
      expect(() => proposal.run(1, "banned", "proposed", null, null)).toThrow(/CHECK/);
      expect(() => proposal.run(1, "warning", "decided", at, 3)).toThrow(/CHECK/);
      expect(() => proposal.run(1, "warning", "proposed", at, 3)).toThrow(/CHECK/);
      expect(() => proposal.run(1, "warning", "approved", null, 3)).toThrow(/CHECK/);
      expect(() => proposal.run(1, "warning", "rejected", at, null)).toThrow(/CHECK/);
      expect(() => proposal.run(9, "warning", "proposed", null, null)).toThrow(/FOREIGN KEY/);
    } finally {
      db.close();
    }
  });
});
