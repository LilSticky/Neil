import { describe, expect, test } from "vitest";
import {
  answerRefusal,
  availabilityTotals,
  countsOf,
  pollOpensAt,
  pollStep,
  suggestFighterClass,
  type AvailabilityAnswer,
  type FighterClassThresholds,
} from "./availability.js";
import { cancel, newRaid } from "./raid.js";

const THRESHOLDS: FighterClassThresholds = {
  whale: { bracket: "T10", might: 150_000_000 },
  dolphin: { bracket: "T9", might: 60_000_000 },
  seal: { bracket: "T7", might: 20_000_000 },
};

const START = new Date("2026-11-21T22:00:00.000Z");
const RAID = newRaid("2026-11-21", START);
const HOUR = 3_600_000;

describe("suggestFighterClass", () => {
  test("T9 with 10,000,000 Might suggests Dolphin: the Troop Bracket alone reaches it", () => {
    expect(suggestFighterClass("T9", 10_000_000, THRESHOLDS)).toBe("dolphin");
  });

  test("T6 with 200,000,000 Might suggests Whale: the Might alone reaches it", () => {
    expect(suggestFighterClass("T6", 200_000_000, THRESHOLDS)).toBe("whale");
  });

  test("exactly 20,000,000 Might and no Troop Bracket suggests Seal: at a threshold the class is reached", () => {
    expect(suggestFighterClass(undefined, 20_000_000, THRESHOLDS)).toBe("seal");
  });

  test("an unknown Troop Bracket and Might suggest Small Fry", () => {
    expect(suggestFighterClass(undefined, undefined, THRESHOLDS)).toBe("small-fry");
  });

  test("below every threshold is Small Fry; T10 compares above T9", () => {
    expect(suggestFighterClass("T6", 19_999_999, THRESHOLDS)).toBe("small-fry");
    expect(suggestFighterClass("T10", undefined, THRESHOLDS)).toBe("whale");
    expect(suggestFighterClass("T7", 60_000_000, THRESHOLDS)).toBe("dolphin");
  });
});

describe("the poll's clock steps", () => {
  test("opens 72 hours before the start", () => {
    expect(pollOpensAt(RAID)).toEqual(new Date(START.getTime() - 72 * HOUR));
  });

  test("not opened: nothing before the opening, open from it until the start, nothing at the start", () => {
    const opens = pollOpensAt(RAID).getTime();
    expect(pollStep(RAID, { kind: "not-opened" }, new Date(opens - 1))).toEqual({ kind: "none" });
    expect(pollStep(RAID, { kind: "not-opened" }, new Date(opens))).toEqual({ kind: "open" });
    expect(pollStep(RAID, { kind: "not-opened" }, new Date(START.getTime() - 1))).toEqual({ kind: "open" });
    expect(pollStep(RAID, { kind: "not-opened" }, START)).toEqual({ kind: "none" });
  });

  test("a Raid cancelled before the opening gets no poll", () => {
    const cancelled = cancel(RAID, new Date(START.getTime() - 100 * HOUR));
    if (!cancelled.ok) throw new Error("not cancelled");
    expect(pollStep(cancelled.raid, { kind: "not-opened" }, new Date(START.getTime() - 10 * HOUR))).toEqual({ kind: "none" });
  });

  test("an open poll closes at the start, or as cancelled when the Raid is cancelled; a closed poll stays closed", () => {
    expect(pollStep(RAID, { kind: "open" }, new Date(START.getTime() - 1))).toEqual({ kind: "none" });
    expect(pollStep(RAID, { kind: "open" }, START)).toEqual({ kind: "close", reason: "started" });
    const cancelled = cancel(RAID, new Date(START.getTime() - 10 * HOUR));
    if (!cancelled.ok) throw new Error("not cancelled");
    expect(pollStep(cancelled.raid, { kind: "open" }, new Date(START.getTime() - 5 * HOUR))).toEqual({ kind: "close", reason: "cancelled" });
    expect(pollStep(RAID, { kind: "closed", reason: "started" }, START)).toEqual({ kind: "none" });
  });

  test("answers are taken only while the poll is open and before the start", () => {
    const before = new Date(START.getTime() - HOUR);
    expect(answerRefusal(RAID, { kind: "open" }, before)).toBeUndefined();
    expect(answerRefusal(RAID, { kind: "open" }, START)).toBe("closed");
    expect(answerRefusal(RAID, { kind: "closed", reason: "started" }, before)).toBe("closed");
    expect(answerRefusal(RAID, { kind: "closed", reason: "cancelled" }, before)).toBe("cancelled");
    expect(answerRefusal(RAID, { kind: "not-opened" }, before)).toBe("not-opened");
    const cancelled = cancel(RAID, before);
    if (!cancelled.ok) throw new Error("not cancelled");
    expect(answerRefusal(cancelled.raid, { kind: "open" }, before)).toBe("cancelled");
  });
});

describe("availabilityTotals", () => {
  const answers: AvailabilityAnswer[] = [
    { memberId: "1", tag: "NML", availability: { kind: "available", fighterClass: "whale" } },
    { memberId: "2", tag: "NML", availability: { kind: "available", fighterClass: "dolphin" } },
    { memberId: "3", tag: "NML", availability: { kind: "available", fighterClass: "small-fry" } },
    { memberId: "4", tag: "NML", availability: { kind: "not-available" } },
    { memberId: "5", tag: "ABC", availability: { kind: "available", fighterClass: "seal" } },
    { memberId: "6", tag: "ABC", availability: { kind: "available", fighterClass: "seal" } },
    { memberId: "7", tag: "ABC", availability: { kind: "available", fighterClass: "small-fry" } },
  ];

  test("counts per Alliance and for the Kingdom; Small Fry apart, never in the strategy sum", () => {
    const totals = availabilityTotals(answers, ["ABC", "NML", "XYZ"]);

    expect(totals.alliances.map((alliance) => alliance.tag)).toEqual(["ABC", "NML", "XYZ"]);
    expect(countsOf(totals, "NML")).toEqual({ whale: 1, dolphin: 1, seal: 0, strategy: 2, smallFry: 1, notAvailable: 1 });
    expect(countsOf(totals, "ABC")).toEqual({ whale: 0, dolphin: 0, seal: 2, strategy: 2, smallFry: 1, notAvailable: 0 });
    expect(countsOf(totals, "XYZ")).toEqual({ whale: 0, dolphin: 0, seal: 0, strategy: 0, smallFry: 0, notAvailable: 0 });
    expect(totals.kingdom).toEqual({ whale: 1, dolphin: 1, seal: 2, strategy: 4, smallFry: 2, notAvailable: 1 });
  });

  test("an Alliance answered for but no longer a tag still shows, sorted by tag", () => {
    const totals = availabilityTotals(answers, ["XYZ"]);
    expect(totals.alliances.map((alliance) => alliance.tag)).toEqual(["ABC", "NML", "XYZ"]);
  });
});
