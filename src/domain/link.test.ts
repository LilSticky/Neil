import { describe, expect, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "./lookup-input.js";
import { needsRankApproval, rankOnLink } from "./link.js";
import type { AllianceRank, Player } from "./player.js";

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

const PLAYER_UID = uidOf("145563254785");

/** A Player in an Alliance, with the Alliance Rank the Game API gave (or unknown). */
function playerInAlliance(allianceRank: AllianceRank): Player {
  return {
    uid: PLAYER_UID,
    name: "Tester",
    kingdom: kingdomOf(330),
    power: 1_000_000,
    sanctuaryLevel: 10,
    alliance: { tag: "ABC", name: "Alpha" },
    allianceRank,
  };
}

/** A Player in no Alliance: there is no Alliance Rank to find. */
function playerWithoutAlliance(): Player {
  return {
    uid: PLAYER_UID,
    name: "Tester",
    kingdom: kingdomOf(330),
    power: 1_000_000,
    sanctuaryLevel: 10,
    alliance: undefined,
    allianceRank: undefined,
  };
}

describe("rankOnLink", () => {
  test.each(["R1", "R2", "R3", "R4", "R5"] as const)(
    "gives the Game API's Alliance Rank %s for a Player in an Alliance with that rank",
    (rank) => {
      expect(rankOnLink(playerInAlliance(rank))).toEqual({ source: "game-api", rank });
    },
  );

  test("gives unknown when the Player is in an Alliance and the Game API lists no rank", () => {
    expect(rankOnLink(playerInAlliance("unknown"))).toEqual({ source: "unknown" });
  });

  test("gives no-alliance when the Player is in no Alliance", () => {
    expect(rankOnLink(playerWithoutAlliance())).toEqual({ source: "no-alliance" });
  });
});

describe("needsRankApproval", () => {
  test("is true only when the Link's rank is unknown", () => {
    expect(needsRankApproval(rankOnLink(playerInAlliance("unknown")))).toBe(true);
  });

  test.each(["R1", "R5"] as const)("is false when the Game API gave the rank %s", (rank) => {
    expect(needsRankApproval(rankOnLink(playerInAlliance(rank)))).toBe(false);
  });

  test("is false when the Player is in no Alliance", () => {
    expect(needsRankApproval(rankOnLink(playerWithoutAlliance()))).toBe(false);
  });
});
