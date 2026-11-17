import { z } from "zod";
import { parseUid } from "../domain/lookup-input.js";
/** The state before anything is set. */
export const EMPTY_CITY_ROTATION = {
    order: undefined,
    holding: undefined,
    handover: undefined,
    lastHandledSiege: undefined,
    cardMessageId: undefined,
    paused: false,
    next: undefined,
};
const snowflake = z.string().regex(/^\d{1,20}$/);
const row = z.object({
    order_json: z.string().nullable(),
    holding_tag: z.string().min(1).nullable(),
    pending_tag: z.string().min(1).nullable(),
    pending_leader_uid: z.string().nullable(),
    pending_message_id: snowflake.nullable(),
    pending_siege_at: z.iso.datetime().nullable(),
    last_siege_at: z.iso.datetime().nullable(),
    card_message_id: snowflake.nullable(),
    paused: z.union([z.literal(0), z.literal(1)]),
    next_tag: z.string().min(1).nullable(),
});
const orderSchema = z.array(z.string().min(1)).min(1);
const CORRUPT = "the City Rotation in neil.db is corrupt; fix or remove it by hand";
/** Keeps the City Rotation in neil.db, in one row; a corrupt row is an error, never a silent reset. */
export class CityRotationStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /** The City Rotation as stored; the empty state when nothing was stored yet. */
    load() {
        const raw = this.db
            .prepare(`SELECT order_json, holding_tag, pending_tag, pending_leader_uid, pending_message_id, pending_siege_at,
                last_siege_at, card_message_id, paused, next_tag
         FROM city_rotation WHERE id = 1`)
            .get();
        return raw === undefined ? EMPTY_CITY_ROTATION : stateOf(raw);
    }
    /** Replaces the stored City Rotation. */
    save(state) {
        const { handover } = state;
        this.db
            .prepare(`INSERT INTO city_rotation (id, order_json, holding_tag, pending_tag, pending_leader_uid, pending_message_id,
                                    pending_siege_at, last_siege_at, card_message_id, paused, next_tag)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET order_json = excluded.order_json, holding_tag = excluded.holding_tag,
           pending_tag = excluded.pending_tag, pending_leader_uid = excluded.pending_leader_uid,
           pending_message_id = excluded.pending_message_id, pending_siege_at = excluded.pending_siege_at,
           last_siege_at = excluded.last_siege_at, card_message_id = excluded.card_message_id,
           paused = excluded.paused, next_tag = excluded.next_tag`)
            .run(state.order === undefined ? null : JSON.stringify(state.order), state.holding ?? null, handover?.expected ?? null, handover?.leaderUid ?? null, handover?.messageId ?? null, handover?.siegeAt.toISOString() ?? null, state.lastHandledSiege?.toISOString() ?? null, state.cardMessageId ?? null, state.paused ? 1 : 0, state.next ?? null);
    }
    /** Reads the state, changes it with `change` and stores the result, with no await in between; returns the new state. */
    update(change) {
        const next = change(this.load());
        this.save(next);
        return next;
    }
}
function stateOf(raw) {
    const parsed = row.safeParse(raw);
    if (!parsed.success)
        throw new Error(CORRUPT);
    const data = parsed.data;
    return {
        order: data.order_json === null ? undefined : orderOf(data.order_json),
        holding: data.holding_tag ?? undefined,
        handover: handoverOf(data),
        lastHandledSiege: data.last_siege_at === null ? undefined : new Date(data.last_siege_at),
        cardMessageId: data.card_message_id ?? undefined,
        paused: data.paused === 1,
        next: data.next_tag ?? undefined,
    };
}
function orderOf(json) {
    let value;
    try {
        value = JSON.parse(json);
    }
    catch {
        throw new Error(CORRUPT);
    }
    const order = orderSchema.safeParse(value);
    if (!order.success)
        throw new Error(CORRUPT);
    return order.data;
}
function handoverOf(data) {
    if (data.pending_tag === null || data.pending_siege_at === null)
        return undefined;
    let leaderUid;
    if (data.pending_leader_uid !== null) {
        const uid = parseUid(data.pending_leader_uid);
        if (!uid.ok)
            throw new Error(CORRUPT);
        leaderUid = uid.value;
    }
    return {
        expected: data.pending_tag,
        leaderUid,
        siegeAt: new Date(data.pending_siege_at),
        messageId: data.pending_message_id ?? undefined,
    };
}
//# sourceMappingURL=city-rotation-store.js.map