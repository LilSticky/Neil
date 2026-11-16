import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { parseUid, type Uid } from "../domain/lookup-input.js";

/** A Handover waiting for confirmation: the Alliance expected to hold next, its R5 when known, and where Neil asked. */
export interface WaitingHandover {
  /** The tag of the Alliance expected to become the Holding Alliance. */
  readonly expected: string;
  /** The R5 of that Alliance, read fresh from the Game API; undefined when the read failed or named none. */
  readonly leaderUid: Uid | undefined;
  /** The Royal City siege the Handover follows. */
  readonly siegeAt: Date;
  /** The confirmation message in nap-leaders; undefined until it is posted, or when the post failed. */
  readonly messageId: string | undefined;
}

/** Everything Neil keeps about the City Rotation. */
export interface CityRotationState {
  /** The Alliance tags in their fixed order; undefined when no City Rotation is set. */
  readonly order: readonly string[] | undefined;
  /** The Holding Alliance's tag; undefined when none is known. */
  readonly holding: string | undefined;
  readonly handover: WaitingHandover | undefined;
  /** The last Royal City siege whose after-siege step ran; undefined before the first. */
  readonly lastHandledSiege: Date | undefined;
  /** The pinned City Rotation card in nap-announcements; undefined before it is posted. */
  readonly cardMessageId: string | undefined;
}

/** The state before anything is set. */
export const EMPTY_CITY_ROTATION: CityRotationState = {
  order: undefined,
  holding: undefined,
  handover: undefined,
  lastHandledSiege: undefined,
  cardMessageId: undefined,
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
});

const orderSchema = z.array(z.string().min(1)).min(1);

const CORRUPT = "the City Rotation in neil.db is corrupt; fix or remove it by hand";

/** Keeps the City Rotation in neil.db, in one row; a corrupt row is an error, never a silent reset. */
export class CityRotationStore {
  constructor(private readonly db: DatabaseSync) {}

  /** The City Rotation as stored; the empty state when nothing was stored yet. */
  load(): CityRotationState {
    const raw = this.db
      .prepare(
        `SELECT order_json, holding_tag, pending_tag, pending_leader_uid, pending_message_id, pending_siege_at,
                last_siege_at, card_message_id
         FROM city_rotation WHERE id = 1`,
      )
      .get();
    return raw === undefined ? EMPTY_CITY_ROTATION : stateOf(raw);
  }

  /** Replaces the stored City Rotation. */
  save(state: CityRotationState): void {
    const { handover } = state;
    this.db
      .prepare(
        `INSERT INTO city_rotation (id, order_json, holding_tag, pending_tag, pending_leader_uid, pending_message_id,
                                    pending_siege_at, last_siege_at, card_message_id)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET order_json = excluded.order_json, holding_tag = excluded.holding_tag,
           pending_tag = excluded.pending_tag, pending_leader_uid = excluded.pending_leader_uid,
           pending_message_id = excluded.pending_message_id, pending_siege_at = excluded.pending_siege_at,
           last_siege_at = excluded.last_siege_at, card_message_id = excluded.card_message_id`,
      )
      .run(
        state.order === undefined ? null : JSON.stringify(state.order),
        state.holding ?? null,
        handover?.expected ?? null,
        handover?.leaderUid ?? null,
        handover?.messageId ?? null,
        handover?.siegeAt.toISOString() ?? null,
        state.lastHandledSiege?.toISOString() ?? null,
        state.cardMessageId ?? null,
      );
  }

  /** Reads the state, changes it with `change` and stores the result, with no await in between; returns the new state. */
  update(change: (state: CityRotationState) => CityRotationState): CityRotationState {
    const next = change(this.load());
    this.save(next);
    return next;
  }
}

function stateOf(raw: Record<string, unknown>): CityRotationState {
  const parsed = row.safeParse(raw);
  if (!parsed.success) throw new Error(CORRUPT);
  const data = parsed.data;
  return {
    order: data.order_json === null ? undefined : orderOf(data.order_json),
    holding: data.holding_tag ?? undefined,
    handover: handoverOf(data),
    lastHandledSiege: data.last_siege_at === null ? undefined : new Date(data.last_siege_at),
    cardMessageId: data.card_message_id ?? undefined,
  };
}

function orderOf(json: string): readonly string[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(CORRUPT);
  }
  const order = orderSchema.safeParse(value);
  if (!order.success) throw new Error(CORRUPT);
  return order.data;
}

function handoverOf(data: z.infer<typeof row>): WaitingHandover | undefined {
  if (data.pending_tag === null || data.pending_siege_at === null) return undefined;
  let leaderUid: Uid | undefined;
  if (data.pending_leader_uid !== null) {
    const uid = parseUid(data.pending_leader_uid);
    if (!uid.ok) throw new Error(CORRUPT);
    leaderUid = uid.value;
  }
  return {
    expected: data.pending_tag,
    leaderUid,
    siegeAt: new Date(data.pending_siege_at),
    messageId: data.pending_message_id ?? undefined,
  };
}
