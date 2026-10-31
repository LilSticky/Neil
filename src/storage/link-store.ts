import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { z } from "zod";
import type { Link, RankOnLink } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import type { Approver, MemberId, RankApproval } from "../domain/rank-approval.js";

/** A Rank Approval not yet stored: the database gives it its id. */
export type PendingRankApprovalDraft = Omit<Extract<RankApproval, { readonly state: "pending" }>, "id">;

/** The outcome of confirming: the Link was stored, or the Member or the uid already had one and nothing was written. */
export type ConfirmOutcome =
  | { readonly kind: "linked"; readonly rankApproval?: RankApproval }
  | { readonly kind: "already-linked" };

const LINK_CONFLICT_PATTERN = /^UNIQUE constraint failed: link\.(member_id|uid)$/;

const memberIdColumn = z.string().regex(/^\d+$/);
const isoDateColumn = z.iso.datetime().transform((value) => new Date(value));
const uidColumn = z.string().transform((value, ctx): Uid => {
  const parsed = parseUid(value);
  if (parsed.ok) return parsed.value;
  ctx.addIssue({ code: "custom", message: "not a Player uid" });
  return z.NEVER;
});
const recordedRankColumn = z.enum(["R1", "R2", "R3", "R4", "R5"]);

/** The rank columns of a link row: each rank source has exactly the columns it needs, the rest are NULL. */
const rankColumns = z.discriminatedUnion("rank_source", [
  z.object({
    rank_source: z.literal("game-api"),
    alliance_rank: recordedRankColumn,
    approved_by: z.null(),
    approved_at: z.null(),
  }),
  z.object({
    rank_source: z.literal("rank-approval"),
    alliance_rank: recordedRankColumn,
    approved_by: memberIdColumn,
    approved_at: isoDateColumn,
  }),
  z.object({ rank_source: z.literal("unknown"), alliance_rank: z.null(), approved_by: z.null(), approved_at: z.null() }),
  z.object({
    rank_source: z.literal("no-alliance"),
    alliance_rank: z.null(),
    approved_by: z.null(),
    approved_at: z.null(),
  }),
]);

const linkRow = z.object({ member_id: memberIdColumn, uid: uidColumn, linked_at: isoDateColumn }).and(rankColumns);

const approverColumns = z.discriminatedUnion("approver_kind", [
  z.object({ approver_kind: z.literal("member"), approver_member_id: memberIdColumn }),
  z.object({ approver_kind: z.literal("officers"), approver_member_id: z.null() }),
]);

/** The state columns of a Rank Approval row: the rank, approver and end time only where the state has them. */
const stateColumns = z.discriminatedUnion("state", [
  z.object({ state: z.literal("pending"), rank: z.null(), approved_by: z.null(), ended_at: z.null() }),
  z.object({
    state: z.literal("approved"),
    rank: recordedRankColumn,
    approved_by: memberIdColumn,
    ended_at: isoDateColumn,
  }),
  z.object({ state: z.literal("cancelled"), rank: z.null(), approved_by: z.null(), ended_at: isoDateColumn }),
]);

const rankApprovalRow = z
  .object({
    id: z.number().int(),
    linked_member_id: memberIdColumn,
    thread_id: z.string().min(1),
    asked_at: isoDateColumn,
  })
  .and(approverColumns)
  .and(stateColumns);

const APPROVAL_COLUMNS =
  "linked_member_id, thread_id, approver_kind, approver_member_id, state, rank, approved_by, asked_at, ended_at";
const APPROVAL_SELECT = `SELECT id, ${APPROVAL_COLUMNS} FROM rank_approval`;
const APPROVAL_PLACEHOLDERS = "?, ?, ?, ?, ?, ?, ?, ?, ?";

/** Keeps Links and their Rank Approvals in neil.db; a corrupt row is an error, never a silent repair. */
export class LinkStore {
  constructor(private readonly db: DatabaseSync) {}

