import { describe, expect, test } from "vitest";
import { duelDayOf, nextDuelReset, type DuelPlan } from "./duel-plan.js";
import { DUEL_PLAN } from "../duel-plan.js";

/** The most characters Discord takes in one embed field. */
const EMBED_FIELD_LIMIT = 1024;

describe("Duel days", () => {
  test.each([
    ["2026-11-16T02:00:00Z", "monday"],
    ["2026-11-17T12:00:00Z", "tuesday"],
    ["2026-11-18T12:00:00Z", "wednesday"],
    ["2026-11-19T12:00:00Z", "thursday"],
    ["2026-11-20T12:00:00Z", "friday"],
    ["2026-11-21T12:00:00Z", "saturday"],
    ["2026-11-22T01:59:00Z", "saturday"],
  ])("%s is the Duel day %s", (at, day) => {
    expect(duelDayOf(new Date(at))).toBe(day);
  });

  test("Sunday in Server Time, including Monday before 02:00 UTC, is not a Duel day", () => {
    expect(duelDayOf(new Date("2026-11-22T02:00:00Z"))).toBeUndefined();
    expect(duelDayOf(new Date("2026-11-22T20:00:00Z"))).toBeUndefined();
    expect(duelDayOf(new Date("2026-11-23T01:59:00Z"))).toBeUndefined();
  });

  test("the next Duel reset skips the Sunday reset", () => {
    expect(nextDuelReset(new Date("2026-11-16T12:00:00Z"))).toEqual(new Date("2026-11-17T02:00:00Z"));
    expect(nextDuelReset(new Date("2026-11-21T03:00:00Z"))).toEqual(new Date("2026-11-23T02:00:00Z"));
    expect(nextDuelReset(new Date("2026-11-22T12:00:00Z"))).toEqual(new Date("2026-11-23T02:00:00Z"));
    expect(nextDuelReset(new Date("2026-11-23T01:00:00Z"))).toEqual(new Date("2026-11-23T02:00:00Z"));
  });
});

describe("the Duel Plan file", () => {
  test("every text fits a Discord embed field", () => {
    const plan: DuelPlan = DUEL_PLAN;
    for (const entry of Object.values(plan)) {
      expect(entry.scores.length).toBeLessThanOrEqual(EMBED_FIELD_LIMIT);
      expect(entry.save.length).toBeLessThanOrEqual(EMBED_FIELD_LIMIT);
    }
  });

  test("names all six Duel days, Monday to Saturday", () => {
    expect(Object.keys(DUEL_PLAN).sort()).toEqual(
      ["friday", "monday", "saturday", "thursday", "tuesday", "wednesday"],
    );
  });
});

describe("the Duel Plan type", () => {
  test("a plan with a missing day does not compile", () => {
    const entry = { scores: "", save: "" };
    // @ts-expect-error Saturday is missing, so this is not a Duel Plan.
    const partial: DuelPlan = { monday: entry, tuesday: entry, wednesday: entry, thursday: entry, friday: entry };
    expect(Object.keys(partial)).toHaveLength(5);
  });
});
