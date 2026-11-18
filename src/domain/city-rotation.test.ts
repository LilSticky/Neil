import { describe, expect, test } from "vitest";
import {
  cityRotationOf,
  lastRoyalCitySiege,
  leaveRotation,
  mayChangeCityRotation,
  mayEditCityRotation,
  moveAlliance,
  nextHoldingAlliance,
  nextRoyalCitySiege,
  skipTurn,
  upcomingAlliance,
  type RotationTurns,
} from "./city-rotation.js";
import type { Editor } from "./exile.js";
import type { RankOnLink } from "./link.js";
import { kingdomOf } from "./__fixtures__/players.js";

/** Friday 2026-11-20 at 12:00 Server Time, which is 14:00 UTC. */
const FRIDAY_SIEGE = new Date("2026-11-20T14:00:00Z");
const WEEK_MS = 7 * 24 * 3_600_000;

describe("nextRoyalCitySiege", () => {
  test("is the coming Friday at the siege time in Server Time", () => {
    expect(nextRoyalCitySiege(new Date("2026-11-16T10:00:00Z"))).toEqual(FRIDAY_SIEGE);
  });

  test("is this Friday's siege a minute before it", () => {
    expect(nextRoyalCitySiege(new Date("2026-11-20T13:59:00Z"))).toEqual(FRIDAY_SIEGE);
  });

  test("is next week's siege at the moment of the siege and just after it", () => {
    const nextWeek = new Date(FRIDAY_SIEGE.getTime() + WEEK_MS);
    expect(nextRoyalCitySiege(FRIDAY_SIEGE)).toEqual(nextWeek);
    expect(nextRoyalCitySiege(new Date("2026-11-20T14:01:00Z"))).toEqual(nextWeek);
  });

  test("counts the weekday in Server Time when Server Time is still Thursday", () => {
    // 01:00 UTC on Friday is 23:00 Server Time on Thursday.
    expect(nextRoyalCitySiege(new Date("2026-11-20T01:00:00Z"))).toEqual(FRIDAY_SIEGE);
  });

  test("counts the weekday in Server Time when Server Time is still Friday", () => {
    // 01:00 UTC on Saturday is 23:00 Server Time on Friday, after the siege.
    expect(nextRoyalCitySiege(new Date("2026-11-21T01:00:00Z"))).toEqual(new Date(FRIDAY_SIEGE.getTime() + WEEK_MS));
    expect(lastRoyalCitySiege(new Date("2026-11-21T01:00:00Z"))).toEqual(FRIDAY_SIEGE);
  });

  test("counts the week in Server Time when Server Time is still Sunday", () => {
    // 01:00 UTC on Monday is 23:00 Server Time on Sunday.
    expect(nextRoyalCitySiege(new Date("2026-11-23T01:00:00Z"))).toEqual(new Date(FRIDAY_SIEGE.getTime() + WEEK_MS));
    expect(lastRoyalCitySiege(new Date("2026-11-23T01:00:00Z"))).toEqual(FRIDAY_SIEGE);
  });

  test("on a Saturday is the next week's Friday", () => {
    expect(nextRoyalCitySiege(new Date("2026-11-21T12:00:00Z"))).toEqual(new Date(FRIDAY_SIEGE.getTime() + WEEK_MS));
  });
});

