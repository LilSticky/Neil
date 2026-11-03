import type { AllianceRank } from "./player.js";

/** A Member's Discord user id. */
export type MemberId = string;

/** The Alliance Ranks an Officer or leader can approve: every rank except "unknown". */
export type ApprovableRank = Exclude<AllianceRank, "unknown">;

/** Who may approve a Rank Approval: the leader's Member, or any Officer. */
export type Approver = { readonly kind: "member"; readonly memberId: MemberId } | { readonly kind: "officers" };

/** A request for an Alliance Rank to be approved by someone other than the Linked Member. */
export type RankApproval =
  | {
      readonly state: "pending";
      readonly id: number;
      readonly linkedMemberId: MemberId;
      readonly threadId: string;
      readonly approver: Approver;
      readonly askedAt: Date;
    }
  | {
      readonly state: "approved";
      readonly id: number;
      readonly linkedMemberId: MemberId;
      readonly threadId: string;
      readonly approver: Approver;
      readonly askedAt: Date;
      readonly rank: ApprovableRank;
      readonly approvedBy: MemberId;
      readonly approvedAt: Date;
    }
  | {
      readonly state: "cancelled";
      readonly id: number;
      readonly linkedMemberId: MemberId;
      readonly threadId: string;
      readonly approver: Approver;
      readonly askedAt: Date;
      readonly cancelledAt: Date;
    };

/** Outcome of approving or cancelling: the new state, or "ended" when the Rank Approval was already approved or cancelled. */
export type RankApprovalChange =
  | { readonly ok: true; readonly approval: RankApproval }
  | { readonly ok: false; readonly reason: "ended" };

/**
 * Picks who approves a Rank Approval: the leader's Member when the leader has a Member on the server
 * and is not the Linked Member, otherwise the Officers.
 */
export function chooseApprover(leaderMemberOnServer: MemberId | undefined, linkedMemberId: MemberId): Approver {
  if (leaderMemberOnServer === undefined || leaderMemberOnServer === linkedMemberId) return { kind: "officers" };
  return { kind: "member", memberId: leaderMemberOnServer };
}

/**
 * Whether a Member may approve: the Rank Approval is pending, the Member is not the Linked Member, and the Member
 * is the chosen Member, or an Officer when the approver is the Officers.
 */
export function mayApprove(approval: RankApproval, pressedBy: MemberId, isOfficer: boolean): boolean {
  if (approval.state !== "pending") return false;
  if (pressedBy === approval.linkedMemberId) return false;
  if (approval.approver.kind === "member") return approval.approver.memberId === pressedBy;
  return isOfficer;
}

/** Approves a pending Rank Approval with the given rank, recording the approver and the time. */
export function approve(
  approval: RankApproval,
  rank: ApprovableRank,
  approvedBy: MemberId,
  now: Date,
): RankApprovalChange {
  if (approval.state !== "pending") return { ok: false, reason: "ended" };
  return {
    ok: true,
    approval: {
      state: "approved",
      id: approval.id,
      linkedMemberId: approval.linkedMemberId,
      threadId: approval.threadId,
      approver: approval.approver,
      askedAt: approval.askedAt,
      rank,
      approvedBy,
      approvedAt: now,
    },
  };
}

/** Cancels a pending Rank Approval, recording the time. */
export function cancel(approval: RankApproval, now: Date): RankApprovalChange {
  if (approval.state !== "pending") return { ok: false, reason: "ended" };
  return {
    ok: true,
    approval: {
      state: "cancelled",
      id: approval.id,
      linkedMemberId: approval.linkedMemberId,
      threadId: approval.threadId,
      approver: approval.approver,
      askedAt: approval.askedAt,
      cancelledAt: now,
    },
  };
}
