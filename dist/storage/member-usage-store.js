import { z } from "zod";
import { utcDayOf } from "../domain/daily-quota.js";
/** How many days of Lookup Member records are kept: the four same-weekday records need 28 days. */
const RECORD_DAYS = 28;
const memberIdColumn = z.string().regex(/^\d+$/);
const isoDay = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)))
    .transform((day) => utcDayOf(new Date(`${day}T00:00:00Z`)));
const usageRow = z.object({
    member_id: memberIdColumn,
    requests: z.number().int().min(1),
});
const recordRow = z.object({
    day: isoDay,
    lookup_members: z.number().int().min(0),
});
const requestsRow = z.object({ requests: z.number().int().min(1) });
const dayRow = z.object({ day: isoDay });
function corruptUsageError() {
    return new Error("neil.db is corrupt: fix or remove the member usage by hand");
}
/** Keeps the Daily Allowance counts in neil.db; a corrupt row is an error, never a silent repair. */
export class MemberUsageStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Counts one Game API request of the Member on the day. */
    countRequest(memberId, day) {
        this.db
            .prepare(`INSERT INTO member_usage (day, member_id, requests) VALUES (?, ?, 1)
         ON CONFLICT (day, member_id) DO UPDATE SET requests = requests + 1`)
            .run(day, memberId);
    }
    /** The Member's requests on the day; 0 when there are none. */
    requestsOf(memberId, day) {
        const raw = this.db
            .prepare("SELECT requests FROM member_usage WHERE day = ? AND member_id = ?")
            .get(day, memberId);
        if (raw === undefined)
            return 0;
        const parsed = requestsRow.safeParse(raw);
        if (!parsed.success)
            throw corruptUsageError();
        return parsed.data.requests;
    }
    /** The earliest day with a Member's request in the usage, or undefined when there is none. */
    firstUsageDay() {
        const raw = this.db.prepare("SELECT day FROM member_usage ORDER BY day ASC LIMIT 1").get();
        if (raw === undefined)
            return undefined;
        const parsed = dayRow.safeParse(raw);
        if (!parsed.success)
            throw corruptUsageError();
        return parsed.data.day;
    }
    /** The Members who made requests on the day, most requests first, ties by Member id. */
    usageOn(day) {
        return this.db
            .prepare("SELECT member_id, requests FROM member_usage WHERE day = ? ORDER BY requests DESC, length(member_id) ASC, member_id ASC")
            .all(day)
            .map((raw) => {
            const parsed = usageRow.safeParse(raw);
            if (!parsed.success)
                throw corruptUsageError();
            return { memberId: parsed.data.member_id, requests: parsed.data.requests };
        });
    }
    /** Every stored Lookup Member record, oldest day first. */
    records() {
        return this.db
            .prepare("SELECT day, lookup_members FROM lookup_member_day ORDER BY day ASC")
            .all()
            .map((raw) => {
            const parsed = recordRow.safeParse(raw);
            if (!parsed.success)
                throw corruptUsageError();
            return { day: parsed.data.day, lookupMembers: parsed.data.lookup_members };
        });
    }
    /**
     * Records each given day with its Lookup Member count (the Members with a usage row that day), deletes the usage of
     * the days before today, and deletes the records older than 28 days. One transaction: any failure changes nothing.
     */
    rollover(days, today) {
        this.db.exec("BEGIN");
        try {
            const record = this.db.prepare("INSERT INTO lookup_member_day (day, lookup_members) VALUES (?, (SELECT COUNT(*) FROM member_usage WHERE day = ?))");
            for (const day of days)
                record.run(day, day);
            this.db.prepare("DELETE FROM member_usage WHERE day < ?").run(today);
            this.db.prepare(`DELETE FROM lookup_member_day WHERE day < date(?, '-${RECORD_DAYS.toString()} days')`).run(today);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
}
//# sourceMappingURL=member-usage-store.js.map