import { describe, expect, test } from "vitest";
import { distance, exileReasonOf, mayChangeReaper, rankExiles, type Exile, type ExileReason, type Position } from "./exile.js";
import type { Uid } from "./lookup-input.js";
import type { Player, PlayerDetails } from "./player.js";
import { approvedRank, gameApiRank, kingdomOf, uidOf } from "./__fixtures__/players.js";

const HOME = kingdomOf(330);
const OTHER = kingdomOf(331);
const CALLER = uidOf("100000000000");
const ORIGIN: Position = { x: 0, y: 0 };
const STORED_AT = new Date("2026-11-01T10:00:00Z");
const ADDED_AT = new Date("2026-10-20T10:00:00Z");
const EARLIER_ADDED_AT = new Date("2026-10-10T10:00:00Z");

function reasonOf(text: string): ExileReason {
  const parsed = exileReasonOf(text);
  if (!parsed.ok) throw new Error(`the test reason "${text}" is not a valid reason`);
  return parsed.value;
}

/** An Exile as REAPER stores it; its position, when given, was read at STORED_AT. */
function exileOf(uid: string, options: { kingdom?: number; position?: Position; addedAt?: Date } = {}): Exile {
  return {
    uid: uidOf(uid),
    name: `Exile ${uid}`,
    kingdom: kingdomOf(options.kingdom ?? 330),
    lastPosition: options.position === undefined ? undefined : { position: options.position, at: STORED_AT },
    reason: reasonOf("Harassed the Kingdom"),
    addedAt: options.addedAt ?? ADDED_AT,
    addedBy: "member-r5",
  };
}

/** A Player as the Game API read it now; the details carry the position and the shield reading. */
function playerRead(
  uid: Uid,
  options: { readonly kingdom?: number; readonly location?: Position | undefined; readonly shielded?: boolean | undefined },
): Player {
  const details: PlayerDetails = {
    kills: undefined,
    vipLevel: undefined,
    likes: undefined,
    lastOnlineAt: undefined,
    language: undefined,
    location: options.location,
    avatarPath: undefined,
    kingdomBadgePath: undefined,
    shielded: options.shielded,
  };
  return {
    uid,
    name: "Read name",
    kingdom: kingdomOf(options.kingdom ?? 330),
    might: 1_000_000,
    sanctuaryLevel: 10,
    alliance: undefined,
    allianceRank: undefined,
    details,
  };
}

/** A candidate with only its stored position: the Exile could not be read now. */
function stored(exile: Exile) {
  return { exile, player: undefined };
}

/** A candidate with a fresh read of the Exile. */
function fresh(exile: Exile, options: { readonly kingdom?: number; readonly location?: Position | undefined; readonly shielded?: boolean | undefined } = {}) {
  return { exile, player: playerRead(exile.uid, options) };
}

describe("exileReasonOf", () => {
  test("trims the surrounding whitespace of a reason", () => {
    expect(exileReasonOf("  Harassed the Kingdom  ")).toEqual({ ok: true, value: "Harassed the Kingdom" });
  });

  test("refuses a reason that is only whitespace", () => {
    expect(exileReasonOf("   ").ok).toBe(false);
  });

  test("accepts a reason of exactly 200 characters", () => {
    const text = "a".repeat(200);

    expect(exileReasonOf(text)).toEqual({ ok: true, value: text });
  });

  test("refuses a reason of 201 characters", () => {
    expect(exileReasonOf("a".repeat(201)).ok).toBe(false);
  });
});

describe("mayChangeReaper", () => {
  test("allows an R5 the Game API reports in the Home Kingdom", () => {
    expect(mayChangeReaper({ allianceRank: gameApiRank("R5"), allianceKingdom: HOME }, HOME)).toBe(true);
  });

  test("allows an R5 approved by hand in the Home Kingdom", () => {
    expect(mayChangeReaper({ allianceRank: approvedRank("R5"), allianceKingdom: HOME }, HOME)).toBe(true);
  });

  test.each(["R1", "R2", "R3", "R4"] as const)("refuses a %s in the Home Kingdom", (rank) => {
    expect(mayChangeReaper({ allianceRank: gameApiRank(rank), allianceKingdom: HOME }, HOME)).toBe(false);
  });

  test("refuses an R5 of an Alliance in another Kingdom", () => {
    expect(mayChangeReaper({ allianceRank: gameApiRank("R5"), allianceKingdom: OTHER }, HOME)).toBe(false);
  });

  test("refuses a Member whose Alliance Rank is unknown", () => {
    expect(mayChangeReaper({ allianceRank: { source: "unknown" }, allianceKingdom: HOME }, HOME)).toBe(false);
  });

  test("refuses a Member who is in no Alliance", () => {
    expect(mayChangeReaper({ allianceRank: { source: "no-alliance" }, allianceKingdom: undefined }, HOME)).toBe(false);
  });

  test("refuses an R5 whose Alliance Kingdom is not known", () => {
    expect(mayChangeReaper({ allianceRank: gameApiRank("R5"), allianceKingdom: undefined }, HOME)).toBe(false);
  });
});

