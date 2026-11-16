import { describe, expect, test } from "vitest";
import {
  cityRotationOf,
  lastRoyalCitySiege,
  mayEditCityRotation,
  nextHoldingAlliance,
  nextRoyalCitySiege,
  type SiegeTime,
} from "./city-rotation.js";
import type { Editor } from "./exile.js";
import { kingdomOf } from "./__fixtures__/players.js";

/** 18:00 Server Time is 20:00 UTC. */
const SIEGE: SiegeTime = { hour: 18, minute: 0 };
/** Friday 2026-11-20 at 18:00 Server Time. */
const FRIDAY_SIEGE = new Date("2026-11-20T20:00:00Z");
const WEEK_MS = 7 * 24 * 3_600_000;

describe("nextRoyalCitySiege", () => {
  test("is the coming Friday at the siege time in Server Time", () => {
    expect(nextRoyalCitySiege(new Date("2026-11-16T10:00:00Z"), SIEGE)).toEqual(FRIDAY_SIEGE);
  });

  test("is this Friday's siege a minute before it", () => {
    expect(nextRoyalCitySiege(new Date("2026-11-20T19:59:00Z"), SIEGE)).toEqual(FRIDAY_SIEGE);
  });

  test("is next week's siege at the moment of the siege and just after it", () => {
    const nextWeek = new Date(FRIDAY_SIEGE.getTime() + WEEK_MS);
    expect(nextRoyalCitySiege(FRIDAY_SIEGE, SIEGE)).toEqual(nextWeek);
    expect(nextRoyalCitySiege(new Date("2026-11-20T20:01:00Z"), SIEGE)).toEqual(nextWeek);
  });

  test("counts the weekday in Server Time across the UTC date line", () => {
    // 23:30 Server Time on Friday is 01:30 UTC on Saturday.
    const late: SiegeTime = { hour: 23, minute: 30 };
    const siege = new Date("2026-11-21T01:30:00Z");

    expect(nextRoyalCitySiege(new Date("2026-11-21T01:00:00Z"), late)).toEqual(siege);
    expect(lastRoyalCitySiege(new Date("2026-11-21T02:00:00Z"), late)).toEqual(siege);
  });

  test("counts the weekday in Server Time when Server Time is still Thursday", () => {
    // 01:00 UTC on Friday is 23:00 Server Time on Thursday; an early siege at 00:30 Server Time is 02:30 UTC Friday.
    const early: SiegeTime = { hour: 0, minute: 30 };

    expect(nextRoyalCitySiege(new Date("2026-11-20T01:00:00Z"), early)).toEqual(new Date("2026-11-20T02:30:00Z"));
  });

  test("on a Saturday is the next week's Friday", () => {
    expect(nextRoyalCitySiege(new Date("2026-11-21T12:00:00Z"), SIEGE)).toEqual(new Date(FRIDAY_SIEGE.getTime() + WEEK_MS));
  });
});

describe("lastRoyalCitySiege", () => {
  test("is the siege itself at its moment", () => {
    expect(lastRoyalCitySiege(FRIDAY_SIEGE, SIEGE)).toEqual(FRIDAY_SIEGE);
  });

  test("is last week's siege a minute before this one", () => {
    expect(lastRoyalCitySiege(new Date("2026-11-20T19:59:00Z"), SIEGE)).toEqual(new Date(FRIDAY_SIEGE.getTime() - WEEK_MS));
  });

  test("is this Friday's siege on the following days", () => {
    expect(lastRoyalCitySiege(new Date("2026-11-23T08:00:00Z"), SIEGE)).toEqual(FRIDAY_SIEGE);
  });
});

describe("cityRotationOf", () => {
  test("takes the first tag as the Holding Alliance when none is named", () => {
    expect(cityRotationOf(["NML", "ABC", "XYZ"])).toEqual({ ok: true, rotation: { order: ["NML", "ABC", "XYZ"], holding: "NML" } });
  });

  test("takes the named holder, ignoring letter case, spelled as in the order", () => {
    expect(cityRotationOf(["NML", "ABC"], "abc")).toEqual({ ok: true, rotation: { order: ["NML", "ABC"], holding: "ABC" } });
  });

  test("refuses a single tag and more than ten", () => {
    expect(cityRotationOf(["NML"])).toEqual({ ok: false, problem: { kind: "too-short" } });
    const eleven = Array.from({ length: 11 }, (_, index) => `T${index.toString()}`);
    expect(cityRotationOf(eleven)).toEqual({ ok: false, problem: { kind: "too-long" } });
  });

  test("accepts ten tags", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `T${index.toString()}`);
    expect(cityRotationOf(ten).ok).toBe(true);
  });

  test("refuses a duplicate, ignoring letter case", () => {
    expect(cityRotationOf(["NML", "ABC", "nml"])).toEqual({ ok: false, problem: { kind: "duplicate", tag: "nml" } });
  });

  test("refuses a holder that is not in the order", () => {
    expect(cityRotationOf(["NML", "ABC"], "XYZ")).toEqual({ ok: false, problem: { kind: "holder-not-in-order", tag: "XYZ" } });
  });
});

describe("nextHoldingAlliance", () => {
  test("is the tag after the holder", () => {
    expect(nextHoldingAlliance({ order: ["NML", "ABC", "XYZ"], holding: "ABC" })).toBe("XYZ");
  });

  test("wraps to the first tag after the last", () => {
    expect(nextHoldingAlliance({ order: ["NML", "ABC", "XYZ"], holding: "XYZ" })).toBe("NML");
  });
});

describe("mayEditCityRotation", () => {
  const HOME = kingdomOf(330);
  const current: readonly string[] = ["NML", "ABC"];
  const r5 = (tag: string, kingdom = 330): Editor => ({
    allianceRank: { source: "game-api", rank: "R5" },
    allianceKingdom: kingdomOf(kingdom),
    allianceTag: tag,
  });

  test("lets an R5 of an Alliance in the current order edit it", () => {
    expect(mayEditCityRotation(r5("abc"), HOME, current, ["XYZ", "QQQ"])).toBe(true);
  });

  test("refuses an R5 of an Alliance outside the current order, even when the new order names it", () => {
    expect(mayEditCityRotation(r5("XYZ"), HOME, current, ["XYZ", "NML"])).toBe(false);
  });

  test("lets an R5 of an Alliance in the new order set the first one", () => {
    expect(mayEditCityRotation(r5("XYZ"), HOME, undefined, ["XYZ", "NML"])).toBe(true);
    expect(mayEditCityRotation(r5("QQQ"), HOME, undefined, ["XYZ", "NML"])).toBe(false);
  });

  test("accepts an R5 from a Rank Approval", () => {
    const editor: Editor = {
      allianceRank: { source: "rank-approval", rank: "R5", approvedBy: "1", approvedAt: new Date(0) },
      allianceKingdom: HOME,
      allianceTag: "NML",
    };
    expect(mayEditCityRotation(editor, HOME, current, [])).toBe(true);
  });

  test("refuses an R4, another Kingdom, and a Member without a recorded Alliance", () => {
    expect(mayEditCityRotation({ ...r5("NML"), allianceRank: { source: "game-api", rank: "R4" } }, HOME, current, [])).toBe(false);
    expect(mayEditCityRotation(r5("NML", 331), HOME, current, [])).toBe(false);
    expect(mayEditCityRotation({ ...r5("NML"), allianceTag: undefined }, HOME, current, [])).toBe(false);
  });
});
