import { z } from "zod";
const snowflake = z.string().regex(/^\d{1,20}$/);
const count = z.number().int().nonnegative();
const motionColumns = {
    id: z.number().int().positive(),
    text: z.string().min(1),
    opened_by: snowflake,
    opener_tag: z.string().min(1),
    opened_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    channel_id: snowflake.nullable(),
    message_id: snowflake.nullable(),
    reminded_at: z.iso.datetime().nullable(),
};
const motionRow = z.union([
    z.object({
        ...motionColumns,
        closed_at: z.null(),
        outcome: z.null(),
        approve_votes: z.null(),
        decline_votes: z.null(),
    }),
    z.object({
        ...motionColumns,
        closed_at: z.iso.datetime(),
        outcome: z.enum(["approved", "rejected"]),
        approve_votes: count,
        decline_votes: count,
    }),
]);
const voteRow = z.object({
    alliance_tag: z.string().min(1),
    voter_id: snowflake,
    vote: z.enum(["approve", "decline"]),
    at: z.iso.datetime(),
});
const CORRUPT = "the NaP Motions in neil.db are corrupt; fix or remove them by hand";
const MOTION_COLUMNS = "id, text, opened_by, opener_tag, opened_at, ends_at, channel_id, message_id, reminded_at, closed_at, outcome, approve_votes, decline_votes";
/**
 * Keeps the NaP Motions in neil.db: each motion, its votes (one per Alliance) and its result, also after it closed.
 * Every method is synchronous, so a check and the write after it run with no await in between.
 */
export class NapMotionStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Stores a new motion, not posted yet, and gives its id. */
    add(motion) {
        const result = this.db
            .prepare("INSERT INTO nap_motions (text, opened_by, opener_tag, opened_at, ends_at) VALUES (?, ?, ?, ?, ?)")
            .run(motion.text, motion.openedBy, motion.openerTag, motion.openedAt.toISOString(), motion.endsAt.toISOString());
        return Number(result.lastInsertRowid);
    }
    /** Records where the motion was posted in #nap-leaders. */
    setMessage(id, channelId, messageId) {
        this.db.prepare("UPDATE nap_motions SET channel_id = ?, message_id = ? WHERE id = ?").run(channelId, messageId, id);
    }
    /** Removes a motion that could not be posted, with any votes on it. */
    remove(id) {
        this.db.prepare("DELETE FROM nap_motion_votes WHERE motion_id = ?").run(id);
        this.db.prepare("DELETE FROM nap_motions WHERE id = ?").run(id);
    }
    /** The motions not closed yet, oldest first. */
    open() {
        return this.db
            .prepare(`SELECT ${MOTION_COLUMNS} FROM nap_motions WHERE closed_at IS NULL ORDER BY id`)
            .all()
            .map(motionOf);
    }
    /** The motion with this id, open or closed; undefined when there is none. */
    get(id) {
        const raw = this.db.prepare(`SELECT ${MOTION_COLUMNS} FROM nap_motions WHERE id = ?`).get(id);
        return raw === undefined ? undefined : motionOf(raw);
    }
    /** Records one Alliance's vote on the motion, replacing its earlier vote. */
    castVote(id, vote) {
        this.db
            .prepare(`INSERT INTO nap_motion_votes (motion_id, alliance_tag, voter_id, vote, at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (motion_id, alliance_tag)
         DO UPDATE SET voter_id = excluded.voter_id, vote = excluded.vote, at = excluded.at`)
            .run(id, vote.allianceTag, vote.voterId, vote.vote, vote.at.toISOString());
    }
    /** The votes on the motion, one per Alliance, also after it closed. */
    votes(id) {
        return this.db
            .prepare("SELECT alliance_tag, voter_id, vote, at FROM nap_motion_votes WHERE motion_id = ? ORDER BY at, alliance_tag")
            .all(id)
            .map(voteOf);
    }
    /** Records that the Linked R5s who had not voted were reminded at `at`. */
    markReminded(id, at) {
        this.db.prepare("UPDATE nap_motions SET reminded_at = ? WHERE id = ?").run(at.toISOString(), id);
    }
    /** Closes the motion with its result; nothing when it is already closed. */
    close(id, result) {
        this.db
            .prepare("UPDATE nap_motions SET closed_at = ?, outcome = ?, approve_votes = ?, decline_votes = ? WHERE id = ? AND closed_at IS NULL")
            .run(result.at.toISOString(), result.outcome, result.approve, result.decline, id);
    }
}
function motionOf(raw) {
    const parsed = motionRow.safeParse(raw);
    if (!parsed.success)
        throw new Error(CORRUPT);
    const row = parsed.data;
    return {
        id: row.id,
        text: row.text,
        openedBy: row.opened_by,
        openerTag: row.opener_tag,
        openedAt: new Date(row.opened_at),
        endsAt: new Date(row.ends_at),
        channelId: row.channel_id ?? undefined,
        messageId: row.message_id ?? undefined,
        remindedAt: row.reminded_at === null ? undefined : new Date(row.reminded_at),
        closed: row.closed_at === null
            ? undefined
            : { outcome: row.outcome, approve: row.approve_votes, decline: row.decline_votes, at: new Date(row.closed_at) },
    };
}
function voteOf(raw) {
    const parsed = voteRow.safeParse(raw);
    if (!parsed.success)
        throw new Error(CORRUPT);
    const row = parsed.data;
    return { allianceTag: row.alliance_tag, voterId: row.voter_id, vote: row.vote, at: new Date(row.at) };
}
//# sourceMappingURL=nap-motion-store.js.map