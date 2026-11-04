import { z } from "zod";
import { exileReasonOf } from "../domain/exile.js";
import { parseKingdom, parseUid } from "../domain/lookup-input.js";
const memberIdColumn = z.string().regex(/^\d+$/);
const isoDateColumn = z.iso.datetime().transform((value) => new Date(value));
const uidColumn = z.string().transform((value, ctx) => {
    const parsed = parseUid(value);
    if (parsed.ok)
        return parsed.value;
    ctx.addIssue({ code: "custom", message: "not a Player uid" });
    return z.NEVER;
});
const kingdomColumn = z.number().transform((value, ctx) => {
    const parsed = parseKingdom(value);
    if (parsed.ok)
        return parsed.value;
    ctx.addIssue({ code: "custom", message: "not a Kingdom" });
    return z.NEVER;
});
const reasonColumn = z.string().transform((value, ctx) => {
    const parsed = exileReasonOf(value);
    if (parsed.ok)
        return parsed.value;
    ctx.addIssue({ code: "custom", message: "not a reason" });
    return z.NEVER;
});
/** A row of reaper. The position columns are all NULL or all set; the refine checks it. */
const reaperRow = z
    .object({
    uid: uidColumn,
    name: z.string().min(1),
    kingdom: kingdomColumn,
    x: z.number().nullable(),
    y: z.number().nullable(),
    position_at: isoDateColumn.nullable(),
    reason: reasonColumn,
    added_at: isoDateColumn,
    added_by: memberIdColumn,
})
    .refine((row) => (row.x === null) === (row.y === null) && (row.x === null) === (row.position_at === null), { message: "the position columns disagree" });
const REAPER_COLUMNS = "uid, name, kingdom, x, y, position_at, reason, added_at, added_by";
/** Keeps the Exiles of REAPER in neil.db; a corrupt row is an error, never a silent repair. */
export class ReaperStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Stores the Exile unless its Player already is one; an existing Exile is left as it was. */
    add(exile) {
        const result = this.db
            .prepare(`INSERT INTO reaper (${REAPER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (uid) DO NOTHING`)
            .run(exile.uid, exile.name, exile.kingdom, exile.lastPosition === undefined ? null : exile.lastPosition.position.x, exile.lastPosition === undefined ? null : exile.lastPosition.position.y, exile.lastPosition === undefined ? null : exile.lastPosition.at.toISOString(), exile.reason, exile.addedAt.toISOString(), exile.addedBy);
        return Number(result.changes) === 0 ? "already" : "added";
    }
    /** Deletes the Exile of this Player, if there is one. */
    remove(uid) {
        const result = this.db.prepare("DELETE FROM reaper WHERE uid = ?").run(uid);
        return Number(result.changes) === 0 ? "not-an-exile" : "removed";
    }
    find(uid) {
        const raw = this.db.prepare(`SELECT ${REAPER_COLUMNS} FROM reaper WHERE uid = ?`).get(uid);
        return raw === undefined ? undefined : exileOf(raw);
    }
    /** Every Exile, newest first by the time it was added. */
    all() {
        return this.db
            .prepare(`SELECT ${REAPER_COLUMNS} FROM reaper ORDER BY added_at DESC, rowid DESC`)
            .all()
            .map(exileOf);
    }
    /** The Exiles of one Kingdom, newest first by the time they were added. */
    inKingdom(kingdom) {
        return this.db
            .prepare(`SELECT ${REAPER_COLUMNS} FROM reaper WHERE kingdom = ? ORDER BY added_at DESC, rowid DESC`)
            .all(kingdom)
            .map(exileOf);
    }
    /**
     * Replaces the name, Kingdom and, when a position was read, the position and its time. The added time, reason and
     * adder stay. A read with no position keeps the stored position and its time.
     */
    refresh(uid, read) {
        this.db
            .prepare("UPDATE reaper SET name = ?, kingdom = ?, x = COALESCE(?, x), y = COALESCE(?, y), position_at = COALESCE(?, position_at) WHERE uid = ?")
            .run(read.name, read.kingdom, read.position === undefined ? null : read.position.x, read.position === undefined ? null : read.position.y, read.position === undefined ? null : read.readAt.toISOString(), uid);
    }
}
function corruptReaperError() {
    return new Error("the REAPER in neil.db is corrupt; fix or remove it by hand");
}
/** Parses a row of reaper selected with REAPER_COLUMNS. */
function exileOf(raw) {
    const parsed = reaperRow.safeParse(raw);
    if (!parsed.success)
        throw corruptReaperError();
    const row = parsed.data;
    const lastPosition = row.x === null || row.y === null || row.position_at === null
        ? undefined
        : { position: { x: row.x, y: row.y }, at: row.position_at };
    return {
        uid: row.uid,
        name: row.name,
        kingdom: row.kingdom,
        lastPosition,
        reason: row.reason,
        addedAt: row.added_at,
        addedBy: row.added_by,
    };
}
//# sourceMappingURL=reaper-store.js.map