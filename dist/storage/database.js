import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
/**
 * Ordered schema changes; index + 1 is the version. Never edit an applied one, append a new one.
 *
 * Foreign keys are on, and a migration runs inside its transaction, where `PRAGMA foreign_keys` cannot be changed. So a
 * future migration that rebuilds a parent table (create the new one, copy, drop the old, rename) would cascade: `DROP
 * TABLE` deletes the child rows of an `ON DELETE CASCADE` reference first, and `link` rows would take their `applied`
 * rows with them. A rebuild of `link` must turn `foreign_keys` off before its transaction starts (in a separate step
 * of `openDatabase`), and check with `PRAGMA foreign_key_check` before it is turned back on.
 */
const migrations = [
    `CREATE TABLE start_record (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     first_started_at TEXT NOT NULL,
     start_count INTEGER NOT NULL CHECK (start_count >= 1)
   )`,
    `CREATE TABLE daily_quota (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     day TEXT NOT NULL,
     used INTEGER NOT NULL CHECK (used >= 0),
     quota_limit INTEGER NOT NULL CHECK (quota_limit >= 1),
     limit_reached INTEGER NOT NULL CHECK (limit_reached IN (0, 1)),
     confirmed_at TEXT
   )`,
    // Onboarding Interviews, Links and Rank Approvals (slice 005, ADR 7).
    `CREATE TABLE onboarding_interview (
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
   );
   CREATE INDEX onboarding_interview_due ON onboarding_interview (due_at);
   CREATE UNIQUE INDEX one_open_interview ON onboarding_interview (member_id)
     WHERE step IN ('awaiting-uid', 'checking', 'awaiting-confirmation', 'paused-for-quota');
   CREATE TABLE link (
     member_id TEXT PRIMARY KEY,
     uid TEXT NOT NULL UNIQUE,
     linked_at TEXT NOT NULL,
     rank_source TEXT NOT NULL,
     alliance_rank TEXT,
     approved_by TEXT,
     approved_at TEXT
   );
   CREATE TABLE rank_approval (
     id INTEGER PRIMARY KEY,
     linked_member_id TEXT NOT NULL,
     thread_id TEXT NOT NULL,
     approver_kind TEXT NOT NULL,
     approver_member_id TEXT,
     state TEXT NOT NULL,
     rank TEXT,
     approved_by TEXT,
     asked_at TEXT NOT NULL,
     ended_at TEXT
   )`,
    // Migration 4: the name lookup, the Recommended Player, the pick list and the chosen uid (slice 005, US6).
    `ALTER TABLE onboarding_interview ADD COLUMN chosen_uid TEXT;
   ALTER TABLE onboarding_interview ADD COLUMN chosen_player_json TEXT;
   ALTER TABLE onboarding_interview ADD COLUMN matches_json TEXT;
   DROP INDEX one_open_interview;
   CREATE UNIQUE INDEX one_open_interview ON onboarding_interview (member_id)
     WHERE step IN ('recommending', 'awaiting-recommendation', 'awaiting-pick', 'awaiting-uid', 'checking',
       'awaiting-confirmation', 'paused-for-quota')`,
    // Migration 5: the Applied State of each Link (slice 006, ADR 8). Its row goes with its Link (foreign keys are on).
    `CREATE TABLE applied (
     member_id TEXT PRIMARY KEY REFERENCES link (member_id) ON DELETE CASCADE,
     nickname TEXT NOT NULL,
     roles_json TEXT NOT NULL,
     applied_at TEXT NOT NULL,
     complete INTEGER NOT NULL CHECK (complete IN (0, 1))
   )`,
    // Migration 6: the Home Kingdom Alliances seen in Game API answers, for approximate name matching (slice 007).
    `CREATE TABLE known_alliance (
     kingdom INTEGER NOT NULL,
     tag TEXT NOT NULL,
     name TEXT NOT NULL,
     last_seen TEXT NOT NULL,
     PRIMARY KEY (kingdom, tag)
   )`,
    // Migration 7: the Alliance a Member was last applied in (slice 009, the Daily Sync), and the Daily Sync's record:
    // the day of its last run and the Members it left over for the next day.
    `ALTER TABLE applied ADD COLUMN alliance_kingdom INTEGER;
   ALTER TABLE applied ADD COLUMN alliance_tag TEXT;
   CREATE TABLE daily_sync (
     id INTEGER PRIMARY KEY CHECK (id = 1),
     day TEXT NOT NULL,
     left_over_json TEXT NOT NULL
   )`,
    // Migration 8: whether the Alliance of an Applied State was recorded. A row from before migration 7 has no Alliance
    // columns, which is not the same as no Alliance; the rows that already name an Alliance are recorded.
    `ALTER TABLE applied ADD COLUMN alliance_recorded INTEGER NOT NULL DEFAULT 0 CHECK (alliance_recorded IN (0, 1));
   UPDATE applied SET alliance_recorded = 1 WHERE alliance_kingdom IS NOT NULL`,
    // Migration 9: who made a Link (slice 011). NULL is In-game Proof, as every Link before it; an Officer Link names its
    // Officer.
    `ALTER TABLE link ADD COLUMN linked_by TEXT`,
    // Migration 10: linked_by is a snowflake or NULL (slice 011, review C4). SQLite cannot add a CHECK to a column, so a
    // trigger on each write refuses any other value.
    `CREATE TRIGGER link_linked_by_on_insert BEFORE INSERT ON link
     WHEN NEW.linked_by IS NOT NULL AND (NEW.linked_by = '' OR NEW.linked_by GLOB '*[^0-9]*')
     BEGIN SELECT RAISE(ABORT, 'link.linked_by must be a snowflake or NULL'); END;
   CREATE TRIGGER link_linked_by_on_update BEFORE UPDATE OF linked_by ON link
     WHEN NEW.linked_by IS NOT NULL AND (NEW.linked_by = '' OR NEW.linked_by GLOB '*[^0-9]*')
     BEGIN SELECT RAISE(ABORT, 'link.linked_by must be a snowflake or NULL'); END`,
    // Migration 11: the Exiles of REAPER (slice 014). A position has both coordinates and its read time, or none of them.
    `CREATE TABLE reaper (
     uid TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     kingdom INTEGER NOT NULL,
     x REAL,
     y REAL,
     position_at TEXT,
     reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
     added_at TEXT NOT NULL,
     added_by TEXT NOT NULL,
     CHECK ((x IS NULL) = (y IS NULL) AND (x IS NULL) = (position_at IS NULL))
   );
   CREATE INDEX reaper_kingdom ON reaper (kingdom)`,
    // Migration 12: Preferences and the open Preferences message (slice 016). A Preference is one row per Member, kind and
    // value; a preference_prompt row marks the Preferences message still open in the Member's Interview thread. member_id
    // is a snowflake in both (slice 016, review C1).
    `CREATE TABLE preference (
     member_id TEXT NOT NULL CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*'),
     kind TEXT NOT NULL,
     value TEXT NOT NULL,
     PRIMARY KEY (member_id, kind, value)
   );
   CREATE TABLE preference_prompt (
     member_id TEXT PRIMARY KEY CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*'),
     thread_id TEXT NOT NULL,
     posted_at TEXT NOT NULL
   )`,
    // Migration 13: the Daily Allowance (slice 015, ADR 10). member_usage holds one Member's requests on a UTC day, and
    // lookup_member_day the Lookup Member count of each finished day. A Member without a request has no row.
    `CREATE TABLE member_usage (
     day TEXT NOT NULL,
     member_id TEXT NOT NULL CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*'),
     requests INTEGER NOT NULL CHECK (requests > 0),
     PRIMARY KEY (day, member_id)
   );
   CREATE TABLE lookup_member_day (
     day TEXT PRIMARY KEY,
     lookup_members INTEGER NOT NULL CHECK (lookup_members >= 0)
   )`,
    // Migration 14: the Booty Alerts of a Member (slice 026). No row means Off. The mode and the minutes are checked when
    // read, by the store, so a corrupt row is refused rather than reset.
    `CREATE TABLE booty_alerts (
     member_id TEXT PRIMARY KEY,
     mode TEXT NOT NULL,
     window_start INTEGER NOT NULL,
     window_end INTEGER NOT NULL,
     time_zone TEXT NOT NULL
   )`,
    // Migration 15: Events, their Event Reminders and Event Kinds, and who turned Event Invitations off (slice 028). An
    // Event is kept from the first time Neil sees it; a reminder row goes with its Event. An Event Kind's name is unique
    // per owner ignoring case; the store keeps at most 25 per owner.
    `CREATE TABLE events (
     event_id TEXT PRIMARY KEY CHECK (event_id <> '' AND event_id NOT GLOB '*[^0-9]*'),
     first_seen_at TEXT NOT NULL,
     invited_at TEXT
   );
   CREATE TABLE event_reminders_sent (
     event_id TEXT NOT NULL REFERENCES events (event_id) ON DELETE CASCADE,
     target TEXT NOT NULL CHECK (target IN ('start', 'signup')),
     lead_minutes INTEGER NOT NULL CHECK (lead_minutes >= 1),
     PRIMARY KEY (event_id, target, lead_minutes)
   );
   CREATE TABLE event_kinds (
     id INTEGER PRIMARY KEY,
     owner TEXT NOT NULL CHECK (owner <> ''),
     name TEXT NOT NULL COLLATE NOCASE CHECK (name <> ''),
     before_start TEXT NOT NULL,
     signup_offset_minutes INTEGER CHECK (signup_offset_minutes IS NULL OR signup_offset_minutes >= 1),
     before_signup TEXT NOT NULL,
     UNIQUE (owner, name)
   );
   CREATE TABLE event_invitations_off (
     member_id TEXT PRIMARY KEY CHECK (member_id <> '' AND member_id NOT GLOB '*[^0-9]*')
   )`,
];
/** Opens DATA_DIR/neil.db and applies any pending migrations in one transaction. */
export function openDatabase(dataDir) {
    const db = new DatabaseSync(join(dataDir, "neil.db"));
    try {
        db.exec("PRAGMA foreign_keys = ON");
        db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
        const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
        const applied = typeof row?.version === "number" ? row.version : 0;
        if (applied > migrations.length) {
            throw new Error(`neil.db has schema version ${applied.toString()}, this build knows only up to ${migrations.length.toString()}`);
        }
        const record = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
        db.exec("BEGIN");
        try {
            migrations.slice(applied).forEach((sql, index) => {
                db.exec(sql);
                record.run(applied + index + 1, new Date().toISOString());
            });
            db.exec("COMMIT");
        }
        catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }
    catch (error) {
        db.close();
        throw error;
    }
    return db;
}
//# sourceMappingURL=database.js.map