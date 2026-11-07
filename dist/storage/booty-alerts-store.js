import { z } from "zod";
import { parseBootyWindow } from "../domain/booty.js";
const storedRow = z.object({
    mode: z.enum(["off", "always", "online", "offline"]),
    window_start: z.number().int(),
    window_end: z.number().int(),
    time_zone: z.string().min(1),
});
const CORRUPT_MESSAGE = "the Booty Alerts in neil.db is corrupt; fix or remove it by hand";
/** Keeps each Member's Booty Alerts in neil.db. No row means Off. A row that does not read is refused, not reset. */
export class BootyAlertsStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** The Member's Booty Alerts, or undefined when none are stored (which means Off). */
    get(memberId) {
        const raw = this.db
            .prepare("SELECT mode, window_start, window_end, time_zone FROM booty_alerts WHERE member_id = ?")
            .get(memberId);
        if (raw === undefined)
            return undefined;
        const parsed = storedRow.safeParse(raw);
        if (!parsed.success)
            throw new Error(CORRUPT_MESSAGE);
        const window = parseBootyWindow(parsed.data.window_start, parsed.data.window_end);
        if (!window.ok)
            throw new Error(CORRUPT_MESSAGE);
        return { mode: parsed.data.mode, window: window.value, timeZone: parsed.data.time_zone };
    }
    /** Replaces the Member's Booty Alerts. */
    save(memberId, alerts) {
        this.db
            .prepare("INSERT OR REPLACE INTO booty_alerts (member_id, mode, window_start, window_end, time_zone) VALUES (?, ?, ?, ?, ?)")
            .run(memberId, alerts.mode, alerts.window.startMinute, alerts.window.endMinute, alerts.timeZone);
    }
    /** Deletes the Member's Booty Alerts, so they read as Off again. */
    forget(memberId) {
        this.db.prepare("DELETE FROM booty_alerts WHERE member_id = ?").run(memberId);
    }
}
//# sourceMappingURL=booty-alerts-store.js.map