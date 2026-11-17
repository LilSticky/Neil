import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { KingMove, KingMoveState } from "../domain/king-move.js";
import { parseUid } from "../domain/lookup-input.js";

const snowflake = z.string().regex(/^\d{1,20}$/);

const row = z.object({
  holding_tag: z.string().min(1),
  leader_uid: z.string().min(1),
  leader_name: z.string().nullable(),
  new_king_id: snowflake,
  previous_kings_json: z.string(),
  message_id: snowflake.nullable(),
  prepared_at: z.iso.datetime(),
  state: z.enum(["prepared", "applied", "superseded"]),
  applied_by: snowflake.nullable(),
  applied_at: z.iso.datetime().nullable(),
});

const previousKingsSchema = z.array(snowflake);

const CORRUPT = "the King Move in neil.db is corrupt; fix or remove it by hand";

/** Keeps the latest King Move in neil.db, in one row replaced by the next (ADR 21); a corrupt row is an error. */
export class KingMoveStore {
  constructor(private readonly db: DatabaseSync) {}

  /** The latest King Move; undefined before the first. */
  load(): KingMove | undefined {
    const raw = this.db
      .prepare(
        `SELECT holding_tag, leader_uid, leader_name, new_king_id, previous_kings_json, message_id, prepared_at, state,
                applied_by, applied_at
         FROM king_moves WHERE id = 1`,
      )
      .get();
    return raw === undefined ? undefined : moveOf(raw);
  }

  /** Replaces the stored King Move. */
  save(move: KingMove): void {
    const { state } = move;
    this.db
      .prepare(
        `INSERT INTO king_moves (id, holding_tag, leader_uid, leader_name, new_king_id, previous_kings_json, message_id,
                                 prepared_at, state, applied_by, applied_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET holding_tag = excluded.holding_tag, leader_uid = excluded.leader_uid,
           leader_name = excluded.leader_name, new_king_id = excluded.new_king_id,
           previous_kings_json = excluded.previous_kings_json, message_id = excluded.message_id,
           prepared_at = excluded.prepared_at, state = excluded.state, applied_by = excluded.applied_by,
           applied_at = excluded.applied_at`,
      )
      .run(
        move.holdingTag,
        move.leaderUid,
        move.leaderName ?? null,
        move.newKing,
        JSON.stringify(move.previousKings),
        move.messageId ?? null,
        move.preparedAt.toISOString(),
        state.kind,
        state.kind === "applied" ? state.appliedBy : null,
        state.kind === "applied" ? state.appliedAt.toISOString() : null,
      );
  }

  /**
   * Reads the King Move, changes it with `change` and stores the result, with no await in between; returns the new
   * move. Nothing is stored when there is no move or `change` gives undefined.
   */
  update(change: (move: KingMove) => KingMove | undefined): KingMove | undefined {
    const current = this.load();
    if (current === undefined) return undefined;
    const next = change(current);
    if (next !== undefined) this.save(next);
    return next;
  }
}

function moveOf(raw: Record<string, unknown>): KingMove {
  const parsed = row.safeParse(raw);
  if (!parsed.success) throw new Error(CORRUPT);
  const data = parsed.data;
  const uid = parseUid(data.leader_uid);
  if (!uid.ok) throw new Error(CORRUPT);
  return {
    holdingTag: data.holding_tag,
    leaderUid: uid.value,
    leaderName: data.leader_name ?? undefined,
    newKing: data.new_king_id,
    previousKings: previousKingsOf(data.previous_kings_json),
    messageId: data.message_id ?? undefined,
    preparedAt: new Date(data.prepared_at),
    state: stateOf(data),
  };
}

function previousKingsOf(json: string): readonly string[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(CORRUPT);
  }
  const parsed = previousKingsSchema.safeParse(value);
  if (!parsed.success) throw new Error(CORRUPT);
  return parsed.data;
}

function stateOf(data: z.infer<typeof row>): KingMoveState {
  if (data.state !== "applied") return { kind: data.state };
  if (data.applied_by === null || data.applied_at === null) throw new Error(CORRUPT);
  return { kind: "applied", appliedBy: data.applied_by, appliedAt: new Date(data.applied_at) };
}