  linkFor(memberId: MemberId): Link | undefined {
    const raw = this.db.prepare("SELECT member_id, uid, linked_at, rank_source, alliance_rank, approved_by, approved_at FROM link WHERE member_id = ?").get(memberId);
    return raw === undefined ? undefined : linkOf(raw);
  }

  memberForUid(uid: Uid): MemberId | undefined {
    const raw = this.db.prepare("SELECT member_id FROM link WHERE uid = ?").get(uid);
    if (raw === undefined) return undefined;
    const parsed = z.object({ member_id: memberIdColumn }).safeParse(raw);
    if (!parsed.success) throw corruptLinkError();
    return parsed.data.member_id;
  }

  /**
   * Stores the Link, the optional pending Rank Approval and whatever saveInterview writes, in one transaction.
   * A Member or uid that already has a Link gives "already-linked" and writes nothing.
   */
  confirm(
    input: { readonly link: Link; readonly rankApproval?: PendingRankApprovalDraft },
    saveInterview: () => void,
  ): ConfirmOutcome {
    try {
      return this.inTransaction((): ConfirmOutcome => {
        if (this.linkFor(input.link.memberId) !== undefined || this.memberForUid(input.link.uid) !== undefined) {
          return { kind: "already-linked" };
        }
        this.insertLink(input.link);
        saveInterview();
        if (input.rankApproval === undefined) return { kind: "linked" };
        const id = this.insertRankApproval(input.rankApproval);
        return { kind: "linked", rankApproval: { ...input.rankApproval, id } };
      });
    } catch (error) {
      if (error instanceof Error && LINK_CONFLICT_PATTERN.test(error.message)) return { kind: "already-linked" };
      throw error;
    }
  }

  get(id: number): RankApproval | undefined {
    const raw = this.db.prepare(`${APPROVAL_SELECT} WHERE id = ?`).get(id);
    return raw === undefined ? undefined : rankApprovalOf(raw);
  }

  pendingFor(memberId: MemberId): RankApproval | undefined {
    const raw = this.db.prepare(`${APPROVAL_SELECT} WHERE linked_member_id = ? AND state = 'pending'`).get(memberId);
    return raw === undefined ? undefined : rankApprovalOf(raw);
  }

  /** Writes a Rank Approval; an approved one also writes its rank, approver and time onto the Link. */
  save(approval: RankApproval): void {
    this.inTransaction(() => {
      this.db
        .prepare(`INSERT OR REPLACE INTO rank_approval (id, ${APPROVAL_COLUMNS}) VALUES (?, ${APPROVAL_PLACEHOLDERS})`)
        .run(approval.id, ...approvalColumnsOf(approval));
      if (approval.state === "approved") {
        this.db
          .prepare("UPDATE link SET rank_source = ?, alliance_rank = ?, approved_by = ?, approved_at = ? WHERE member_id = ?")
          .run(
            ...rankColumnsOf({
              source: "rank-approval",
              rank: approval.rank,
              approvedBy: approval.approvedBy,
              approvedAt: approval.approvedAt,
            }),
            approval.linkedMemberId,
          );
      }
    });
  }

  /** Deletes the Rank Approvals ended before the cutoff; pending ones are never deleted. */
  deleteEndedBefore(cutoff: Date): void {
    this.db
      .prepare("DELETE FROM rank_approval WHERE state <> 'pending' AND ended_at < ?")
      .run(cutoff.toISOString());
  }

