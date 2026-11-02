import type { KingdomNumber, Uid } from "./lookup-input.js";

/** An Alliance Rank as Neil knows it: R1–R5, or unknown when the Game does not say. */
export type AllianceRank = "R1" | "R2" | "R3" | "R4" | "R5" | "unknown";

/** The Alliance a Player belongs to, as the Game names it. */
export interface PlayerAlliance {
  readonly tag: string;
  readonly name: string;
  /** The Alliance's leader, its R5, as the Game API names it; undefined when the Game gives none readable. */
  readonly leaderUid: Uid | undefined;
}

/** The details of a Player beyond the profile; each value is undefined when the Game gives none readable. */
export interface PlayerDetails {
  readonly kills: number | undefined;
  readonly vipLevel: number | undefined;
  readonly likes: number | undefined;
  /** The last time the Player was seen online (`last_online_at`). */
  readonly lastOnlineAt: Date | undefined;
  /** The language code the Player uses (`language`). */
  readonly language: string | undefined;
  /** The Player's position on the map (`x`, `y`). */
  readonly location: { readonly x: number; readonly y: number } | undefined;
  /** The picture path of the Player's avatar (`avatar_url`). */
  readonly avatarPath: string | undefined;
  /** The picture path of the Player's Kingdom badge (`server_badge_url`). */
  readonly kingdomBadgePath: string | undefined;
}

interface PlayerProfile {
  readonly uid: Uid;
  readonly name: string;
  readonly kingdom: KingdomNumber;
  readonly power: number;
  readonly sanctuaryLevel: number;
  readonly details?: PlayerDetails;
}

/**
 * A Player. Without an Alliance there is no Alliance Rank, and the union makes the
 * invalid combination impossible to build.
 */
export type Player =
  | (PlayerProfile & { readonly alliance: undefined; readonly allianceRank: undefined })
  | (PlayerProfile & { readonly alliance: PlayerAlliance; readonly allianceRank: AllianceRank });

/**
 * One Player on an Alliance's roster; the name is "Unknown" when the Game gave none. The activity figures, the online
 * flag and the last online time are undefined when the Game gives no data for them.
 */
export interface RosterEntry {
  readonly uid: Uid;
  readonly name: string;
  readonly allianceRank: AllianceRank;
  /** The Member's power (`power`); undefined when the Game gives none readable. */
  readonly power?: number;
  /** The Kingdom the Member is in (`kid`); undefined when the Game gives none. */
  readonly kingdom: KingdomNumber | undefined;
  /** The Member's sanctuary level (`lv`); undefined when the Game gives none. */
  readonly sanctuaryLevel: number | undefined;
  /** Weekly Activity points (`active`). */
  readonly weeklyActivity: number | undefined;
  /** Today's Daily Honor (`daily_honor`). */
  readonly dailyHonor: number | undefined;
  /** Today's Daily Tech (`daily_tech`). */
  readonly dailyTech: number | undefined;
  readonly online: boolean | undefined;
  readonly lastOnlineAt: Date | undefined;
}

/** The Join Requirements of an Alliance: whether it is open, and the minimums a joiner needs. */
export interface JoinRequirements {
  readonly open: boolean;
  readonly minimumPower: number;
  readonly minimumSanctuaryLevel: number;
}

/** The details of an Alliance beyond the profile; each value is undefined when the Game gives none readable. */
export interface AllianceDetails {
  readonly level: number | undefined;
  /** The experience points of the Alliance (`exp`). */
  readonly xp: number | undefined;
  readonly giftLevel: number | undefined;
  /** The Alliance's rank among the Alliances of its Kingdom (`rank.rank`). */
  readonly kingdomPowerRank: number | undefined;
  /** The language code the Alliance uses (`language`). */
  readonly language: string | undefined;
  readonly joinRequirements: JoinRequirements | undefined;
  /** The picture path of the Alliance's badge (`badge_url`). */
  readonly badgePath: string | undefined;
  /** The picture path of the Kingdom badge (`server_badge_url`). */
  readonly kingdomBadgePath: string | undefined;
}

