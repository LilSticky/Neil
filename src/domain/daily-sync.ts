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

/**
 * The Alliance a Member was last applied in: an Alliance, none, or "unrecorded" for an Applied State written before
 * the Alliance was recorded (so it is not known whether the Member had one).
 */
export type LastAlliance = AllianceRef | undefined | "unrecorded";

/** A Linked Member as the Daily Sync sees it: the uid they are linked to, and the Alliance they were last seen in. */
export interface SyncLink {
  readonly memberId: MemberId;
  readonly uid: Uid;
  readonly lastAlliance: LastAlliance;
}

/** One Game API request of a Daily Sync: the roster of an Alliance for its Linked Members, or one Member's uid lookup. */
export type SyncStep =
  | { readonly kind: "roster"; readonly alliance: AllianceRef; readonly links: readonly SyncLink[] }
  | { readonly kind: "uid"; readonly link: SyncLink };

/**
 * Plans the requests of a Daily Sync, in the order they are sent. Members the last run left over come first, so their
 * steps come before the others'. A Member last seen in no Alliance, or whose Alliance is unrecorded, gets a uid lookup;
 * the rest share one roster per Alliance, placed where the first of its Members comes.
 */
export function planSync(links: readonly SyncLink[], leftOver: readonly MemberId[]): SyncStep[] {
  const leftOverIds = new Set(leftOver);
  const ordered = [
    ...links.filter((link) => leftOverIds.has(link.memberId)),
    ...links.filter((link) => !leftOverIds.has(link.memberId)),
  ];

  const steps: SyncStep[] = [];
  // Each roster's links array is shared with its step, so a later Member of the Alliance joins the step made for it.
  const rosterLinks = new Map<string, SyncLink[]>();
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
    } else {
      const created: SyncLink[] = [link];
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
 * The Alliance Rank a Link carries after a Daily Sync (FR-004). The rank the Game API gives in an Alliance wins; a
 * Rank Approval stays while the Player is in the Alliance it was approved in, or while the Alliance last applied is
 * unrecorded (it cannot be told that they moved). Anything else is unknown, and a Player in no Alliance has none.
 */
export function rankAfterSync(rank: RankOnLink, lastAlliance: LastAlliance, now: Player): RankOnLink {
  if (now.alliance === undefined) return { source: "no-alliance" };
  const gameRank = now.allianceRank;
  if (gameRank !== "unknown") return { source: "game-api", rank: gameRank };
  if (rank.source !== "rank-approval") return { source: "unknown" };

  const stillInLastAlliance =
    lastAlliance === "unrecorded" ||
    (lastAlliance !== undefined && lastAlliance.tag === now.alliance.tag && lastAlliance.kingdom === now.kingdom);
  return stillInLastAlliance ? rank : { source: "unknown" };
}

/**
 * Whether the Daily Sync is due: the hour has come (UTC) and today's run is not recorded yet. A run missed at its
 * hour is therefore due at the first check after it.
 */
export function isDue(lastRunDay: UtcDay | undefined, now: Date, hour: number): boolean {
  if (now.getUTCHours() < hour) return false;
  return lastRunDay !== utcDayOf(now);
}