describe("distance", () => {
  test("is the straight-line distance between two points", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test("is zero between a point and itself", () => {
    expect(distance({ x: 7, y: -2 }, { x: 7, y: -2 })).toBe(0);
  });
});

describe("rankExiles", () => {
  test("orders the Exiles by distance from the origin, closest first", () => {
    const far = exileOf("100000000001", { position: { x: 10, y: 0 } });
    const near = exileOf("100000000002", { position: { x: 2, y: 0 } });
    const middle = exileOf("100000000003", { position: { x: 5, y: 0 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [stored(far), stored(near), stored(middle)]);

    expect(result.ranking.map((entry) => entry.exile.uid)).toEqual([near.uid, middle.uid, far.uid]);
    expect(result.ranking.map((entry) => entry.distance)).toEqual([2, 5, 10]);
  });

  test("measures from the fresh position of a read Exile, not the stored one, and is not stale", () => {
    const exile = exileOf("100000000001", { position: { x: 100, y: 100 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [fresh(exile, { location: { x: 3, y: 4 } })]);

    expect(result.ranking.map((entry) => [entry.position, entry.distance, entry.stale])).toEqual([[{ x: 3, y: 4 }, 5, false]]);
  });

  test("falls back to the stored position, marked stale, when the read gives no position", () => {
    const exile = exileOf("100000000001", { position: { x: 3, y: 4 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [fresh(exile, { location: undefined })]);

    expect(result.ranking.map((entry) => [entry.position, entry.distance, entry.stale])).toEqual([[{ x: 3, y: 4 }, 5, true]]);
  });

  test("leaves out the caller's own Exile", () => {
    const callerExile = exileOf(CALLER, { position: { x: 1, y: 0 } });
    const other = exileOf("100000000001", { position: { x: 2, y: 0 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [stored(callerExile), stored(other)]);

    expect(result.ranking.map((entry) => entry.exile.uid)).toEqual([other.uid]);
  });

  test("leaves out an Exile stored in another Kingdom", () => {
    const elsewhere = exileOf("100000000001", { kingdom: 331, position: { x: 1, y: 0 } });
    const home = exileOf("100000000002", { position: { x: 2, y: 0 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [stored(elsewhere), stored(home)]);

    expect(result.ranking.map((entry) => entry.exile.uid)).toEqual([home.uid]);
  });

  test("leaves out an Exile that a fresh read shows in another Kingdom", () => {
    const moved = exileOf("100000000001", { position: { x: 1, y: 0 } });
    const home = exileOf("100000000002", { position: { x: 2, y: 0 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [fresh(moved, { kingdom: 331, location: { x: 1, y: 0 } }), stored(home)]);

    expect(result.ranking.map((entry) => entry.exile.uid)).toEqual([home.uid]);
  });

  test("leaves out a shielded Exile and counts it as shielded", () => {
    const shielded = exileOf("100000000001", { position: { x: 1, y: 0 } });
    const home = exileOf("100000000002", { position: { x: 2, y: 0 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [fresh(shielded, { location: { x: 1, y: 0 }, shielded: true }), stored(home)]);

    expect(result.ranking.map((entry) => entry.exile.uid)).toEqual([home.uid]);
    expect(result.leftOut.shielded).toBe(1);
  });

  test("keeps an Exile whose shield reading is unknown", () => {
    const exile = exileOf("100000000001", { position: { x: 1, y: 0 } });

    const result = rankExiles(ORIGIN, HOME, CALLER, [fresh(exile, { location: { x: 1, y: 0 }, shielded: undefined })]);

    expect(result.ranking.map((entry) => entry.exile.uid)).toEqual([exile.uid]);
  });

  test("leaves out an Exile with no position at all and counts it as unreadable", () => {
    const unplaced = exileOf("100000000001");

    const result = rankExiles(ORIGIN, HOME, CALLER, [stored(unplaced)]);

    expect(result.ranking).toEqual([]);
    expect(result.leftOut.unreadable).toBe(1);
  });

  test("orders Exiles at equal distance by the earlier date added", () => {
    const later = exileOf("100000000001", { position: { x: 3, y: 4 }, addedAt: ADDED_AT });
    const earlier = exileOf("100000000002", { position: { x: 4, y: 3 }, addedAt: EARLIER_ADDED_AT });

    const result = rankExiles(ORIGIN, HOME, CALLER, [stored(later), stored(earlier)]);

    expect(result.ranking.map((entry) => entry.exile.uid)).toEqual([earlier.uid, later.uid]);
  });
});