/** An Alliance as the Game describes it. */
export interface Alliance {
  readonly tag: string;
  readonly name: string;
  readonly kingdom: KingdomNumber;
  readonly power: number;
  readonly memberCount: number;
  readonly capacity: number;
  readonly leaderName: string | undefined;
  readonly roster: readonly RosterEntry[];
  readonly details?: AllianceDetails;
}

/** One candidate when a lookup is ambiguous; every field is optional because the Game may omit it. */
export interface Match {
  readonly tag?: string;
  readonly name?: string;
  readonly kingdom?: number;
  readonly uid?: string;
}

/** A Player match that can be looked up by uid and told apart from the others (it has a Kingdom). */
export type PickablePlayerMatch = Match & { readonly uid: string; readonly kingdom: number };

/** An Alliance match that can be looked up by tag and Kingdom, and told apart from the others. */
export type PickableAllianceMatch = Match & { readonly tag: string; readonly kingdom: number };

export function pickablePlayerMatch(match: Match): match is PickablePlayerMatch {
  return match.uid !== undefined && match.kingdom !== undefined;
}

export function pickableAllianceMatch(match: Match): match is PickableAllianceMatch {
  return match.tag !== undefined && match.kingdom !== undefined;
}

/** How many matches a pick list shows at most. */
const PICK_LIST_LIMIT = 25;

/**
 * The Player matches a pick list offers, in the order it shows them: only pickable ones, by Kingdom then name,
 * the first 25. The pick handler derives the same list from the same matches, so picks index into it.
 */
export function listedPlayerMatches(matches: readonly Match[]): {
  readonly listed: PickablePlayerMatch[];
  readonly leftOut: number;
} {
  const pickable = matches.filter(pickablePlayerMatch);
  return orderMatches(pickable);
}

/**
 * The Alliance matches a pick list offers, in the order it shows them: only pickable ones, by Kingdom then name,
 * the first 25. Picks index into the same list.
 */
export function listedAllianceMatches(matches: readonly Match[]): {
  readonly listed: PickableAllianceMatch[];
  readonly leftOut: number;
} {
  const pickable = matches.filter(pickableAllianceMatch);
  return orderMatches(pickable);
}

/**
 * The Alliance matches a ranked pick list offers, in the order given (the caller ranked them): only pickable ones, the
 * first 25. Picks index into the same list.
 */
export function rankedAllianceMatches(matches: readonly Match[]): PickableAllianceMatch[] {
  return matches.filter(pickableAllianceMatch).slice(0, PICK_LIST_LIMIT);
}

/** Orders matches by Kingdom, then name, keeps the first 25 and counts the rest. */
export function orderMatches<T extends Match>(
  matches: readonly T[],
): { readonly listed: T[]; readonly leftOut: number } {
  const ordered = [...matches].sort(byKingdomThenName);
  return {
    listed: ordered.slice(0, PICK_LIST_LIMIT),
    leftOut: Math.max(0, ordered.length - PICK_LIST_LIMIT),
  };
}

const KINGDOM_LAST = Number.MAX_SAFE_INTEGER;

function byKingdomThenName(a: Match, b: Match): number {
  const kingdomOrder = (a.kingdom ?? KINGDOM_LAST) - (b.kingdom ?? KINGDOM_LAST);
  if (kingdomOrder !== 0) return kingdomOrder;
  return (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
}

/** What the Game API client returns for every lookup; an API failure is a value, never a throw. */
export type LookupResult<T> =
  | { readonly kind: "found"; readonly value: T; readonly fetchedAt: Date }
  | { readonly kind: "not-found" }
  | { readonly kind: "ambiguous"; readonly matches: readonly Match[] }
  | { readonly kind: "quota-spent"; readonly resetsAt: Date }
  | { readonly kind: "reserve-kept"; readonly resetsAt: Date }
  | { readonly kind: "not-prepared" }
  | { readonly kind: "try-again" }
  | { readonly kind: "unavailable"; readonly reason: "auth" | "unexpected" };
