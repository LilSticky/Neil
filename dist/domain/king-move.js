/**
 * The King Move after a Handover to `holdingTag`: the expected King, and the Members holding King now as the snapshot.
 * Nothing is prepared when the R5 is unknown or not a Member here, or when they already are the only King.
 */
export function planKingMove(holdingTag, expected, kingHolders, now) {
    switch (expected.kind) {
        case "game-api-failed":
            return { kind: "not-prepared", reason: { kind: "game-api-failed", detail: expected.detail } };
        case "no-r5":
            return { kind: "not-prepared", reason: { kind: "no-r5" } };
        case "unlinked":
            return { kind: "not-prepared", reason: { kind: "unlinked", leaderUid: expected.leaderUid } };
        case "left-server":
            return {
                kind: "not-prepared",
                reason: { kind: "left-server", leaderUid: expected.leaderUid, memberId: expected.memberId },
            };
        case "member": {
            const holders = [...new Set(kingHolders)];
            if (holders.length === 1 && holders[0] === expected.memberId) {
                return { kind: "not-prepared", reason: { kind: "already-king", memberId: expected.memberId } };
            }
            return {
                kind: "prepare",
                move: {
                    holdingTag,
                    leaderUid: expected.leaderUid,
                    leaderName: expected.leaderName,
                    newKing: expected.memberId,
                    previousKings: holders,
                    messageId: undefined,
                    preparedAt: now,
                    state: { kind: "prepared" },
                },
            };
        }
    }
}
/**
 * The steps of an Apply, from the Members holding King now: King is taken only from the snapshot Members who still hold
 * it (never from the new King, never from someone who got it later), and given to the new King when they lack it.
 */
export function kingMoveSteps(move, kingHoldersNow) {
    const now = new Set(kingHoldersNow);
    return {
        takeFrom: move.previousKings.filter((memberId) => memberId !== move.newKing && now.has(memberId)),
        giveToNewKing: !now.has(move.newKing),
    };
}
export function checkApply(move, pressedPreparedAt, officer) {
    if (!officer)
        return { kind: "not-officer" };
    if (move?.state.kind !== "prepared" || move.preparedAt.getTime() !== pressedPreparedAt)
        return { kind: "not-open" };
    return { kind: "ok" };
}
//# sourceMappingURL=king-move.js.map