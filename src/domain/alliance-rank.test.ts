import { describe, expect, test } from "vitest";
import { rankFromLabel, rankFromRoster, sortRoster } from "./alliance-rank.js";
import { parseUid, type Uid } from "./lookup-input.js";
import type { AllianceRank, RosterEntry } from "./player.js";

const PLAYER_UID = "145563254785";
const OTHER_UID = "300000000000000002";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function entry(name: string, allianceRank: AllianceRank, digits: string): RosterEntry {
  return { uid: uidOf(digits), name, allianceRank };
}

describe("rankFromRoster", () => {
  test.each([
    ["R1", "R1"],
    ["R2", "R2"],
    ["R3", "R3"],
    ["R4", "R4"],
    ["R5", "R5"],
  ] as const)("gives %s for a Player whose roster row says %s", (label, expected) => {
    const roster = [
      { uid: OTHER_UID, rankLabel: null },
      { uid: PLAYER_UID, rankLabel: label },
    ];

    expect(rankFromRoster(PLAYER_UID, roster)).toBe(expected);
  });

  test("reads only the row of the given Player", () => {
    const roster = [
      { uid: OTHER_UID, rankLabel: "R1" },
      { uid: PLAYER_UID, rankLabel: "R4" },
    ];

    expect(rankFromRoster(PLAYER_UID, roster)).toBe("R4");
  });

  test("gives unknown when the Player has no row in the roster", () => {
    const roster = [{ uid: OTHER_UID, rankLabel: "R2" }];

    expect(rankFromRoster(PLAYER_UID, roster)).toBe("unknown");
  });

  test("gives unknown when the row's rank label is null", () => {
    const roster = [{ uid: PLAYER_UID, rankLabel: null }];

    expect(rankFromRoster(PLAYER_UID, roster)).toBe("unknown");
  });

  test.each(["R6", "R0", "leader"])("gives unknown for the rank label %s, which is not R1–R5", (rankLabel) => {
    const roster = [{ uid: PLAYER_UID, rankLabel }];

    expect(rankFromRoster(PLAYER_UID, roster)).toBe("unknown");
  });
});

describe("rankFromLabel", () => {
  test.each([
    ["R1", "R1"],
    ["R2", "R2"],
    ["R3", "R3"],
    ["R4", "R4"],
    ["R5", "R5"],
  ] as const)("maps the label %s to %s", (label, expected) => {
    expect(rankFromLabel(label)).toBe(expected);
  });

  test("maps a missing label (null) to unknown", () => {
    expect(rankFromLabel(null)).toBe("unknown");
  });

  test.each(["R6", "R0", "leader", ""])("maps the label %j, which is not R1–R5, to unknown", (label) => {
    expect(rankFromLabel(label)).toBe("unknown");
  });
});

describe("sortRoster", () => {
  test("orders R5, R4, R3, R2, R1, then unknown, whatever the input order", () => {
    const roster = [
      entry("Ann", "R1", "100000000000000001"),
      entry("Ben", "unknown", "100000000000000002"),
      entry("Cy", "R3", "100000000000000003"),
      entry("Dee", "R5", "100000000000000004"),
      entry("Eve", "R2", "100000000000000005"),
      entry("Fox", "R4", "100000000000000006"),
    ];

    expect(sortRoster(roster).map((row) => row.name)).toEqual(["Dee", "Fox", "Cy", "Eve", "Ann", "Ben"]);
  });

  test("orders players of one rank by name, ignoring letter case", () => {
    const roster = [
      entry("carol", "R2", "100000000000000001"),
      entry("Bob", "R2", "100000000000000002"),
      entry("alice", "R2", "100000000000000003"),
    ];

    expect(sortRoster(roster).map((row) => row.name)).toEqual(["alice", "Bob", "carol"]);
  });

  test("breaks a tie in name by uid", () => {
    const roster = [entry("Sam", "R1", "300000000000000002"), entry("Sam", "R1", "100000000000000001")];

    expect(sortRoster(roster).map((row) => row.uid)).toEqual(["100000000000000001", "300000000000000002"]);
  });

  test("returns a new array and leaves the input in its original order", () => {
    const roster = [entry("Ann", "R1", "100000000000000001"), entry("Dee", "R5", "100000000000000004")];

    const sorted = sortRoster(roster);

    expect(sorted).not.toBe(roster);
    expect(roster.map((row) => row.name)).toEqual(["Ann", "Dee"]);
  });
});
