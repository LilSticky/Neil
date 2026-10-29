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

/** An Alliance as the Game describes it. */
export interface Alliance {
  readonly tag: string;
  readonly name: string;
  readonly kingdom: KingdomNumber;
  readonly power: number;
  readonly memberCount: number;
  readonly capacity: number;
  readonly leaderName: string | undefined;
}

/** One candidate when a lookup is ambiguous; every field is optional because the Game may omit it. */
export interface Match {
  readonly tag?: string;
  readonly name?: string;
  readonly kingdom?: number;
  readonly uid?: string;
}

/** What the Game API client returns for every lookup; an API failure is a value, never a throw. */
export type LookupResult<T> =
  | { readonly kind: "found"; readonly value: T }
  | { readonly kind: "not-found" }
  | { readonly kind: "ambiguous"; readonly matches: readonly Match[] }
  | { readonly kind: "quota-spent" }
  | { readonly kind: "not-prepared" }
  | { readonly kind: "try-again" }
  | { readonly kind: "unavailable"; readonly reason: "auth" | "unexpected" };
