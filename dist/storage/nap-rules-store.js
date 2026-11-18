import { z } from "zod";
const snowflake = z.string().regex(/^\d{1,20}$/);
const columns = {
    number: z.number().int().positive(),
    text: z.string().min(1),
    change: z.string().min(1),
    proposed_by: snowflake,
    proposed_at: z.iso.datetime(),
    motion: z.number().int().positive().nullable(),
};
const versionRow = z.union([
    z.object({ ...columns, status: z.literal("proposed"), decided_at: z.null() }),
    z.object({ ...columns, status: z.enum(["approved", "rejected"]), decided_at: z.iso.datetime() }),
]);
const CORRUPT = "the NaP Rules in neil.db are corrupt; fix or remove them by hand";
/**
 * Keeps the NaP Rules in neil.db (ADR 26): every NaP Rules Version, its proposer and its NaP Motion. Versions are never
 * deleted, except a proposal that could not be put to a NaP Motion. Every method is synchronous, so a check and the
 * write after it run with no await in between.
 */
export class NapRulesStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Every version, oldest first. */
    versions() {
        return this.db
            .prepare("SELECT number, text, change, proposed_by, proposed_at, status, decided_at, motion FROM nap_rules_versions ORDER BY number")
            .all()
            .map(versionOf);
    }
    /** Stores a new proposed version with the next number, not put to a NaP Motion yet, and gives its number. */
    propose(version) {
        const result = this.db
            .prepare(`INSERT INTO nap_rules_versions (number, text, change, proposed_by, proposed_at, status)
         VALUES ((SELECT COALESCE(MAX(number), 0) + 1 FROM nap_rules_versions), ?, ?, ?, ?, 'proposed')`)
            .run(version.text, version.change, version.proposedBy, version.proposedAt.toISOString());
        return Number(result.lastInsertRowid);
    }
    /** Records the NaP Motion the proposed version was put to. */
    setMotion(number, motion) {
        this.db.prepare("UPDATE nap_rules_versions SET motion = ? WHERE number = ?").run(motion, number);
    }
    /** Removes a proposed version that could not be put to a NaP Motion; nothing for any other version. */
    remove(number) {
        this.db
            .prepare("DELETE FROM nap_rules_versions WHERE number = ? AND status = 'proposed' AND motion IS NULL")
            .run(number);
    }
    /** Decides a proposed version by its NaP Motion's outcome; false, and nothing changed, when it was already decided. */
    decide(number, outcome, at) {
        const result = this.db
            .prepare("UPDATE nap_rules_versions SET status = ?, decided_at = ? WHERE number = ? AND status = 'proposed'")
            .run(outcome, at.toISOString(), number);
        return Number(result.changes) > 0;
    }
}
function versionOf(raw) {
    const parsed = versionRow.safeParse(raw);
    if (!parsed.success)
        throw new Error(CORRUPT);
    const row = parsed.data;
    return {
        number: row.number,
        text: row.text,
        change: row.change,
        proposedBy: row.proposed_by,
        proposedAt: new Date(row.proposed_at),
        status: row.status === "proposed" ? { kind: "proposed" } : { kind: row.status, decidedAt: new Date(row.decided_at) },
        motion: row.motion ?? undefined,
    };
}
//# sourceMappingURL=nap-rules-store.js.map