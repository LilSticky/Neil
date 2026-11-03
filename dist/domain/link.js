/**
 * An Officer gives a Rank Approval on a Link. Refused on the Officer's own Link and on a Link with no Alliance.
 * When the Game API gave a different rank, it is returned as gameRank so the Officer is told the next Daily Sync uses it.
 */
export function officerRank(link, rank, officerId, now) {
    if (link.memberId === officerId)
        return { ok: false, reason: "own-link" };
    if (link.allianceRank.source === "no-alliance")
        return { ok: false, reason: "no-alliance" };
    const gameRank = link.allianceRank.source === "game-api" && link.allianceRank.rank !== rank ? link.allianceRank.rank : undefined;
    return {
        ok: true,
        allianceRank: { source: "rank-approval", rank, approvedBy: officerId, approvedAt: now },
        gameRank,
    };
}
/** The RankOnLink for a Player: from the Game API when it gives a rank, unknown in an Alliance without one, none outside an Alliance. */
export function rankOnLink(player) {
    if (player.alliance === undefined)
        return { source: "no-alliance" };
    if (player.allianceRank === "unknown")
        return { source: "unknown" };
    return { source: "game-api", rank: player.allianceRank };
}
/** A Rank Approval is needed only when the Alliance Rank is unknown. */
export function needsRankApproval(rank) {
    return rank.source === "unknown";
}
//# sourceMappingURL=link.js.map