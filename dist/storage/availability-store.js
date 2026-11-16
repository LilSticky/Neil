import { z } from "zod";
const iso = z.iso.datetime();
const snowflake = z.string().regex(/^\d+$/);
const discordId = z.string().min(1);
const raidId = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pollRow = z.object({
    raid_id: raidId,
    opened_at: iso,
    closed_at: iso.nullable(),
    close_reason: z.enum(["started", "cancelled"]).nullable(),
    summary_channel_id: discordId.nullable(),
    summary_message_id: discordId.nullable(),
});
const cardRow = z.object({ tag: z.string().min(1), channel_id: discordId, message_id: discordId });
const answerRow = z.object({
    member_id: snowflake,
    tag: z.string().min(1),
    available: z.union([z.literal(0), z.literal(1)]),
    fighter_class: z.enum(["whale", "dolphin", "seal", "small-fry"]).nullable(),
});
const CORRUPT_MESSAGE = "an Availability Poll in neil.db is corrupt; fix or remove it by hand";
function availabilityOf(row) {
    if (row.available === 0) {
        if (row.fighter_class !== null)
            throw new Error(CORRUPT_MESSAGE);
        return { kind: "not-available" };
    }
    if (row.fighter_class === null)
        throw new Error(CORRUPT_MESSAGE);
    return { kind: "available", fighterClass: row.fighter_class };
}
/**
 * Keeps the Availability Polls, their cards and the Members' answers, in neil.db (ADR 19). A row that does not read is
 * refused, not reset.
 */
export class AvailabilityStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** The Raid's poll, or undefined when it was never opened. */
    poll(id) {
        const raw = this.db.prepare("SELECT * FROM availability_polls WHERE raid_id = ?").get(id);
        if (raw === undefined)
            return undefined;
        const parsed = pollRow.safeParse(raw);
        if (!parsed.success)
            throw new Error(CORRUPT_MESSAGE);
        const row = parsed.data;
        let state = { kind: "open" };
        if (row.closed_at !== null || row.close_reason !== null) {
            if (row.close_reason === null || row.closed_at === null)
                throw new Error(CORRUPT_MESSAGE);
            state = { kind: "closed", reason: row.close_reason };
        }
        const cards = new Map();
        for (const rawCard of this.db.prepare("SELECT tag, channel_id, message_id FROM availability_cards WHERE raid_id = ? ORDER BY tag").all(id)) {
            const card = cardRow.safeParse(rawCard);
            if (!card.success)
                throw new Error(CORRUPT_MESSAGE);
            cards.set(card.data.tag, { channelId: card.data.channel_id, messageId: card.data.message_id });
        }
        const summaryCard = row.summary_channel_id === null || row.summary_message_id === null
            ? undefined
            : { channelId: row.summary_channel_id, messageId: row.summary_message_id };
        return { raidId: row.raid_id, state, summaryCard, cards };
    }
    /** The Raids whose poll is open: opened and not yet closed. */
    openPolls() {
        return this.db
            .prepare("SELECT raid_id FROM availability_polls WHERE closed_at IS NULL ORDER BY raid_id")
            .all()
            .map((raw) => {
            const parsed = z.object({ raid_id: raidId }).safeParse(raw);
            if (!parsed.success)
                throw new Error(CORRUPT_MESSAGE);
            return parsed.data.raid_id;
        });
    }
    /** Records the poll as opened, before anything is posted; false when it was opened before, which then stays as it was. */
    open(id, at) {
        const result = this.db
            .prepare("INSERT OR IGNORE INTO availability_polls (raid_id, opened_at) VALUES (?, ?)")
            .run(id, at.toISOString());
        return Number(result.changes) === 1;
    }
    /** Keeps where the Availability Summary was posted. */
    saveSummaryCard(id, card) {
        this.db
            .prepare("UPDATE availability_polls SET summary_channel_id = ?, summary_message_id = ? WHERE raid_id = ?")
            .run(card.channelId, card.messageId, id);
    }
    /** Keeps where an Alliance's poll card was posted. */
    saveCard(id, tag, card) {
        this.db
            .prepare(`INSERT INTO availability_cards (raid_id, tag, channel_id, message_id) VALUES (?, ?, ?, ?)
         ON CONFLICT (raid_id, tag) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id`)
            .run(id, tag, card.channelId, card.messageId);
    }
    /** Records the poll as closed and deletes its answers: only the counts on the cards remain. */
    close(id, at, reason) {
        this.db.exec("BEGIN");
        try {
            this.db
                .prepare("UPDATE availability_polls SET closed_at = ?, close_reason = ? WHERE raid_id = ? AND closed_at IS NULL")
                .run(at.toISOString(), reason, id);
            this.db.prepare("DELETE FROM availability_answers WHERE raid_id = ?").run(id);
            this.db.exec("COMMIT");
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    /** Every answer of the Raid, by Member id. */
    answers(id) {
        return this.db
            .prepare("SELECT member_id, tag, available, fighter_class FROM availability_answers WHERE raid_id = ? ORDER BY member_id")
            .all(id)
            .map((raw) => {
            const parsed = answerRow.safeParse(raw);
            if (!parsed.success)
                throw new Error(CORRUPT_MESSAGE);
            return { memberId: parsed.data.member_id, tag: parsed.data.tag, availability: availabilityOf(parsed.data) };
        });
    }
    /** A Member's answer for the Raid, or undefined when they gave none. */
    answerOf(id, memberId) {
        const raw = this.db
            .prepare("SELECT member_id, tag, available, fighter_class FROM availability_answers WHERE raid_id = ? AND member_id = ?")
            .get(id, memberId);
        if (raw === undefined)
            return undefined;
        const parsed = answerRow.safeParse(raw);
        if (!parsed.success)
            throw new Error(CORRUPT_MESSAGE);
        return { memberId: parsed.data.member_id, tag: parsed.data.tag, availability: availabilityOf(parsed.data) };
    }
    /** Keeps a Member's answer, replacing their earlier one for the Raid (also one given on another Alliance's card). */
    record(id, answer, at) {
        const available = answer.availability.kind === "available" ? 1 : 0;
        const fighterClass = answer.availability.kind === "available" ? answer.availability.fighterClass : null;
        this.db
            .prepare(`INSERT INTO availability_answers (raid_id, member_id, tag, available, fighter_class, answered_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (raid_id, member_id) DO UPDATE SET tag = excluded.tag, available = excluded.available,
           fighter_class = excluded.fighter_class, answered_at = excluded.answered_at`)
            .run(id, answer.memberId, answer.tag, available, fighterClass, at.toISOString());
    }
    /** Deletes every answer of a Member whose Link ends, so they do not outlive the Link. */
    forget(memberId) {
        this.db.prepare("DELETE FROM availability_answers WHERE member_id = ?").run(memberId);
    }
}
//# sourceMappingURL=availability-store.js.map