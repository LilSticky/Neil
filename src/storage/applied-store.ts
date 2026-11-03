import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { LastAlliance } from "../domain/daily-sync.js";
import type { Link } from "../domain/link.js";
import { parseKingdom } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { linkOf } from "./link-store.js";

/**
 * What Neil last applied to a Linked Member: the nickname and Managed Roles set, when, whether nothing was skipped, and
 * the Alliance the Member was in then (undefined in no Alliance; "unrecorded" for a row written before it was recorded).
 */
export interface AppliedState {
  readonly memberId: MemberId;
  readonly nickname: string;
  readonly roles: readonly string[];
  readonly appliedAt: Date;
  readonly complete: boolean;
  readonly alliance?: LastAlliance | undefined;
}

const appliedRow = z.object({
  member_id: z.string().regex(/^\d+$/),
  nickname: z.string(),
  roles_json: z.string().transform((text, ctx) => {
    const parsed = z.array(z.string()).safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: "custom", message: "not a list of role names" });
    return z.NEVER;
  }),
  applied_at: z.iso.datetime().transform((value) => new Date(value)),
  complete: z.union([z.literal(0), z.literal(1)]),
  alliance_recorded: z.union([z.literal(0), z.literal(1)]),
  alliance_kingdom: z.number().int().nullable(),
  alliance_tag: z.string().nullable(),
});

/** Keeps the Applied State of each Link in neil.db; a corrupt row is an error, never a silent repair. */
export class AppliedStore {
  constructor(private readonly db: DatabaseSync) {}

  get(memberId: MemberId): AppliedState | undefined {
    const raw = this.db
      .prepare(
        `SELECT member_id, nickname, roles_json, applied_at, complete, alliance_recorded, alliance_kingdom, alliance_tag
         FROM applied WHERE member_id = ?`,
      )
      .get(memberId);
    return raw === undefined ? undefined : appliedOf(raw);
  }

  /** Stores the Applied State, replacing the Member's previous one. */
  record(state: AppliedState): void {
    const alliance = allianceColumnsOf(state.alliance);
    this.db
      .prepare(
        `INSERT INTO applied (member_id, nickname, roles_json, applied_at, complete, alliance_recorded, alliance_kingdom,
           alliance_tag)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (member_id) DO UPDATE SET nickname = excluded.nickname, roles_json = excluded.roles_json,
           applied_at = excluded.applied_at, complete = excluded.complete, alliance_recorded = excluded.alliance_recorded,
           alliance_kingdom = excluded.alliance_kingdom, alliance_tag = excluded.alliance_tag`,
      )
      .run(
        state.memberId,
        state.nickname,
        JSON.stringify(state.roles),
        state.appliedAt.toISOString(),
        state.complete ? 1 : 0,
        alliance.recorded,
        alliance.kingdom,
        alliance.tag,
      );
  }

  /** The Links whose Member has no Applied State yet, or one that is not complete (the startup apply's work list). */
  linkedWithoutCompleteApply(): Link[] {
    const rows = this.db
      .prepare(
        `SELECT l.member_id, l.uid, l.linked_at, l.rank_source, l.alliance_rank, l.approved_by, l.approved_at
         FROM link l LEFT JOIN applied a ON a.member_id = l.member_id
         WHERE a.member_id IS NULL OR a.complete = 0
         ORDER BY l.linked_at, l.member_id`,
      )
      .all();
    return rows.map(linkOf);
  }
}

function appliedOf(raw: unknown): AppliedState {
  const parsed = appliedRow.safeParse(raw);
  if (!parsed.success) throw corruptAppliedError();
  return {
    memberId: parsed.data.member_id,
    nickname: parsed.data.nickname,
    roles: parsed.data.roles_json,
    appliedAt: parsed.data.applied_at,
    complete: parsed.data.complete === 1,
    alliance: allianceOf(parsed.data),
  };
}

/** The Alliance columns of an Applied State: whether it was recorded, and the Kingdom and tag when there is one. */
interface AllianceColumns {
  readonly recorded: 0 | 1;
  readonly kingdom: number | null;
  readonly tag: string | null;
}

/** The columns for the Alliance: "unrecorded" leaves them empty and unrecorded; no Alliance is recorded with both NULL. */
function allianceColumnsOf(alliance: LastAlliance): AllianceColumns {
  if (alliance === "unrecorded") return { recorded: 0, kingdom: null, tag: null };
  if (alliance === undefined) return { recorded: 1, kingdom: null, tag: null };
  return { recorded: 1, kingdom: alliance.kingdom, tag: alliance.tag };
}

/** The Alliance of a row: unrecorded when its marker says so, else both columns set (an Alliance) or both NULL (none). */
function allianceOf(row: { alliance_recorded: 0 | 1; alliance_kingdom: number | null; alliance_tag: string | null }): LastAlliance {
  if (row.alliance_recorded === 0) return "unrecorded";
  if (row.alliance_kingdom === null && row.alliance_tag === null) return undefined;
  const parsed = row.alliance_kingdom === null ? undefined : parseKingdom(row.alliance_kingdom);
  if (row.alliance_tag === null || parsed === undefined || !parsed.ok) throw corruptAppliedError();
  return { kingdom: parsed.value, tag: row.alliance_tag };
}

function corruptAppliedError(): Error {
  return new Error("an Applied State in neil.db is corrupt; fix or remove it by hand");
}
