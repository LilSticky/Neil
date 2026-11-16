import { describe, expect, test } from "vitest";
import { availabilityTotals, type AvailabilityCounts } from "../domain/availability.js";
import { newRaid } from "../domain/raid.js";
import {
  classButtonId,
  parseAvailabilityButton,
  pollCard,
  pollRows,
  summaryCard,
  availableButtonId,
  notAvailableButtonId,
} from "./availability-texts.js";
import { fitsDiscord } from "./raid-texts.js";

const RAID = newRaid("2026-11-21", new Date("2026-11-21T22:00:00.000Z"));
const COUNTS: AvailabilityCounts = { whale: 2, dolphin: 3, seal: 4, strategy: 9, smallFry: 5, notAvailable: 1 };

describe("Availability Poll button ids", () => {
  test("name the Raid and the tag, and read back", () => {
    expect(availableButtonId("2026-11-21", "NML")).toBe("avail:yes:2026-11-21:NML");
    expect(parseAvailabilityButton(availableButtonId("2026-11-21", "NML"))).toEqual({ kind: "available", raidId: "2026-11-21", tag: "NML" });
    expect(parseAvailabilityButton(notAvailableButtonId("2026-11-21", "A:B"))).toEqual({
      kind: "not-available",
      raidId: "2026-11-21",
      tag: "A:B",
    });
    expect(parseAvailabilityButton(classButtonId("small-fry", "2026-11-21", "NML"))).toEqual({
      kind: "class",
      fighterClass: "small-fry",
      raidId: "2026-11-21",
      tag: "NML",
    });
  });

  test.each(["avail:maybe:2026-11-21:NML", "avail:class:shark:2026-11-21:NML", "avail:yes:21-11-2026:NML", "avail:yes:2026-11-21:", "raid:confirm:2026-11-21"])(
    "%s is no Availability Poll button",
    (customId) => {
      expect(parseAvailabilityButton(customId)).toBeUndefined();
    },
  );
});

describe("the poll card", () => {
  test("shows the counts, Small Fry apart from the Fighters, and no names", () => {
    const card = pollCard(RAID, "NML", COUNTS, "open");

    expect(card.title).toBe("Availability Poll [NML]");
    expect(card.fields?.[0]?.value).toBe(
      "Whales: 2\nDolphins: 3\nSeals: 4\n**Fighters (Whales, Dolphins, Seals): 9**\nSmall Fry (counted apart): 5\nNot available: 1",
    );
    expect(card.description).toContain("until the Raid starts");
    expect(JSON.stringify(card)).not.toMatch(/<@/);
  });

  test("closed cards have no buttons and say why", () => {
    expect(pollRows(RAID.id, "NML", "started")).toEqual([]);
    expect(pollRows(RAID.id, "NML", "open")[0]?.components).toHaveLength(2);
    expect(pollCard(RAID, "NML", COUNTS, "started").description).toContain("final numbers");
    expect(pollCard(RAID, "NML", COUNTS, "cancelled").description).toContain("**Cancelled**");
  });
});

describe("the Availability Summary", () => {
  test("lists each Alliance and the Kingdom total", () => {
    const totals = availabilityTotals(
      [
        { memberId: "1", tag: "NML", availability: { kind: "available", fighterClass: "whale" } },
        { memberId: "2", tag: "ABC", availability: { kind: "available", fighterClass: "small-fry" } },
      ],
      ["ABC", "NML"],
    );
    const card = summaryCard(RAID, totals, "open");

    expect(card.title).toBe("Availability Summary");
    expect(card.description).toContain("[ABC] Whales 0 · Dolphins 0 · Seals 0 · **Fighters 0** · Small Fry 1 · Not available 0");
    expect(card.description).toContain("[NML] Whales 1 · Dolphins 0 · Seals 0 · **Fighters 1** · Small Fry 0 · Not available 0");
    expect(card.fields?.[0]).toEqual({
      name: "Kingdom total",
      value: "Whales: 1\nDolphins: 0\nSeals: 0\n**Fighters (Whales, Dolphins, Seals): 1**\nSmall Fry (counted apart): 1\nNot available: 0",
    });
  });

  test("fits Discord's embed limits with forty Alliances of large counts", () => {
    const tags = Array.from({ length: 40 }, (_, index) => `T${index.toString().padStart(4, "0")}`);
    const totals = { alliances: tags.map((tag) => ({ tag, counts: { ...COUNTS, whale: 100, strategy: 107 } })), kingdom: COUNTS };

    expect(fitsDiscord(summaryCard(RAID, totals, "open"))).toBe(true);
  });
});
