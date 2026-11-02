import { utcDayOf, type UtcDay } from "./daily-quota.js";
import type { KingdomNumber, Uid } from "./lookup-input.js";
import type { RankOnLink } from "./link.js";
import type { MemberId } from "./rank-approval.js";
import type { Alliance, Player, RosterEntry } from "./player.js";

/** An Alliance by tag and Kingdom: the same tag in another Kingdom is another Alliance. */
export interface AllianceRef {
  readonly kingdom: KingdomNumber;
  readonly tag: string;
}

/** A Linked Member as the Daily Sync sees it: the uid they are linked to, and the Alliance they were last seen in. */
export interface SyncLink {
  readonly memberId: MemberId;
  readonly uid: Uid;
  readonly lastAlliance: AllianceRef | undefined;
}

/** The Game API requests a Daily Sync needs: one roster per Alliance, and one uid lookup per Member in no Alliance. */
export interface SyncPlan {
  readonly rosters: readonly { readonly alliance: AllianceRef; readonly links: readonly SyncLink[] }[];
  readonly byUid: readonly SyncLink[];
}

/**
 * Plans the requests of a Daily Sync. Members the last run left over go first, so their Alliances and their uid
 * lookups come before the others'. Members last seen in no Alliance get a uid lookup; the rest share one roster per
 * Alliance.
 */
export function planSync(links: readonly SyncLink[], leftOver: readonly MemberId[]): SyncPlan {
  const leftOverIds = new Set(leftOver);
  const ordered = [
    ...links.filter((link) => leftOverIds.has(link.memberId)),
    ...links.filter((link) => !leftOverIds.has(link.memberId)),
  ];

  const byAlliance = new Map<string, { alliance: AllianceRef; links: SyncLink[] }>();
  const byUid: SyncLink[] = [];
  for (const link of ordered) {
    const alliance = link.lastAlliance;
    if (alliance === undefined) {
      byUid.push(link);
      continue;
    }
    const key = `${alliance.kingdom.toString()}:${alliance.tag}`;
    const group = byAlliance.get(key);
    if (group === undefined) {
      byAlliance.set(key, { alliance, links: [link] });
    } else {
      group.links.push(link);
    }
  }
  return { rosters: [...byAlliance.values()], byUid };
}

/**
 * The Player of one roster row, in the Alliance the roster belongs to. Undefined when the row lacks its Kingdom or
 * sanctuary level, so the Member must be looked up by uid instead.
 */
export function playerFromRoster(alliance: Alliance, entry: RosterEntry): Player | undefined {
  if (entry.kingdom === undefined || entry.sanctuaryLevel === undefined) return undefined;
  return {
    uid: entry.uid,
    name: entry.name,
    kingdom: entry.kingdom,
    // A roster row does not give the power; names and roles never use it.
    power: 0,
    sanctuaryLevel: entry.sanctuaryLevel,
    alliance: { tag: alliance.tag, name: alliance.name, leaderUid: undefined },
    allianceRank: entry.allianceRank,
  };
}

/**
 * The Alliance Rank a Link carries after a Daily Sync (FR-004). The rank the Game API gives in an Alliance wins;
 * a Rank Approval stays only while the Player is still in the Alliance it was approved in; anything else is unknown,
 * and a Player in no Alliance has none.
 */
export function rankAfterSync(rank: RankOnLink, lastAlliance: AllianceRef | undefined, now: Player): RankOnLink {
  if (now.alliance === undefined) return { source: "no-alliance" };
  const gameRank = now.allianceRank;
  if (gameRank !== "unknown") return { source: "game-api", rank: gameRank };

  const stillInLastAlliance =
    lastAlliance !== undefined && lastAlliance.tag === now.alliance.tag && lastAlliance.kingdom === now.kingdom;
  if (rank.source === "rank-approval" && stillInLastAlliance) return rank;
  return { source: "unknown" };
}

/**
 * Whether the Daily Sync is due: the hour has come (UTC) and today's run is not recorded yet. A run missed at its
 * hour is therefore due at the first check after it.
 */
export function isDue(lastRunDay: UtcDay | undefined, now: Date, hour: number): boolean {
  if (now.getUTCHours() < hour) return false;
  return lastRunDay !== utcDayOf(now);
}
