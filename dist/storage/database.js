import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
/** Ordered schema changes; index + 1 is the version. Never edit an applied one, append a new one. */
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
];
/** Opens DATA_DIR/neil.db and applies any pending migrations in one transaction. */
export function openDatabase(dataDir) {
    const db = new DatabaseSync(join(dataDir, "neil.db"));
    try {
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