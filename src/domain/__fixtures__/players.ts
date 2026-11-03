import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../lookup-input.js";
import type { RankOnLink } from "../link.js";
import type { AllianceRank, Player } from "../player.js";

/** Test helpers: build valid domain values, and throw when a test passes something invalid. */

export function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${String(number)} is not a valid Kingdom`);
  return parsed.value;
}

export function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

/** A Player who is in no Alliance. */
export function unallied(name: string, kingdom: number, sanctuaryLevel: number): Player {
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
export function allied(options: {
  readonly name: string;
  readonly kingdom: number;
  readonly sanctuaryLevel: number;
  readonly tag: string;
  readonly rank: AllianceRank;
}): Player {
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
export function gameApiRank(rank: "R1" | "R2" | "R3" | "R4" | "R5"): RankOnLink {
  return { source: "game-api", rank };
}

/** An Alliance Rank a Member approved by hand (a Rank Approval). */
export function approvedRank(rank: "R1" | "R2" | "R3" | "R4" | "R5"): RankOnLink {
  return {
    source: "rank-approval",
    rank,
    approvedBy: "100000000000000001",
    approvedAt: new Date("2026-11-01T10:00:00Z"),
  };
}

export const UNKNOWN_RANK: RankOnLink = { source: "unknown" };
export const NO_ALLIANCE: RankOnLink = { source: "no-alliance" };
