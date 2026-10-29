import { describe, expect, test } from "vitest";
import { rankFromRoster } from "./alliance-rank.js";

const PLAYER_UID = "145563254785";
const OTHER_UID = "300000000000000002";

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
