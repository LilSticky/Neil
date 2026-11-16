import type { Raid } from "./raid.js";
import { tierOf, type TroopBracket } from "./troop-bracket.js";

/**
 * The Availability Poll of a Raid (slice 036): each Linked Member of a Home Kingdom Alliance answers whether they fight,
 * and as which Fighter Class. Neil suggests the class from Troop Bracket and Might. Pure: no Discord, no clock.
 */

/** How much a Player can carry in a Raid, strongest first. Small Fry are not part of the strategy. */
export type FighterClass = "whale" | "dolphin" | "seal" | "small-fry";

/** Every Fighter Class, strongest first. */
export const FIGHTER_CLASSES: readonly FighterClass[] = ["whale", "dolphin", "seal", "small-fry"];

/** The Availability Poll opens this many hours before the Raid start (Wednesday at the start time, for a Saturday Raid). */
export const AVAILABILITY_POLL_LEAD_HOURS = 72;

const HOUR_MS = 3_600_000;

/** What a Fighter Class needs: a Troop Bracket or a Might, either one is enough. */
export interface FighterClassThreshold {
  readonly bracket: TroopBracket;
  readonly might: number;
}

/** The thresholds of the three strategy classes; everyone below the Seal's is Small Fry. Whale above Dolphin above Seal. */
export interface FighterClassThresholds {
  readonly whale: FighterClassThreshold;
  readonly dolphin: FighterClassThreshold;
  readonly seal: FighterClassThreshold;
}

/**
 * Neil's suggested Fighter Class: the highest class whose Troop Bracket or Might the Player reaches; at exactly a
 * threshold the class is reached. An unknown Troop Bracket or Might counts as below every threshold.
 */
export function suggestFighterClass(
  bracket: TroopBracket | undefined,
  might: number | undefined,
  thresholds: FighterClassThresholds,
): FighterClass {
  const reaches = (threshold: FighterClassThreshold): boolean =>
    (bracket !== undefined && tierOf(bracket) >= tierOf(threshold.bracket)) || (might !== undefined && might >= threshold.might);
  if (reaches(thresholds.whale)) return "whale";
  if (reaches(thresholds.dolphin)) return "dolphin";
  if (reaches(thresholds.seal)) return "seal";
  return "small-fry";
}

/** When the Raid's Availability Poll opens: 72 hours before its start. */
export function pollOpensAt(raid: Pick<Raid, "start">): Date {
  return new Date(raid.start.getTime() - AVAILABILITY_POLL_LEAD_HOURS * HOUR_MS);
}

/** A Member's answer: not available, or available as a Fighter Class. */
export type Availability = { readonly kind: "not-available" } | { readonly kind: "available"; readonly fighterClass: FighterClass };

/** One Member's answer for a Raid, given on the poll card of an Alliance (its tag). One per Member per Raid. */
export interface AvailabilityAnswer {
  readonly memberId: string;
  readonly tag: string;
  readonly availability: Availability;
}

/** Why a poll ended: the Raid started, or the War Council cancelled it. */
export type PollCloseReason = "started" | "cancelled";

/** The state of a Raid's poll, as stored: never opened, open, or closed. */
export type PollState =
  | { readonly kind: "not-opened" }
  | { readonly kind: "open" }
  | { readonly kind: "closed"; readonly reason: PollCloseReason };

/** What the clock does with a Raid's poll now. */
export type PollStep = { readonly kind: "none" } | { readonly kind: "open" } | { readonly kind: "close"; readonly reason: PollCloseReason };

/**
 * The clock's step for a poll. A poll opens once, from 72 hours before the start until the start, unless the Raid is
 * cancelled (a Raid cancelled before then gets none). An open poll closes as cancelled when the Raid is cancelled, and as
 * started at the start. A closed poll stays closed.
 */
export function pollStep(raid: Pick<Raid, "start" | "state">, poll: PollState, now: Date): PollStep {
  const cancelled = raid.state.kind === "cancelled";
  const started = now.getTime() >= raid.start.getTime();
  if (poll.kind === "not-opened") {
    if (cancelled || started || now.getTime() < pollOpensAt(raid).getTime()) return { kind: "none" };
    return { kind: "open" };
  }
  if (poll.kind === "closed") return { kind: "none" };
  if (cancelled) return { kind: "close", reason: "cancelled" };
  if (started) return { kind: "close", reason: "started" };
  return { kind: "none" };
}

/** Why an answer is not taken. */
export type AnswerRefusal = "not-opened" | "closed" | "cancelled";

/** Whether the poll takes an answer now: it must be open, the Raid not cancelled and not started. */
export function answerRefusal(raid: Pick<Raid, "start" | "state">, poll: PollState, now: Date): AnswerRefusal | undefined {
  if (raid.state.kind === "cancelled" || (poll.kind === "closed" && poll.reason === "cancelled")) return "cancelled";
  if (poll.kind === "not-opened") return "not-opened";
  if (poll.kind === "closed" || now.getTime() >= raid.start.getTime()) return "closed";
  return undefined;
}

/** The counts of one Alliance or the Kingdom. The strategy sum is Whales, Dolphins and Seals; Small Fry are apart. */
export interface AvailabilityCounts {
  readonly whale: number;
  readonly dolphin: number;
  readonly seal: number;
  readonly strategy: number;
  readonly smallFry: number;
  readonly notAvailable: number;
}

export interface AvailabilityTotals {
  /** One row per Alliance, sorted by tag; an Alliance without answers shows zeros. */
  readonly alliances: readonly { readonly tag: string; readonly counts: AvailabilityCounts }[];
  readonly kingdom: AvailabilityCounts;
}

const ZERO: AvailabilityCounts = { whale: 0, dolphin: 0, seal: 0, strategy: 0, smallFry: 0, notAvailable: 0 };

function counted(counts: AvailabilityCounts, availability: Availability): AvailabilityCounts {
  if (availability.kind === "not-available") return { ...counts, notAvailable: counts.notAvailable + 1 };
  switch (availability.fighterClass) {
    case "whale":
      return { ...counts, whale: counts.whale + 1, strategy: counts.strategy + 1 };
    case "dolphin":
      return { ...counts, dolphin: counts.dolphin + 1, strategy: counts.strategy + 1 };
    case "seal":
      return { ...counts, seal: counts.seal + 1, strategy: counts.strategy + 1 };
    case "small-fry":
      return { ...counts, smallFry: counts.smallFry + 1 };
  }
}

/** The counts per Alliance (the tags given, and any other tag answered for) and for the Kingdom. Counts only, no names. */
export function availabilityTotals(answers: readonly AvailabilityAnswer[], tags: readonly string[]): AvailabilityTotals {
  const allTags = [...new Set([...tags, ...answers.map((answer) => answer.tag)])].sort((a, b) => a.localeCompare(b));
  const alliances = allTags.map((tag) => ({
    tag,
    counts: answers.filter((answer) => answer.tag === tag).reduce((sum, answer) => counted(sum, answer.availability), ZERO),
  }));
  const kingdom = answers.reduce((sum, answer) => counted(sum, answer.availability), ZERO);
  return { alliances, kingdom };
}

/** The counts of one Alliance; zeros when it has no answers. */
export function countsOf(totals: AvailabilityTotals, tag: string): AvailabilityCounts {
  return totals.alliances.find((alliance) => alliance.tag === tag)?.counts ?? ZERO;
}
