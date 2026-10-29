import { z } from "zod";
import { startCount } from "../domain/start-record.js";
const row = z.object({
    first_started_at: z.iso.datetime(),
    start_count: z.number().int().min(1),
});
/** Keeps the one start record in neil.db; a corrupt row is an error, never a silent reset. */
export class StartRecordStore {
    db;
    constructor(db) {
        this.db = db;
    }
    load() {
        const raw = this.db.prepare("SELECT first_started_at, start_count FROM start_record WHERE id = 1").get();
        if (raw === undefined)
            return undefined;
        const parsed = row.safeParse(raw);
        if (!parsed.success)
            throw new Error("the start record in neil.db is corrupt; fix or remove it by hand");
        return {
            firstStartedAt: new Date(parsed.data.first_started_at),
            startCount: startCount(parsed.data.start_count),
        };
    }
    save(record) {
        this.db
            .prepare(`INSERT INTO start_record (id, first_started_at, start_count) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET first_started_at = excluded.first_started_at, start_count = excluded.start_count`)
            .run(record.firstStartedAt.toISOString(), record.startCount);
    }
}
//# sourceMappingURL=start-record-store.js.map