describe("lastRoyalCitySiege", () => {
  test("is the siege itself at its moment", () => {
    expect(lastRoyalCitySiege(FRIDAY_SIEGE)).toEqual(FRIDAY_SIEGE);
  });

  test("is last week's siege a minute before this one", () => {
    expect(lastRoyalCitySiege(new Date("2026-11-20T13:59:00Z"))).toEqual(new Date(FRIDAY_SIEGE.getTime() - WEEK_MS));
  });

  test("is this Friday's siege on the following days", () => {
    expect(lastRoyalCitySiege(new Date("2026-11-23T08:00:00Z"))).toEqual(FRIDAY_SIEGE);
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

describe("mayChangeCityRotation", () => {
  const HOME = kingdomOf(330);
  const order: readonly string[] = ["NML", "ABC"];
  const editor = (tag: string | undefined, rank: RankOnLink = { source: "game-api", rank: "R5" }, kingdom = 330): Editor => ({
    allianceRank: rank,
    allianceKingdom: kingdomOf(kingdom),
    allianceTag: tag,
  });
  const approved: RankOnLink = { source: "rank-approval", rank: "R5", approvedBy: "500000000000000005", approvedAt: new Date(0) };

  test("lets an R5 from the Game API or a Rank Approval of an Alliance in the order change it", () => {
    expect(mayChangeCityRotation(editor("nml"), HOME, order)).toBe(true);
    expect(mayChangeCityRotation(editor("ABC", approved), HOME, order)).toBe(true);
  });

  test("refuses an R4, an R5 outside the order, another Kingdom, no Alliance and a rank from elsewhere", () => {
    expect(mayChangeCityRotation(editor("NML", { source: "game-api", rank: "R4" }), HOME, order)).toBe(false);
    expect(mayChangeCityRotation(editor("XYZ"), HOME, order)).toBe(false);
    expect(mayChangeCityRotation(editor("NML", undefined, 331), HOME, order)).toBe(false);
    expect(mayChangeCityRotation(editor(undefined), HOME, order)).toBe(false);
    expect(mayChangeCityRotation(editor("NML", { source: "unknown" }), HOME, order)).toBe(false);
  });

  test("refuses everyone while the order is empty", () => {
    expect(mayChangeCityRotation(editor("NML"), HOME, [])).toBe(false);
  });
});

function turns(order: string[], holding: string | undefined, extra: Partial<RotationTurns> = {}): RotationTurns {
  return { order, holding, next: undefined, expected: undefined, ...extra };
}

describe("upcomingAlliance", () => {
  test("is the Alliance after the Holding Alliance, wrapping around", () => {
    expect(upcomingAlliance(turns(["NML", "ABC", "XYZ"], "XYZ"))).toBe("NML");
  });

  test("prefers the expected Alliance of an open Turn, then the one recorded as next", () => {
    expect(upcomingAlliance(turns(["NML", "ABC", "XYZ"], "NML", { next: "XYZ" }))).toBe("XYZ");
    expect(upcomingAlliance(turns(["NML", "ABC", "XYZ"], "NML", { next: "XYZ", expected: "ABC" }))).toBe("ABC");
  });
});

describe("moveAlliance", () => {
  test("moves an Alliance to a place; the holder stays and next follows the new order", () => {
    const result = moveAlliance(turns(["NML", "ABC", "XYZ"], "NML"), "xyz", 2);
    expect(result).toEqual({ ok: true, turns: turns(["NML", "XYZ", "ABC"], "NML") });
    if (result.ok) expect(upcomingAlliance(result.turns)).toBe("XYZ");
  });

  test("keeps an open Turn and drops a recorded next while the holder is in the order", () => {
    const result = moveAlliance(turns(["NML", "ABC", "XYZ"], "NML", { next: "XYZ", expected: "ABC" }), "NML", 3);
    expect(result).toEqual({ ok: true, turns: turns(["ABC", "XYZ", "NML"], "NML", { expected: "ABC" }) });
  });

  test("keeps the recorded next while the holder has left the order", () => {
    const result = moveAlliance(turns(["ABC", "XYZ"], "NML", { next: "ABC" }), "ABC", 2);
    expect(result).toEqual({ ok: true, turns: turns(["XYZ", "ABC"], "NML", { next: "ABC" }) });
  });

  test("refuses an Alliance outside the rotation, a place out of range and no change", () => {
    const current = turns(["NML", "ABC", "XYZ"], "NML");
    expect(moveAlliance(current, "QQQ", 1)).toEqual({ ok: false, problem: { kind: "not-in-rotation", tag: "QQQ" } });
    expect(moveAlliance(current, "ABC", 0)).toEqual({ ok: false, problem: { kind: "position-out-of-range", length: 3 } });
    expect(moveAlliance(current, "ABC", 4)).toEqual({ ok: false, problem: { kind: "position-out-of-range", length: 3 } });
    expect(moveAlliance(current, "ABC", 2)).toEqual({ ok: false, problem: { kind: "no-change" } });
  });
});

describe("skipTurn", () => {
  test("makes the Alliance after the skipped one next; the skipped one keeps its place", () => {
    const result = skipTurn(turns(["NML", "ABC", "XYZ"], "NML"));
    expect(result).toEqual({ ok: true, turns: turns(["NML", "ABC", "XYZ"], "NML", { next: "XYZ" }), skipped: "ABC", upcoming: "XYZ" });
  });

  test("skips again from the recorded next, wrapping around", () => {
    const result = skipTurn(turns(["NML", "ABC", "XYZ"], "NML", { next: "XYZ" }));
    expect(result).toMatchObject({ ok: true, skipped: "XYZ", upcoming: "NML" });
  });

  test("in an open Turn expects the Alliance after the skipped one", () => {
    const result = skipTurn(turns(["NML", "ABC", "XYZ"], "NML", { expected: "ABC" }));
    expect(result).toEqual({ ok: true, turns: turns(["NML", "ABC", "XYZ"], "NML", { expected: "XYZ" }), skipped: "ABC", upcoming: "XYZ" });
  });

  test("refuses a rotation of one Alliance", () => {
    expect(skipTurn(turns(["ABC"], "NML", { next: "ABC" }))).toEqual({ ok: false, problem: { kind: "too-short" } });
  });
});

describe("leaveRotation", () => {
  test("takes an Alliance out; the one after it moves up", () => {
    const result = leaveRotation(turns(["NML", "ABC", "XYZ"], "NML"), "abc");
    expect(result).toEqual({ ok: true, turns: turns(["NML", "XYZ"], "NML"), left: "ABC" });
    if (result.ok) expect(upcomingAlliance(result.turns)).toBe("XYZ");
  });

  test("hands an open Turn to the Alliance after the expected one that left", () => {
    const result = leaveRotation(turns(["NML", "ABC", "XYZ"], "NML", { expected: "ABC" }), "ABC");
    expect(result).toMatchObject({ ok: true, turns: { order: ["NML", "XYZ"], expected: "XYZ", next: undefined } });
  });

  test("moves a recorded next on to the Alliance after it", () => {
    const result = leaveRotation(turns(["NML", "ABC", "XYZ"], "NML", { next: "XYZ" }), "XYZ");
    expect(result).toMatchObject({ ok: true, turns: { order: ["NML", "ABC"], next: "NML" } });
  });

  test("keeps a leaving Holding Alliance holding; the Alliance after it is next", () => {
    const result = leaveRotation(turns(["NML", "ABC", "XYZ"], "ABC"), "ABC");
    expect(result).toEqual({ ok: true, turns: turns(["NML", "XYZ"], "ABC", { next: "XYZ" }), left: "ABC" });
    if (result.ok) expect(upcomingAlliance(result.turns)).toBe("XYZ");
  });

  test("refuses an Alliance outside the rotation and the last Alliance", () => {
    expect(leaveRotation(turns(["NML", "ABC"], "NML"), "QQQ")).toEqual({ ok: false, problem: { kind: "not-in-rotation", tag: "QQQ" } });
    expect(leaveRotation(turns(["ABC"], "NML", { next: "ABC" }), "ABC")).toEqual({ ok: false, problem: { kind: "last-alliance" } });
  });
});
