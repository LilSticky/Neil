import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { exileReasonOf, type Exile, type ExileReason, type Position } from "../domain/exile.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";

/** The Exile as read now from the Game API: its name and Kingdom, and its position when one was read. */
export interface ExileRead {
  readonly name: string;
  readonly kingdom: KingdomNumber;
  /** undefined keeps the stored position and the time it was read. */
  readonly position: Position | undefined;
  readonly readAt: Date;
}

/** "added": the Exile is stored now; "already": the Player was an Exile, and what was stored stays as it was. */
export type AddOutcome = "added" | "already";

/** "removed": the Exile is gone now; "not-an-exile": the Player was not an Exile. */
export type RemoveOutcome = "removed" | "not-an-exile";

const memberIdColumn = z.string().regex(/^\d+$/);
const isoDateColumn = z.iso.datetime().transform((value) => new Date(value));
const uidColumn = z.string().transform((value, ctx): Uid => {
  const parsed = parseUid(value);
  if (parsed.ok) return parsed.value;
  ctx.addIssue({ code: "custom", message: "not a Player uid" });
  return z.NEVER;
});
const kingdomColumn = z.number().transform((value, ctx): KingdomNumber => {
  const parsed = parseKingdom(value);
  if (parsed.ok) return parsed.value;
  ctx.addIssue({ code: "custom", message: "not a Kingdom" });
  return z.NEVER;
});
const reasonColumn = z.string().transform((value, ctx): ExileReason => {
  const parsed = exileReasonOf(value);
  if (parsed.ok) return parsed.value;
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
  .refine(
    (row) => (row.x === null) === (row.y === null) && (row.x === null) === (row.position_at === null),
    { message: "the position columns disagree" },
  );

const REAPER_COLUMNS = "uid, name, kingdom, x, y, position_at, reason, added_at, added_by";

/** Keeps the Exiles of REAPER in neil.db; a corrupt row is an error, never a silent repair. */
export class ReaperStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Stores the Exile unless its Player already is one; an existing Exile is left as it was. */
  add(exile: Exile): AddOutcome {
    const result = this.db
      .prepare(
        `INSERT INTO reaper (${REAPER_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (uid) DO NOTHING`,
      )
      .run(
        exile.uid,
        exile.name,
        exile.kingdom,
        exile.position === undefined ? null : exile.position.x,
        exile.position === undefined ? null : exile.position.y,
        exile.positionAt === undefined ? null : exile.positionAt.toISOString(),
        exile.reason,
        exile.addedAt.toISOString(),
        exile.addedBy,
      );
    return Number(result.changes) === 0 ? "already" : "added";
  }

  /** Deletes the Exile of this Player, if there is one. */
  remove(uid: Uid): RemoveOutcome {
    const result = this.db.prepare("DELETE FROM reaper WHERE uid = ?").run(uid);
    return Number(result.changes) === 0 ? "not-an-exile" : "removed";
  }

  find(uid: Uid): Exile | undefined {
    const raw = this.db.prepare(`SELECT ${REAPER_COLUMNS} FROM reaper WHERE uid = ?`).get(uid);
    return raw === undefined ? undefined : exileOf(raw);
  }

  /** Every Exile, newest first by the time it was added. */
  all(): Exile[] {
    return this.db
      .prepare(`SELECT ${REAPER_COLUMNS} FROM reaper ORDER BY added_at DESC, rowid DESC`)
      .all()
      .map(exileOf);
  }

  /** The Exiles of one Kingdom, newest first by the time they were added. */
  inKingdom(kingdom: KingdomNumber): Exile[] {
    return this.db
      .prepare(`SELECT ${REAPER_COLUMNS} FROM reaper WHERE kingdom = ? ORDER BY added_at DESC, rowid DESC`)
      .all(kingdom)
      .map(exileOf);
  }

  /**
   * Replaces the name, Kingdom and, when a position was read, the position and its time. The added time, reason and
   * adder stay. A read with no position keeps the stored position and its time.
   */
  refresh(uid: Uid, read: ExileRead): void {
    this.db
      .prepare(
        "UPDATE reaper SET name = ?, kingdom = ?, x = COALESCE(?, x), y = COALESCE(?, y), position_at = COALESCE(?, position_at) WHERE uid = ?",
      )
      .run(
        read.name,
        read.kingdom,
        read.position === undefined ? null : read.position.x,
        read.position === undefined ? null : read.position.y,
        read.position === undefined ? null : read.readAt.toISOString(),
        uid,
      );
  }
}

function corruptReaperError(): Error {
  return new Error("the REAPER in neil.db is corrupt; fix or remove it by hand");
}

/** Parses a row of reaper selected with REAPER_COLUMNS. */
function exileOf(raw: unknown): Exile {
  const parsed = reaperRow.safeParse(raw);
  if (!parsed.success) throw corruptReaperError();
  const row = parsed.data;
  const position = row.x === null || row.y === null ? undefined : { x: row.x, y: row.y };
  return {
    uid: row.uid,
    name: row.name,
    kingdom: row.kingdom,
    position,
    positionAt: row.position_at ?? undefined,
    reason: row.reason,
    addedAt: row.added_at,
    addedBy: row.added_by,
  };
}
