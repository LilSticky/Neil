import { describe, expect, expectTypeOf, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "./lookup-input.js";
import { needsRankApproval, officerRank, rankOnLink, type Link, type RankOnLink } from "./link.js";
import type { AllianceRank, Player } from "./player.js";
import type { MemberId } from "./rank-approval.js";

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
const MEMBER: MemberId = "member-linked";
const OFFICER: MemberId = "member-officer";
const OTHER_OFFICER: MemberId = "member-earlier-officer";
const NOW = new Date("2026-11-02T10:00:00Z");
const EARLIER = new Date("2026-10-30T08:00:00Z");

/** A Player in an Alliance, with the Alliance Rank the Game API gave (or unknown). */
function playerInAlliance(allianceRank: AllianceRank): Player {
  return {
    uid: PLAYER_UID,
    name: "Tester",
    kingdom: kingdomOf(330),
    might: 1_000_000,
    sanctuaryLevel: 10,
    alliance: { tag: "ABC", name: "Alpha", leaderUid: undefined },
    allianceRank,
  };
}

/** A Player in no Alliance: there is no Alliance Rank to find. */
function playerWithoutAlliance(): Player {
  return {
    uid: PLAYER_UID,
    name: "Tester",
    kingdom: kingdomOf(330),
    might: 1_000_000,
    sanctuaryLevel: 10,
    alliance: undefined,
    allianceRank: undefined,
  };
}

/** A Link of a Member to the test Player, made from In-game Proof, carrying the given Alliance Rank. */
function linkWith(allianceRank: RankOnLink, memberId: MemberId = MEMBER): Link {
  return {
    memberId,
    uid: PLAYER_UID,
    linkedAt: EARLIER,
    allianceRank,
    madeBy: { kind: "in-game-proof" },
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

describe("Link.madeBy", () => {
  test("records an In-game Proof Link as made by In-game Proof", () => {
    const link = linkWith({ source: "unknown" });
    expect(link.madeBy).toEqual({ kind: "in-game-proof" });
  });

  test("records an Officer Link with the Officer who made it", () => {
    const link: Link = {
      memberId: MEMBER,
      uid: PLAYER_UID,
      linkedAt: NOW,
      allianceRank: { source: "unknown" },
      madeBy: { kind: "officer-link", officerId: OFFICER },
    };
    expect(link.madeBy).toEqual({ kind: "officer-link", officerId: OFFICER });
    expectTypeOf<Link["madeBy"]>().toEqualTypeOf<
      { readonly kind: "in-game-proof" } | { readonly kind: "officer-link"; readonly officerId: MemberId }
    >();
  });
});

describe("officerRank", () => {
  test("gives a Rank Approval by the Officer when the Link's rank is unknown", () => {
    const result = officerRank(linkWith({ source: "unknown" }), "R4", OFFICER, NOW);
    expect(result).toEqual({
      ok: true,
      allianceRank: { source: "rank-approval", rank: "R4", approvedBy: OFFICER, approvedAt: NOW },
      gameRank: undefined,
    });
  });

  test("replaces an earlier approved rank with the Officer's rank", () => {
    const earlier: RankOnLink = {
      source: "rank-approval",
      rank: "R3",
      approvedBy: OTHER_OFFICER,
      approvedAt: EARLIER,
    };
    const result = officerRank(linkWith(earlier), "R2", OFFICER, NOW);
    expect(result).toEqual({
      ok: true,
      allianceRank: { source: "rank-approval", rank: "R2", approvedBy: OFFICER, approvedAt: NOW },
      gameRank: undefined,
    });
  });

  test("gives no game rank note when the Game API already lists the same rank", () => {
    const result = officerRank(linkWith({ source: "game-api", rank: "R4" }), "R4", OFFICER, NOW);
    expect(result).toEqual({
      ok: true,
      allianceRank: { source: "rank-approval", rank: "R4", approvedBy: OFFICER, approvedAt: NOW },
      gameRank: undefined,
    });
  });

  test("gives the Game API's rank as gameRank when the Officer gives a different rank", () => {
    const result = officerRank(linkWith({ source: "game-api", rank: "R3" }), "R2", OFFICER, NOW);
    expect(result).toEqual({
      ok: true,
      allianceRank: { source: "rank-approval", rank: "R2", approvedBy: OFFICER, approvedAt: NOW },
      gameRank: "R3",
    });
  });

  test("refuses the Officer's own Link with own-link", () => {
    const result = officerRank(linkWith({ source: "unknown" }, OFFICER), "R4", OFFICER, NOW);
    expect(result).toEqual({ ok: false, reason: "own-link" });
  });

  test("refuses a Link of a Player in no Alliance with no-alliance", () => {
    const result = officerRank(linkWith({ source: "no-alliance" }), "R4", OFFICER, NOW);
    expect(result).toEqual({ ok: false, reason: "no-alliance" });
  });
});
