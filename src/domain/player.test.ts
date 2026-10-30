import { describe, expect, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "./lookup-input.js";
import {
  orderMatches,
  pickableAllianceMatch,
  pickablePlayerMatch,
  type Alliance,
  type LookupResult,
  type Match,
  type RosterEntry,
} from "./player.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${String(number)} is not a valid Kingdom`);
  return parsed.value;
}

/** A Player match as the Game lists it in an ambiguous answer. */
function playerMatch(name: string, kingdom: number, uid: string): Match {
  return { uid, name, kingdom };
}

describe("pickablePlayerMatch", () => {
  test("is true for a match with a uid and a Kingdom", () => {
    expect(pickablePlayerMatch({ uid: "145563254785", name: "DrLol", kingdom: 330 })).toBe(true);
  });

  test("is false for a match without a uid, which cannot be looked up", () => {
    expect(pickablePlayerMatch({ name: "DrLol", kingdom: 330 })).toBe(false);
  });

  test("is false for a match without a Kingdom, which cannot be told apart", () => {
    expect(pickablePlayerMatch({ uid: "145563254785", name: "DrLol" })).toBe(false);
  });
});

describe("pickableAllianceMatch", () => {
  test("is true for a match with a tag and a Kingdom", () => {
    expect(pickableAllianceMatch({ tag: "NML", name: "No Man's Land", kingdom: 330 })).toBe(true);
  });

  test("is false for a match without a tag, which cannot be looked up", () => {
    expect(pickableAllianceMatch({ name: "No Man's Land", kingdom: 330 })).toBe(false);
  });

  test("is false for a match without a Kingdom, which cannot be told apart", () => {
    expect(pickableAllianceMatch({ tag: "NML", name: "No Man's Land" })).toBe(false);
  });
});

describe("orderMatches", () => {
  test("orders by Kingdom, then by name, and lists them all when there are few", () => {
    const matches = [
      playerMatch("Carol", 330, "100000000000000003"),
      playerMatch("Bob", 12, "100000000000000002"),
      playerMatch("Alice", 330, "100000000000000001"),
    ];

    const { listed, leftOut } = orderMatches(matches);

    expect(listed.map((match) => match.name)).toEqual(["Bob", "Alice", "Carol"]);
    expect(leftOut).toBe(0);
  });

  test("lists exactly 25 without leaving any out", () => {
    const matches = Array.from({ length: 25 }, (_value, i) =>
      playerMatch(`Player ${String(i).padStart(2, "0")}`, 1, `10000000000000000${String(i).padStart(2, "0")}`),
    );

    const { listed, leftOut } = orderMatches(matches);

    expect(listed).toHaveLength(25);
    expect(leftOut).toBe(0);
  });

  test("keeps the first 25 in order and counts the 2 left out of 27", () => {
    const matches = Array.from({ length: 27 }, (_value, i) =>
      playerMatch(`Player ${String(i).padStart(2, "0")}`, 1, `10000000000000000${String(i).padStart(2, "0")}`),
    );

    const { listed, leftOut } = orderMatches(matches);

    expect(listed).toHaveLength(25);
    expect(listed.at(-1)?.name).toBe("Player 24");
    expect(leftOut).toBe(2);
  });

  test("orders Alliance matches by Kingdom as well, so Kingdom 12 comes before Kingdom 330", () => {
    const matches: Match[] = [
      { tag: "NML", name: "Zeta", kingdom: 330 },
      { tag: "ABC", name: "Alpha", kingdom: 12 },
    ];

    const { listed } = orderMatches(matches);

    expect(listed.map((match) => match.kingdom)).toEqual([12, 330]);
  });

  test("leaves the input in its original order", () => {
    const matches = [playerMatch("Carol", 330, "100000000000000003"), playerMatch("Bob", 12, "100000000000000002")];

    orderMatches(matches);

    expect(matches.map((match) => match.name)).toEqual(["Carol", "Bob"]);
  });
});

describe("Alliance and RosterEntry", () => {
  test("an Alliance carries its roster, which may be empty", () => {
    const alliance: Alliance = {
      tag: "NML",
      name: "No Man's Land",
      kingdom: kingdomOf(330),
      power: 1_000_000,
      memberCount: 0,
      capacity: 100,
      leaderName: undefined,
      roster: [],
    };

    expect(alliance.roster).toEqual([]);
  });

  test("a roster row holds the uid, the name and the Alliance Rank of one Player", () => {
    const row: RosterEntry = { uid: uidOf("145563254785"), name: "DrLol", allianceRank: "R4" };
    const alliance: Alliance = {
      tag: "NML",
      name: "No Man's Land",
      kingdom: kingdomOf(330),
      power: 1_000_000,
      memberCount: 1,
      capacity: 100,
      leaderName: "DrLol",
      roster: [row],
    };

    expect(alliance.roster).toEqual([{ uid: "145563254785", name: "DrLol", allianceRank: "R4" }]);
  });
});

describe("LookupResult reserve-kept", () => {
  test("carries when lookups work again, as resetsAt", () => {
    const resetsAt = new Date("2026-10-31T00:00:00Z");
    const result: LookupResult<string> = { kind: "reserve-kept", resetsAt };

    expect(result).toEqual({ kind: "reserve-kept", resetsAt: new Date("2026-10-31T00:00:00Z") });
  });
});
