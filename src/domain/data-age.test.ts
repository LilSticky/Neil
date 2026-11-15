import { describe, expect, test } from "vitest";
import { MAP_TIME_FRESH_MS, isOld, mapPageOf } from "./data-age.js";
import { parseKingdom, type KingdomNumber } from "./lookup-input.js";

const NOW = new Date("2026-11-15T12:00:00Z");

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

describe("MAP_TIME_FRESH_MS", () => {
  test("is five minutes", () => {
    expect(MAP_TIME_FRESH_MS).toBe(5 * 60_000);
  });
});

describe("isOld", () => {
  test("is old when the map time is unknown", () => {
    expect(isOld(undefined, NOW)).toBe(true);
  });

  test("is old when the map time is 44 minutes ago", () => {
    expect(isOld(minutesBefore(44), NOW)).toBe(true);
  });

  test("is not old when the map time is 2 minutes ago", () => {
    expect(isOld(minutesBefore(2), NOW)).toBe(false);
  });

  test("is not old at exactly five minutes", () => {
    expect(isOld(minutesBefore(5), NOW)).toBe(false);
  });

  test("is old one millisecond after five minutes", () => {
    expect(isOld(new Date(NOW.getTime() - MAP_TIME_FRESH_MS - 1), NOW)).toBe(true);
  });

  test("is not old when the map time is in the future", () => {
    expect(isOld(new Date(NOW.getTime() + 60_000), NOW)).toBe(false);
  });
});

describe("mapPageOf", () => {
  test("links the map of the Kingdom", () => {
    expect(mapPageOf(kingdomOf(330))).toBe("https://lastasylumtracker.com/map?kid=330");
  });

  test("links the tracker map when the Kingdom is unknown", () => {
    expect(mapPageOf(undefined)).toBe("https://lastasylumtracker.com/map");
  });
});
