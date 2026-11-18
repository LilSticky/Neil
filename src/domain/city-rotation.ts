import type { Editor } from "./exile.js";
import type { KingdomNumber } from "./lookup-input.js";
import { SERVER_TIME_OFFSET_MINUTES, serverTimeOf } from "./server-time.js";

/** A time of day in Server Time. */
export interface SiegeTime {
  readonly hour: number;
  readonly minute: number;
}

/** Whether the Kingdom takes the Royal City in a fixed order (`rotation`) or fights over it (`contested`). */
export type CityRotationMode = "rotation" | "contested";

/** The fewest and the most Alliances a City Rotation holds. */
export const MIN_ROTATION_LENGTH = 2;
export const MAX_ROTATION_LENGTH = 10;

/** The Royal City siege is on Friday, weekday 5 in Server Time. */
const FRIDAY = 5;
/** The Royal City siege starts at 12:00 Server Time (14:00 UTC), the owner's decision. */
export const ROYAL_CITY_SIEGE_TIME: SiegeTime = { hour: 12, minute: 0 };
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const WEEK_MS = 7 * DAY_MS;
const OFFSET_MS = SERVER_TIME_OFFSET_MINUTES * MINUTE_MS;

/** The Royal City siege of the Server Time week the moment falls in (Friday at 12:00 Server Time), as a real moment. */
function siegeOfWeek(now: Date): Date {
  const shifted = serverTimeOf(now);
  const midnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  const friday = midnight + (FRIDAY - shifted.getUTCDay()) * DAY_MS;
  return new Date(friday + (ROYAL_CITY_SIEGE_TIME.hour * 60 + ROYAL_CITY_SIEGE_TIME.minute) * MINUTE_MS - OFFSET_MS);
}

/** The first Royal City siege strictly after the moment: Friday at 12:00 Server Time. */
export function nextRoyalCitySiege(now: Date): Date {
  const siege = siegeOfWeek(now);
  return siege.getTime() > now.getTime() ? siege : new Date(siege.getTime() + WEEK_MS);
}

/** The latest Royal City siege at or before the moment. */
export function lastRoyalCitySiege(now: Date): Date {
  const siege = siegeOfWeek(now);
  return siege.getTime() <= now.getTime() ? siege : new Date(siege.getTime() - WEEK_MS);
}

/** A City Rotation: the Alliance tags in their fixed order, and the Holding Alliance, always one of them. */
export interface CityRotation {
  readonly order: readonly string[];
  readonly holding: string;
}

/** Why an order was refused. */
export type RotationProblem =
  | { readonly kind: "too-short" }
  | { readonly kind: "too-long" }
  | { readonly kind: "duplicate"; readonly tag: string }
  | { readonly kind: "holder-not-in-order"; readonly tag: string };

export type RotationResult =
  | { readonly ok: true; readonly rotation: CityRotation }
  | { readonly ok: false; readonly problem: RotationProblem };

/**
 * A City Rotation from an order and a Holding Alliance (the first tag when none is named). Tags are compared ignoring
 * letter case; 2 to 10 distinct tags, and the holder must be one of them.
 */
export function cityRotationOf(order: readonly string[], holding?: string): RotationResult {
  if (order.length < MIN_ROTATION_LENGTH) return { ok: false, problem: { kind: "too-short" } };
  if (order.length > MAX_ROTATION_LENGTH) return { ok: false, problem: { kind: "too-long" } };
  const seen = new Set<string>();
  for (const tag of order) {
    const key = tag.toLowerCase();
    if (seen.has(key)) return { ok: false, problem: { kind: "duplicate", tag } };
    seen.add(key);
  }
  const holder = holding === undefined ? order[0] : order.find((tag) => sameTag(tag, holding));
  if (holder === undefined) return { ok: false, problem: { kind: "holder-not-in-order", tag: holding ?? "" } };
  return { ok: true, rotation: { order: [...order], holding: holder } };
}

