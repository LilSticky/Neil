import { parseKingdom, parseUid } from "../lookup-input.js";
/** Test helpers: build valid domain values, and throw when a test passes something invalid. */
export function kingdomOf(number) {
    const parsed = parseKingdom(number);
    if (!parsed.ok)
        throw new Error(`the test Kingdom ${String(number)} is not a valid Kingdom`);
    return parsed.value;
}
export function uidOf(digits) {
    const parsed = parseUid(digits);
    if (!parsed.ok)
        throw new Error(`the test uid ${digits} is not a valid uid`);
    return parsed.value;
}
/** A Player who is in no Alliance. */
export function unallied(name, kingdom, sanctuaryLevel) {
    return {
        uid: uidOf("145563254785"),
        name,
        kingdom: kingdomOf(kingdom),
        might: 1_000_000,
        sanctuaryLevel,
        alliance: undefined,
        allianceRank: undefined,
    };
}
/** A Player in an Alliance with the given tag and Alliance Rank as the Game API reports it. */
export function allied(options) {
    return {
        uid: uidOf("145563254785"),
        name: options.name,
        kingdom: kingdomOf(options.kingdom),
        might: 1_000_000,
        sanctuaryLevel: options.sanctuaryLevel,
        alliance: { tag: options.tag, name: `${options.tag} alliance`, leaderUid: undefined },
        allianceRank: options.rank,
    };
}
/** An Alliance Rank the Game API gave. */
export function gameApiRank(rank) {
    return { source: "game-api", rank };
}
/** An Alliance Rank a Member approved by hand (a Rank Approval). */
export function approvedRank(rank) {
    return {
        source: "rank-approval",
        rank,
        approvedBy: "100000000000000001",
        approvedAt: new Date("2026-11-01T10:00:00Z"),
    };
}
export const UNKNOWN_RANK = { source: "unknown" };
export const NO_ALLIANCE = { source: "no-alliance" };
//# sourceMappingURL=players.js.map