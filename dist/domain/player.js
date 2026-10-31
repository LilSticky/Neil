export function pickablePlayerMatch(match) {
    return match.uid !== undefined && match.kingdom !== undefined;
}
export function pickableAllianceMatch(match) {
    return match.tag !== undefined && match.kingdom !== undefined;
}
/** How many matches a pick list shows at most. */
const PICK_LIST_LIMIT = 25;
/**
 * The Player matches a pick list offers, in the order it shows them: only pickable ones, by Kingdom then name,
 * the first 25. The pick handler derives the same list from the same matches, so picks index into it.
 */
export function listedPlayerMatches(matches) {
    const pickable = matches.filter(pickablePlayerMatch);
    return orderMatches(pickable);
}
/**
 * The Alliance matches a pick list offers, in the order it shows them: only pickable ones, by Kingdom then name,
 * the first 25. Picks index into the same list.
 */
export function listedAllianceMatches(matches) {
    const pickable = matches.filter(pickableAllianceMatch);
    return orderMatches(pickable);
}
/** Orders matches by Kingdom, then name, keeps the first 25 and counts the rest. */
export function orderMatches(matches) {
    const ordered = [...matches].sort(byKingdomThenName);
    return {
        listed: ordered.slice(0, PICK_LIST_LIMIT),
        leftOut: Math.max(0, ordered.length - PICK_LIST_LIMIT),
    };
}
const KINGDOM_LAST = Number.MAX_SAFE_INTEGER;
function byKingdomThenName(a, b) {
    const kingdomOrder = (a.kingdom ?? KINGDOM_LAST) - (b.kingdom ?? KINGDOM_LAST);
    if (kingdomOrder !== 0)
        return kingdomOrder;
    return (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
}
//# sourceMappingURL=player.js.map