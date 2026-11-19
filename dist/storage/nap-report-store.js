import { z } from "zod";
import { parseUid } from "../domain/lookup-input.js";
import { NAP_REPORT_OUTCOMES, } from "../domain/nap-report.js";
const snowflake = z.string().regex(/^\d{1,20}$/);
const uidColumn = z.string().transform((value, ctx) => {
    const parsed = parseUid(value);
    if (parsed.ok)
        return parsed.value;
    ctx.addIssue({ code: "custom", message: "not a Player uid" });
    return z.NEVER;
});
const reportRow = z.object({
    number: z.number().int().positive(),
    accused_tag: z.string().min(1),
    accused_uid: uidColumn.nullable(),
    what: z.string().min(1),
    reported_by: snowflake,
    reporter_tag: z.string().min(1),
    reported_at: z.iso.datetime(),
    thread_id: snowflake.nullable(),
});
const proposalColumns = {
    id: z.number().int().positive(),
    report: z.number().int().positive(),
    outcome: z.enum(NAP_REPORT_OUTCOMES),
    note: z.string().min(1).nullable(),
    proposed_by: snowflake,
    proposed_at: z.iso.datetime(),
    motion: z.number().int().positive().nullable(),
};
const proposalRow = z.union([
    z.object({ ...proposalColumns, status: z.literal("proposed"), decided_at: z.null() }),
    z.object({ ...proposalColumns, status: z.enum(["approved", "rejected"]), decided_at: z.iso.datetime() }),
]);
const CORRUPT = "the NaP Reports in neil.db are corrupt; fix or remove them by hand";
/**
 * Keeps the NaP Reports in neil.db (ADR 28): every report and every Report Outcome proposed for it. Rows are kept forever
 * and never deleted at Unlink, except a report whose thread could not be opened and a proposal whose NaP Motion could not
 * be opened. Every method is synchronous, so a check and the write after it run with no await in between.
 */
export class NapReportStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Every report, oldest first. */
    reports() {
        return this.db
            .prepare("SELECT number, accused_tag, accused_uid, what, reported_by, reporter_tag, reported_at, thread_id FROM nap_reports ORDER BY number")
            .all()
            .map(reportOf);
    }
    /** Every proposed Report Outcome, oldest first. */
    proposals() {
        return this.db
            .prepare("SELECT id, report, outcome, note, proposed_by, proposed_at, status, decided_at, motion FROM nap_report_proposals ORDER BY id")
            .all()
            .map(proposalOf);
    }
    /** Stores a new report with the next number, without its thread yet, and gives its number. */
    file(report) {
        const result = this.db
            .prepare(`INSERT INTO nap_reports (number, accused_tag, accused_uid, what, reported_by, reporter_tag, reported_at)
         VALUES ((SELECT COALESCE(MAX(number), 0) + 1 FROM nap_reports), ?, ?, ?, ?, ?, ?)`)
            .run(report.accusedTag, report.accusedUid ?? null, report.what, report.reportedBy, report.reporterTag, report.reportedAt.toISOString());
        return Number(result.lastInsertRowid);
    }
    /** Records the private thread the report was opened in. */
    setThread(number, threadId) {
        this.db.prepare("UPDATE nap_reports SET thread_id = ? WHERE number = ?").run(threadId, number);
    }
    /** Removes a report whose thread could not be opened; nothing for a report with a thread or with proposals. */
    remove(number) {
        this.db
            .prepare("DELETE FROM nap_reports WHERE number = ? AND thread_id IS NULL AND NOT EXISTS (SELECT 1 FROM nap_report_proposals WHERE report = ?)")
            .run(number, number);
    }
    /** Stores a proposed Report Outcome, not put to a NaP Motion yet, and gives its id. */
    propose(proposal) {
        const result = this.db
            .prepare(`INSERT INTO nap_report_proposals (report, outcome, note, proposed_by, proposed_at, status)
         VALUES (?, ?, ?, ?, ?, 'proposed')`)
            .run(proposal.report, proposal.outcome, proposal.note ?? null, proposal.proposedBy, proposal.proposedAt.toISOString());
        return Number(result.lastInsertRowid);
    }
    /** Records the NaP Motion the proposal was put to. */
    setMotion(id, motion) {
        this.db.prepare("UPDATE nap_report_proposals SET motion = ? WHERE id = ?").run(motion, id);
    }
    /** Removes a proposal that could not be put to a NaP Motion; nothing for any other proposal. */
    removeProposal(id) {
        this.db.prepare("DELETE FROM nap_report_proposals WHERE id = ? AND status = 'proposed' AND motion IS NULL").run(id);
    }
    /** Decides a proposal by its NaP Motion's outcome; false, and nothing changed, when it was already decided. */
    decide(id, verdict, at) {
        const result = this.db
            .prepare("UPDATE nap_report_proposals SET status = ?, decided_at = ? WHERE id = ? AND status = 'proposed'")
            .run(verdict, at.toISOString(), id);
        return Number(result.changes) > 0;
    }
}
function reportOf(raw) {
    const parsed = reportRow.safeParse(raw);
    if (!parsed.success)
        throw new Error(CORRUPT);
    const row = parsed.data;
    return {
        number: row.number,
        accusedTag: row.accused_tag,
        accusedUid: row.accused_uid ?? undefined,
        what: row.what,
        reportedBy: row.reported_by,
        reporterTag: row.reporter_tag,
        reportedAt: new Date(row.reported_at),
        threadId: row.thread_id ?? undefined,
    };
}
function proposalOf(raw) {
    const parsed = proposalRow.safeParse(raw);
    if (!parsed.success)
        throw new Error(CORRUPT);
    const row = parsed.data;
    return {
        id: row.id,
        report: row.report,
        outcome: row.outcome,
        note: row.note ?? undefined,
        proposedBy: row.proposed_by,
        proposedAt: new Date(row.proposed_at),
        status: row.status === "proposed" ? { kind: "proposed" } : { kind: row.status, decidedAt: new Date(row.decided_at) },
        motion: row.motion ?? undefined,
    };
}
//# sourceMappingURL=nap-report-store.js.map