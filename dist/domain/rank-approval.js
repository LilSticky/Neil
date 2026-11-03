/**
 * Picks who approves a Rank Approval: the leader's Member when the leader has a Member on the server
 * and is not the Linked Member, otherwise the Officers.
 */
export function chooseApprover(leaderMemberOnServer, linkedMemberId) {
    if (leaderMemberOnServer === undefined || leaderMemberOnServer === linkedMemberId)
        return { kind: "officers" };
    return { kind: "member", memberId: leaderMemberOnServer };
}
/**
 * Whether a Member may approve: the Rank Approval is pending, the Member is not the Linked Member, and the Member
 * is the chosen Member, or an Officer when the approver is the Officers.
 */
export function mayApprove(approval, pressedBy, isOfficer) {
    if (approval.state !== "pending")
        return false;
    if (pressedBy === approval.linkedMemberId)
        return false;
    if (approval.approver.kind === "member")
        return approval.approver.memberId === pressedBy;
    return isOfficer;
}
/** Approves a pending Rank Approval with the given rank, recording the approver and the time. */
export function approve(approval, rank, approvedBy, now) {
    if (approval.state !== "pending")
        return { ok: false, reason: "ended" };
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
export function cancel(approval, now) {
    if (approval.state !== "pending")
        return { ok: false, reason: "ended" };
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
//# sourceMappingURL=rank-approval.js.map