  private insertLink(link: Link): void {
    this.db
      .prepare(
        "INSERT INTO link (member_id, uid, linked_at, rank_source, alliance_rank, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(link.memberId, link.uid, link.linkedAt.toISOString(), ...rankColumnsOf(link.allianceRank));
  }

  private insertRankApproval(draft: PendingRankApprovalDraft): number {
    const result = this.db
      .prepare(`INSERT INTO rank_approval (${APPROVAL_COLUMNS}) VALUES (${APPROVAL_PLACEHOLDERS})`)
      .run(...approvalColumnsOf(draft));
    return Number(result.lastInsertRowid);
  }

  /** Runs work between BEGIN and COMMIT; any error rolls back and is rethrown. */
  private inTransaction<T>(work: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function corruptLinkError(): Error {
  return new Error("a Link in neil.db is corrupt; fix or remove it by hand");
}

function linkOf(raw: unknown): Link {
  const parsed = linkRow.safeParse(raw);
  if (!parsed.success) throw corruptLinkError();
  return {
    memberId: parsed.data.member_id,
    uid: parsed.data.uid,
    linkedAt: parsed.data.linked_at,
    allianceRank: rankOnLinkOf(parsed.data),
  };
}

function rankOnLinkOf(columns: z.output<typeof rankColumns>): RankOnLink {
  switch (columns.rank_source) {
    case "game-api":
      return { source: "game-api", rank: columns.alliance_rank };
    case "rank-approval":
      return {
        source: "rank-approval",
        rank: columns.alliance_rank,
        approvedBy: columns.approved_by,
        approvedAt: columns.approved_at,
      };
    case "unknown":
      return { source: "unknown" };
    case "no-alliance":
      return { source: "no-alliance" };
  }
}

/** The four columns of a link's rank, in the order of the link insert and update. */
function rankColumnsOf(rank: RankOnLink): [string, string | null, string | null, string | null] {
  switch (rank.source) {
    case "game-api":
      return ["game-api", rank.rank, null, null];
    case "rank-approval":
      return ["rank-approval", rank.rank, rank.approvedBy, rank.approvedAt.toISOString()];
    case "unknown":
      return ["unknown", null, null, null];
    case "no-alliance":
      return ["no-alliance", null, null, null];
  }
}

function rankApprovalOf(raw: unknown): RankApproval {
  const parsed = rankApprovalRow.safeParse(raw);
  if (!parsed.success) throw new Error("a Rank Approval in neil.db is corrupt; fix or remove it by hand");
  const row = parsed.data;
  const base = {
    id: row.id,
    linkedMemberId: row.linked_member_id,
    threadId: row.thread_id,
    approver: approverOf(row),
    askedAt: row.asked_at,
  };
  switch (row.state) {
    case "pending":
      return { ...base, state: "pending" };
    case "approved":
      return { ...base, state: "approved", rank: row.rank, approvedBy: row.approved_by, approvedAt: row.ended_at };
    case "cancelled":
      return { ...base, state: "cancelled", cancelledAt: row.ended_at };
  }
}

function approverOf(columns: z.output<typeof approverColumns>): Approver {
  return columns.approver_kind === "member"
    ? { kind: "member", memberId: columns.approver_member_id }
    : { kind: "officers" };
}

/** The Rank Approval's values in the order of APPROVAL_COLUMNS. */
function approvalColumnsOf(approval: RankApproval | PendingRankApprovalDraft): SQLInputValue[] {
  const approverKind = approval.approver.kind;
  const approverMemberId = approval.approver.kind === "member" ? approval.approver.memberId : null;
  const askedAt = approval.askedAt.toISOString();
  switch (approval.state) {
    case "pending":
      return [approval.linkedMemberId, approval.threadId, approverKind, approverMemberId, "pending", null, null, askedAt, null];
    case "approved":
      return [
        approval.linkedMemberId,
        approval.threadId,
        approverKind,
        approverMemberId,
        "approved",
        approval.rank,
        approval.approvedBy,
        askedAt,
        approval.approvedAt.toISOString(),
      ];
    case "cancelled":
      return [
        approval.linkedMemberId,
        approval.threadId,
        approverKind,
        approverMemberId,
        "cancelled",
        null,
        null,
        askedAt,
        approval.cancelledAt.toISOString(),
      ];
  }
}
