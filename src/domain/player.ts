import type { KingdomNumber, Uid } from "./lookup-input.js";

/** An Alliance Rank as Neil knows it: R1–R5, or unknown when the Game does not say. */
export type AllianceRank = "R1" | "R2" | "R3" | "R4" | "R5" | "unknown";

/** The Alliance a Player belongs to, as the Game names it. */
export interface PlayerAlliance {
  readonly tag: string;
  readonly name: string;
}

interface PlayerProfile {
  readonly uid: Uid;
  readonly name: string;
  readonly kingdom: KingdomNumber;
  readonly power: number;
  readonly sanctuaryLevel: number;
}

/**
 * A Player. Without an Alliance there is no Alliance Rank, and the union makes the
 * invalid combination impossible to build.
 */
export type Player =
  | (PlayerProfile & { readonly alliance: undefined; readonly allianceRank: undefined })
  | (PlayerProfile & { readonly alliance: PlayerAlliance; readonly allianceRank: AllianceRank });

/** One Player on an Alliance's roster; the name is "Unknown" when the Game gave none. */
export interface RosterEntry {
  readonly uid: Uid;
  readonly name: string;
  readonly allianceRank: AllianceRank;
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
