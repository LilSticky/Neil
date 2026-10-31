import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Ordered schema changes; index + 1 is the version. Never edit an applied one, append a new one. */
const migrations: readonly string[] = [
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
];

/** Opens DATA_DIR/neil.db and applies any pending migrations in one transaction. */
export function openDatabase(dataDir: string): DatabaseSync {
  const db = new DatabaseSync(join(dataDir, "neil.db"));
  try {
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
    const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
    const applied = typeof row?.version === "number" ? row.version : 0;
    if (applied > migrations.length) {
      throw new Error(
        `neil.db has schema version ${applied.toString()}, this build knows only up to ${migrations.length.toString()}`,
      );
    }
    const record = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
    db.exec("BEGIN");
    try {
      migrations.slice(applied).forEach((sql, index) => {
        db.exec(sql);
        record.run(applied + index + 1, new Date().toISOString());
      });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
