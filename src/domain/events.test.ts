import { describe, expect, test } from "vitest";
import { eventOwnerOf, parseLeadTimes } from "./events.js";

describe("eventOwnerOf", () => {
  test("an Alliance Event takes the tag in leading brackets as its Alliance", () => {
    expect(eventOwnerOf("[NML] Hive move")).toEqual({ kind: "alliance", tag: "NML" });
  });

  test("a name without a leading bracketed tag is a Kingdom Event", () => {
    expect(eventOwnerOf("Alliance Duel round 3")).toEqual({ kind: "kingdom" });
  });

  test("a bracketed tag that is not at the start does not make an Alliance Event", () => {
    expect(eventOwnerOf("Hive move [NML]")).toEqual({ kind: "kingdom" });
  });
});

describe("parseLeadTimes", () => {
  test("reads a list of lead times as minutes, in the order written", () => {
    expect(parseLeadTimes("24h, 1h, 10m")).toEqual({ ok: true, value: [1440, 60, 10] });
  });

  test("reads a single lead time", () => {
    expect(parseLeadTimes("2d")).toEqual({ ok: true, value: [2880] });
  });

  test("accepts the bounds: one minute and seven days", () => {
    expect(parseLeadTimes("1m, 7d")).toEqual({ ok: true, value: [1, 10080] });
  });

  test("accepts three lead times, the most a list can have", () => {
    expect(parseLeadTimes("3d,12h,30m")).toEqual({ ok: true, value: [4320, 720, 30] });
  });

  test.each([
    ["empty", ""],
    ["a word", "soon"],
    ["a unit that is not known", "1x"],
    ["a number without a unit", "24"],
    ["a unit without a number", "h"],
    ["a decimal", "1.5h"],
    ["a negative value", "-1h"],
    ["an empty item between commas", "1h,,2h"],
  ])("refuses unreadable text: %s", (_label, input) => {
    expect(parseLeadTimes(input)).toEqual({ ok: false, reason: "unreadable" });
  });

  test("refuses more than three lead times", () => {
    expect(parseLeadTimes("1d, 12h, 1h, 10m")).toEqual({ ok: false, reason: "too-many" });
  });

  test.each([
    ["zero minutes", "0m"],
    ["under a minute, in hours", "0h"],
    ["more than seven days", "8d"],
    ["one minute more than seven days", "10081m"],
  ])("refuses a lead time out of range: %s", (_label, input) => {
    expect(parseLeadTimes(input)).toEqual({ ok: false, reason: "out-of-range" });
  });
});
