import { SERVER_TIME_OFFSET_MINUTES, serverTimeOf } from "./server-time.js";
/** The fewest and the most Alliances a City Rotation holds. */
export const MIN_ROTATION_LENGTH = 2;
export const MAX_ROTATION_LENGTH = 10;
/** The Royal City siege is on Friday, weekday 5 in Server Time. */
const FRIDAY = 5;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;
const OFFSET_MS = SERVER_TIME_OFFSET_MINUTES * MINUTE_MS;
/** The Royal City siege of the Server Time week the moment falls in (Friday at the siege time), as a real moment. */
function siegeOfWeek(now, siegeTime) {
    const shifted = serverTimeOf(now);
    const midnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    const friday = midnight + (FRIDAY - shifted.getUTCDay()) * DAY_MS;
    return new Date(friday + (siegeTime.hour * 60 + siegeTime.minute) * MINUTE_MS - OFFSET_MS);
}
/** The first Royal City siege strictly after the moment: Friday at the siege time in Server Time. */
export function nextRoyalCitySiege(now, siegeTime) {
    const siege = siegeOfWeek(now, siegeTime);
    return siege.getTime() > now.getTime() ? siege : new Date(siege.getTime() + WEEK_MS);
}
/** The latest Royal City siege at or before the moment. */
export function lastRoyalCitySiege(now, siegeTime) {
    const siege = siegeOfWeek(now, siegeTime);
    return siege.getTime() <= now.getTime() ? siege : new Date(siege.getTime() - WEEK_MS);
}
/**
 * A City Rotation from an order and a Holding Alliance (the first tag when none is named). Tags are compared ignoring
 * letter case; 2 to 10 distinct tags, and the holder must be one of them.
 */
export function cityRotationOf(order, holding) {
    if (order.length < MIN_ROTATION_LENGTH)
        return { ok: false, problem: { kind: "too-short" } };
    if (order.length > MAX_ROTATION_LENGTH)
        return { ok: false, problem: { kind: "too-long" } };
    const seen = new Set();
    for (const tag of order) {
        const key = tag.toLowerCase();
        if (seen.has(key))
            return { ok: false, problem: { kind: "duplicate", tag } };
        seen.add(key);
    }
    const holder = holding === undefined ? order[0] : order.find((tag) => sameTag(tag, holding));
    if (holder === undefined)
        return { ok: false, problem: { kind: "holder-not-in-order", tag: holding ?? "" } };
    return { ok: true, rotation: { order: [...order], holding: holder } };
}
/** Whether two Alliance tags are the same, ignoring letter case. */
export function sameTag(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
/** The Alliance whose Turn follows the Holding Alliance's: the next tag in the order, wrapping to the first. */
export function nextHoldingAlliance(rotation) {
    const index = rotation.order.findIndex((tag) => sameTag(tag, rotation.holding));
    return rotation.order[(index + 1) % rotation.order.length] ?? rotation.holding;
}
/**
 * Whether a Member may set the City Rotation: they are Linked to an R5 (from the Game API or a Rank Approval) of an
 * Alliance of the Home Kingdom whose tag is in the current order, or, while no order is set, in the new one.
 */
export function mayEditCityRotation(editor, homeKingdom, currentOrder, newOrder) {
    const { allianceRank, allianceKingdom, allianceTag } = editor;
    if (allianceKingdom !== homeKingdom || allianceTag === undefined)
        return false;
    if (allianceRank.source !== "game-api" && allianceRank.source !== "rank-approval")
        return false;
    if (allianceRank.rank !== "R5")
        return false;
    const order = currentOrder ?? newOrder;
    return order.some((tag) => sameTag(tag, allianceTag));
}
//# sourceMappingURL=city-rotation.js.map