/** Whether two Alliance tags are the same, ignoring letter case. */
export function sameTag(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The Alliance whose Turn follows the Holding Alliance's: the next tag in the order, wrapping to the first. */
export function nextHoldingAlliance(rotation: CityRotation): string {
  const index = rotation.order.findIndex((tag) => sameTag(tag, rotation.holding));
  return rotation.order[(index + 1) % rotation.order.length] ?? rotation.holding;
}

/**
 * Whether a Member may set the City Rotation: they are Linked to an R5 (from the Game API or a Rank Approval) of an
 * Alliance of the Home Kingdom whose tag is in the current order, or, while no order is set, in the new one.
 */
export function mayEditCityRotation(
  editor: Editor,
  homeKingdom: KingdomNumber,
  currentOrder: readonly string[] | undefined,
  newOrder: readonly string[],
): boolean {
  const { allianceRank, allianceKingdom, allianceTag } = editor;
  if (allianceKingdom !== homeKingdom || allianceTag === undefined) return false;
  if (allianceRank.source !== "game-api" && allianceRank.source !== "rank-approval") return false;
  if (allianceRank.rank !== "R5") return false;
  const order = currentOrder ?? newOrder;
  return order.some((tag) => sameTag(tag, allianceTag));
}

/**
 * Whether a Member may change the City Rotation (move, skip, leave, pause, resume): they are Linked to an R5 (from the
 * Game API or a Rank Approval) of an Alliance of the Home Kingdom whose tag is in the order.
 */
export function mayChangeCityRotation(editor: Editor, homeKingdom: KingdomNumber, order: readonly string[]): boolean {
  return order.length > 0 && mayEditCityRotation(editor, homeKingdom, order, order);
}

/**
 * Where a City Rotation stands: the order, the Holding Alliance (which may have left the order and holds until the next
 * Handover), the Alliance recorded as next after a skip or a leave, and the Alliance expected in an open Turn.
 */
export interface RotationTurns {
  readonly order: readonly string[];
  readonly holding: string | undefined;
  /** The next Alliance when it does not simply follow the Holding Alliance; undefined otherwise. */
  readonly next: string | undefined;
  /** The Alliance expected to take the Royal City in a Turn still waiting for confirmation; undefined when none is open. */
  readonly expected: string | undefined;
}

/** The tag that follows `tag` in the order, wrapping to the first; the first tag when `tag` is not in the order. */
function following(order: readonly string[], tag: string): string {
  const index = order.findIndex((candidate) => sameTag(candidate, tag));
  return order[(index + 1) % order.length] ?? tag;
}

/**
 * The Alliance whose Turn is next: the one expected in an open Turn, else the one recorded after a skip or a leave,
 * else the one after the Holding Alliance (the first being the holder when none is known).
 */
export function upcomingAlliance(turns: RotationTurns): string | undefined {
  if (turns.expected !== undefined) return turns.expected;
  if (turns.next !== undefined) return turns.next;
  const first = turns.order[0];
  if (first === undefined) return undefined;
  return nextHoldingAlliance({ order: turns.order, holding: turns.holding ?? first });
}

/** Why a change of the City Rotation was refused. */
export type RotationChangeProblem =
  | { readonly kind: "not-in-rotation"; readonly tag: string }
  | { readonly kind: "position-out-of-range"; readonly length: number }
  | { readonly kind: "no-change" }
  | { readonly kind: "too-short" }
  | { readonly kind: "last-alliance" };

export type RotationChange<T extends object = object> =
  | ({ readonly ok: true; readonly turns: RotationTurns } & T)
  | { readonly ok: false; readonly problem: RotationChangeProblem };

function tagIn(order: readonly string[], tag: string): string | undefined {
  return order.find((candidate) => sameTag(candidate, tag));
}

/**
 * Moves an Alliance to a place in the order (1 is the first). The Holding Alliance and an open Turn stay; the next
 * Alliance follows the Holding Alliance in the new order.
 */
export function moveAlliance(turns: RotationTurns, tag: string, position: number): RotationChange {
  const moved = tagIn(turns.order, tag);
  if (moved === undefined) return { ok: false, problem: { kind: "not-in-rotation", tag } };
  const length = turns.order.length;
  if (!Number.isInteger(position) || position < 1 || position > length) {
    return { ok: false, problem: { kind: "position-out-of-range", length } };
  }
  const rest = turns.order.filter((candidate) => candidate !== moved);
  const order = [...rest.slice(0, position - 1), moved, ...rest.slice(position - 1)];
  if (order.every((candidate, index) => candidate === turns.order[index])) return { ok: false, problem: { kind: "no-change" } };
  const holderInOrder = turns.holding !== undefined && tagIn(order, turns.holding) !== undefined;
  return { ok: true, turns: { ...turns, order, next: holderInOrder ? undefined : turns.next } };
}

/**
 * Skips the next Turn, the NaP Council's decision: the Alliance after the skipped one is next, and the skipped one keeps
 * its place for the next round. In an open Turn, that Alliance becomes the one expected.
 */
export function skipTurn(turns: RotationTurns): RotationChange<{ readonly skipped: string; readonly upcoming: string }> {
  const skipped = upcomingAlliance(turns);
  if (turns.order.length < MIN_ROTATION_LENGTH || skipped === undefined) return { ok: false, problem: { kind: "too-short" } };
  const upcoming = following(turns.order, skipped);
  const changed: RotationTurns =
    turns.expected === undefined ? { ...turns, next: upcoming } : { ...turns, next: undefined, expected: upcoming };
  return { ok: true, turns: changed, skipped, upcoming };
}

/**
 * Takes an Alliance that left the NaP out of the order. If it was next or expected, the Alliance after it takes that
 * place; if it holds the Royal City, it holds until the next Handover and the Alliance after it is next. The last
 * Alliance cannot be taken out.
 */
export function leaveRotation(turns: RotationTurns, tag: string): RotationChange<{ readonly left: string }> {
  const left = tagIn(turns.order, tag);
  if (left === undefined) return { ok: false, problem: { kind: "not-in-rotation", tag } };
  if (turns.order.length <= 1) return { ok: false, problem: { kind: "last-alliance" } };
  const follower = following(turns.order, left);
  const order = turns.order.filter((candidate) => candidate !== left);
  let { next, expected } = turns;
  if (expected !== undefined && sameTag(expected, left)) expected = follower;
  if (next !== undefined && sameTag(next, left)) next = follower;
  if (expected === undefined && next === undefined && turns.holding !== undefined && sameTag(turns.holding, left)) {
    next = follower;
  }
  return { ok: true, turns: { ...turns, order, next, expected }, left };
}
