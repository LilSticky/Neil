const REASON_MAX_LENGTH = 200;
/** A reason as typed: trimmed, and refused when empty or longer than 200 characters. */
export function exileReasonOf(text) {
    const trimmed = text.trim();
    const length = Array.from(trimmed).length;
    if (length === 0 || length > REASON_MAX_LENGTH)
        return { ok: false };
    return { ok: true, value: trimmed };
}
/** Only an R5 of an Alliance in the Home Kingdom may add or remove Exiles; the rank may come from the Game API or a Rank Approval. */
export function mayChangeReaper(editor, homeKingdom) {
    if (editor.allianceKingdom !== homeKingdom)
        return false;
    const { allianceRank } = editor;
    return (allianceRank.source === "game-api" || allianceRank.source === "rank-approval") && allianceRank.rank === "R5";
}
/** The straight-line distance between two points on the map. */
export function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
/**
 * Ranks the Exiles of one Kingdom by distance from the origin. Leaves out the caller's own Exile (none when the caller has no Link), Exiles now in another
 * Kingdom, shielded Exiles and Exiles with no position. A fresh read of the Player is preferred over the stored position.
 * Ties go to the Exile added earlier.
 */
export function rankExiles(origin, kingdom, callerUid, candidates) {
    const ranking = [];
    let unreadable = 0;
    let shielded = 0;
    for (const candidate of candidates) {
        const { exile, player } = candidate;
        if (exile.uid === callerUid)
            continue;
        if ((player?.kingdom ?? exile.kingdom) !== kingdom)
            continue;
        if (player?.details?.shielded === true) {
            shielded += 1;
            continue;
        }
        const current = currentPositionOf(candidate);
        if (current === undefined) {
            unreadable += 1;
            continue;
        }
        ranking.push({ exile, position: current.position, distance: distance(origin, current.position), stale: current.stale });
    }
    ranking.sort((a, b) => a.distance - b.distance || a.exile.addedAt.getTime() - b.exile.addedAt.getTime());
    return { ranking, leftOut: { unreadable, shielded } };
}
/** The position to measure from: the fresh read when it gives one, else the stored position (stale). */
function currentPositionOf(candidate) {
    const read = candidate.player?.details?.location;
    if (read !== undefined)
        return { position: { x: read.x, y: read.y }, stale: false };
    const stored = candidate.exile.lastPosition?.position;
    if (stored !== undefined)
        return { position: stored, stale: true };
    return undefined;
}
//# sourceMappingURL=exile.js.map