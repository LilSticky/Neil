import { describe, expect, test } from "vitest";
import { nicknameFor } from "./member-name.js";
import {
  allied,
  approvedRank,
  gameApiRank,
  kingdomOf,
  NO_ALLIANCE,
  UNKNOWN_RANK,
  unallied,
} from "./__fixtures__/players.js";

const HOME_KINGDOM = kingdomOf(330);

describe("nicknameFor", () => {
  describe("Home Kingdom Players", () => {
    test.each([
      ["R1", "[NML] Rogue"],
      ["R2", "[NML] Rogue"],
      ["R3", "[NML] Rogue"],
      ["R4", "[NML|R4] Rogue"],
      ["R5", "[NML|R5] Rogue"],
    ] as const)("shows the tag, and the rank only for R4 and R5, for a Player who is %s", (rank, nickname) => {
      const player = allied({ name: "Rogue", kingdom: HOME_KINGDOM, sanctuaryLevel: 21, tag: "NML", rank });

      expect(nicknameFor(player, gameApiRank(rank), HOME_KINGDOM)).toBe(nickname);
    });

    test("shows the rank from a Rank Approval for R4", () => {
      const player = allied({ name: "Rogue", kingdom: HOME_KINGDOM, sanctuaryLevel: 21, tag: "NML", rank: "unknown" });

      expect(nicknameFor(player, approvedRank("R4"), HOME_KINGDOM)).toBe("[NML|R4] Rogue");
    });

    test("shows no rank while the Alliance Rank is unknown", () => {
      const player = allied({ name: "Rogue", kingdom: HOME_KINGDOM, sanctuaryLevel: 21, tag: "NML", rank: "unknown" });

      expect(nicknameFor(player, UNKNOWN_RANK, HOME_KINGDOM)).toBe("[NML] Rogue");
    });

    test("is the Player Name alone when the Player is in no Alliance", () => {
      const player = unallied("Rogue", HOME_KINGDOM, 21);

      expect(nicknameFor(player, NO_ALLIANCE, HOME_KINGDOM)).toBe("Rogue");
    });
  });

  describe("Guests", () => {
    test("adds the Kingdom after the Player Name, and shows R4 and R5 inside the tag", () => {
      const player = allied({ name: "Rogue", kingdom: 331, sanctuaryLevel: 21, tag: "ABC", rank: "R5" });

      expect(nicknameFor(player, gameApiRank("R5"), HOME_KINGDOM)).toBe("[ABC|R5] Rogue | #331");
    });

    test("shows the tag alone for a rank below R4", () => {
      const player = allied({ name: "Rogue", kingdom: 331, sanctuaryLevel: 21, tag: "ABC", rank: "R2" });

      expect(nicknameFor(player, gameApiRank("R2"), HOME_KINGDOM)).toBe("[ABC] Rogue | #331");
    });

    test("is the Player Name and the Kingdom when the Player is in no Alliance", () => {
      const player = unallied("Rogue", 331, 21);

      expect(nicknameFor(player, NO_ALLIANCE, HOME_KINGDOM)).toBe("Rogue | #331");
    });
  });

  describe("length", () => {
    test("is cut to 32 characters by cutting the Player Name, keeping the tag and rank", () => {
      const player = allied({ name: "A".repeat(40), kingdom: HOME_KINGDOM, sanctuaryLevel: 21, tag: "NML", rank: "R4" });

      expect(nicknameFor(player, gameApiRank("R4"), HOME_KINGDOM)).toBe(`[NML|R4] ${"A".repeat(23)}`);
    });

    test("keeps a Player Name that fits exactly in 32 characters whole", () => {
      const player = allied({ name: "C".repeat(23), kingdom: HOME_KINGDOM, sanctuaryLevel: 21, tag: "NML", rank: "R4" });

      expect(nicknameFor(player, gameApiRank("R4"), HOME_KINGDOM)).toBe(`[NML|R4] ${"C".repeat(23)}`);
    });

    test("keeps a Guest's tag, rank and Kingdom whole when cutting", () => {
      const player = allied({ name: "B".repeat(40), kingdom: 331, sanctuaryLevel: 21, tag: "ABC", rank: "R5" });

      expect(nicknameFor(player, gameApiRank("R5"), HOME_KINGDOM)).toBe(`[ABC|R5] ${"B".repeat(16)} | #331`);
    });
  });

  describe("Player Name", () => {
    test("is undefined when the Player Name is empty, so the nickname is not changed", () => {
      const player = unallied("", HOME_KINGDOM, 21);

      expect(nicknameFor(player, NO_ALLIANCE, HOME_KINGDOM)).toBeUndefined();
    });
  });
});
