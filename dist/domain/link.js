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