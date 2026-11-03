import { utcDayOf } from "./daily-quota.js";
/**
 * Plans the requests of a Daily Sync, in the order they are sent. Members the last run left over come first, so their
 * steps come before the others'. A Member last seen in no Alliance, or whose Alliance is unrecorded, gets a uid lookup;
 * the rest share one roster per Alliance, placed where the first of its Members comes.
 */
export function planSync(links, leftOver) {
    const leftOverIds = new Set(leftOver);
    const ordered = [
        ...links.filter((link) => leftOverIds.has(link.memberId)),
        ...links.filter((link) => !leftOverIds.has(link.memberId)),
    ];
    const steps = [];
    // Each roster's links array is shared with its step, so a later Member of the Alliance joins the step made for it.
    const rosterLinks = new Map();
    for (const link of ordered) {
        const alliance = link.lastAlliance;
        if (alliance === undefined || alliance === "unrecorded") {
            steps.push({ kind: "uid", link });
            continue;
        }
        const key = `${alliance.kingdom.toString()}:${alliance.tag}`;
        const members = rosterLinks.get(key);
        if (members !== undefined) {
            members.push(link);
        }
        else {
            const created = [link];
            rosterLinks.set(key, created);
            steps.push({ kind: "roster", alliance, links: created });
        }
    }
    return steps;
}
/**
 * The Player of one roster row, in the Alliance the roster belongs to. Undefined when the row lacks its Kingdom or
 * sanctuary level, so the Member must be looked up by uid instead.
 */
export function playerFromRoster(alliance, entry) {
    if (entry.kingdom === undefined || entry.sanctuaryLevel === undefined)
        return undefined;
    return {
        uid: entry.uid,
        name: entry.name,
        kingdom: entry.kingdom,
        // A roster row does not give the might; names and roles never use it.
        might: 0,
        sanctuaryLevel: entry.sanctuaryLevel,
        alliance: { tag: alliance.tag, name: alliance.name, leaderUid: undefined },
        allianceRank: entry.allianceRank,
    };
}
/**
 * The Alliance Rank a Link carries after a Daily Sync (FR-004). The rank the Game API gives in an Alliance wins; a
 * Rank Approval stays while the Player is in the Alliance it was approved in, or while the Alliance last applied is
 * unrecorded (it cannot be told that they moved). Anything else is unknown, and a Player in no Alliance has none.
 */
export function rankAfterSync(rank, lastAlliance, now) {
    if (now.alliance === undefined)
        return { source: "no-alliance" };
    const gameRank = now.allianceRank;
    if (gameRank !== "unknown")
        return { source: "game-api", rank: gameRank };
    if (rank.source !== "rank-approval")
        return { source: "unknown" };
    const stillInLastAlliance = lastAlliance === "unrecorded" ||
        (lastAlliance !== undefined && lastAlliance.tag === now.alliance.tag && lastAlliance.kingdom === now.kingdom);
    return stillInLastAlliance ? rank : { source: "unknown" };
}
/**
 * Whether the Daily Sync is due: the hour has come (UTC) and today's run is not recorded yet. A run missed at its
 * hour is therefore due at the first check after it.
 */
export function isDue(lastRunDay, now, hour) {
    if (now.getUTCHours() < hour)
        return false;
    return lastRunDay !== utcDayOf(now);
}
//# sourceMappingURL=daily-sync.js.map