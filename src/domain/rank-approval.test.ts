import { describe, expect, test } from "vitest";
import type { AllianceRank } from "./player.js";
import { approve, cancel, chooseApprover, mayApprove, type MemberId, type RankApproval } from "./rank-approval.js";

const LEADER: MemberId = "member-leader";
const LINKED: MemberId = "member-linked";
const OTHER: MemberId = "member-other";
const THREAD: string = "thread-1";
const ASKED_AT = new Date("2026-10-31T12:00:00Z");
const NOW = new Date("2026-10-31T12:30:00Z");

type ApprovableRank = Exclude<AllianceRank, "unknown">;

function pendingWithMember(approverMemberId: MemberId): RankApproval {
  return {
    state: "pending",
    id: 1,
    linkedMemberId: LINKED,
    threadId: THREAD,
    approver: { kind: "member", memberId: approverMemberId },
    askedAt: ASKED_AT,
  };
}

function pendingWithOfficers(): RankApproval {
  return {
    state: "pending",
    id: 1,
    linkedMemberId: LINKED,
    threadId: THREAD,
    approver: { kind: "officers" },
    askedAt: ASKED_AT,
  };
}

function approvedRank(): RankApproval {
  return {
    state: "approved",
    id: 1,
    linkedMemberId: LINKED,
    threadId: THREAD,
    approver: { kind: "officers" },
    askedAt: ASKED_AT,
    rank: "R3",
    approvedBy: OTHER,
    approvedAt: NOW,
  };
}

function cancelledRank(): RankApproval {
  return {
    state: "cancelled",
    id: 1,
    linkedMemberId: LINKED,
    threadId: THREAD,
    approver: { kind: "officers" },
    askedAt: ASKED_AT,
    cancelledAt: NOW,
  };
}

describe("chooseApprover", () => {
  test("picks the leader's Member when the leader is on the server and is not the Linked Member", () => {
    expect(chooseApprover(LEADER, LINKED)).toEqual({ kind: "member", memberId: LEADER });
  });

  test("picks the Officers when the leader has no Member on the server", () => {
    expect(chooseApprover(undefined, LINKED)).toEqual({ kind: "officers" });
  });

  test("picks the Officers when the leader's Member is the Linked Member", () => {
    expect(chooseApprover(LINKED, LINKED)).toEqual({ kind: "officers" });
  });
});

describe("mayApprove", () => {
  test("lets the chosen Member approve a pending Rank Approval", () => {
    expect(mayApprove(pendingWithMember(LEADER), LEADER, false)).toBe(true);
  });

  test("refuses another Member, even an Officer, when the approver is a Member", () => {
    expect(mayApprove(pendingWithMember(LEADER), OTHER, true)).toBe(false);
  });

  test("refuses the Linked Member, even when they are the chosen Member", () => {
    expect(mayApprove(pendingWithMember(LINKED), LINKED, true)).toBe(false);
  });

  test("lets any Officer approve a pending Rank Approval that goes to the Officers", () => {
    expect(mayApprove(pendingWithOfficers(), OTHER, true)).toBe(true);
  });

  test("refuses a Member who is not an Officer when the approver is the Officers", () => {
    expect(mayApprove(pendingWithOfficers(), OTHER, false)).toBe(false);
  });

  test("refuses the Linked Member even when they are an Officer", () => {
    expect(mayApprove(pendingWithOfficers(), LINKED, true)).toBe(false);
  });

  test.each([
    ["approved", approvedRank()],
    ["cancelled", cancelledRank()],
  ])("refuses everyone once the Rank Approval is %s", (_state, approval) => {
    expect(mayApprove(approval, LEADER, true)).toBe(false);
  });
});

describe("approve", () => {
  const ranks: readonly ApprovableRank[] = ["R1", "R2", "R3", "R4", "R5"];

  test.each(ranks)("records %s, the approver and the time on a pending Rank Approval", (rank) => {
    const result = approve(pendingWithMember(LEADER), rank, LEADER, NOW);

    expect(result).toEqual({
      ok: true,
      approval: {
        state: "approved",
        id: 1,
        linkedMemberId: LINKED,
        threadId: THREAD,
        approver: { kind: "member", memberId: LEADER },
        askedAt: ASKED_AT,
        rank,
        approvedBy: LEADER,
        approvedAt: NOW,
      },
    });
  });

  test.each([
    ["approved", approvedRank()],
    ["cancelled", cancelledRank()],
  ])("refuses to approve a Rank Approval that is already %s", (_state, approval) => {
    expect(approve(approval, "R1", OTHER, NOW)).toEqual({ ok: false, reason: "ended" });
  });
});

describe("cancel", () => {
  test("cancels a pending Rank Approval and records the time", () => {
    expect(cancel(pendingWithOfficers(), NOW)).toEqual({
      ok: true,
      approval: {
        state: "cancelled",
        id: 1,
        linkedMemberId: LINKED,
        threadId: THREAD,
        approver: { kind: "officers" },
        askedAt: ASKED_AT,
        cancelledAt: NOW,
      },
    });
  });

  test.each([
    ["approved", approvedRank()],
    ["cancelled", cancelledRank()],
  ])("refuses to cancel a Rank Approval that is already %s", (_state, approval) => {
    expect(cancel(approval, NOW)).toEqual({ ok: false, reason: "ended" });
  });
});
