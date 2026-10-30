import { describe, expect, test } from "vitest";
import { parseAllianceKey, parseKingdom, parsePlayerName, parseUid } from "./lookup-input.js";

describe("parseUid", () => {
  test("trims surrounding spaces and returns the digits", () => {
    expect(parseUid(" 145563254785 ")).toEqual({ ok: true, value: "145563254785" });
  });

  test.each([
    ["1 digit", "1"],
    ["20 digits", "12345678901234567890"],
  ])("accepts a uid of %s", (_label, input) => {
    expect(parseUid(input)).toEqual({ ok: true, value: input });
  });

  test.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["letters", "14556abc"],
    ["a minus sign", "-1"],
    ["21 digits", "123456789012345678901"],
  ])("rejects a uid that is %s", (_label, input) => {
    expect(parseUid(input)).toEqual({ ok: false });
  });
});

describe("parseKingdom", () => {
  test.each([
    ["1", 1],
    ["330", 330],
    ["9999", 9999],
  ])("accepts the Kingdom number %s", (_label, input) => {
    expect(parseKingdom(input)).toEqual({ ok: true, value: input });
  });

  test.each([
    ["0", 0],
    ["10000", 10000],
    ["1.5", 1.5],
  ])("rejects the Kingdom number %s", (_label, input) => {
    expect(parseKingdom(input)).toEqual({ ok: false });
  });
});

describe("parseAllianceKey", () => {
  test("trims surrounding spaces and returns the tag", () => {
    expect(parseAllianceKey("  NML  ")).toEqual({ ok: true, value: "NML" });
  });

  test("accepts a key of 40 characters", () => {
    const key = "A".repeat(40);

    expect(parseAllianceKey(key)).toEqual({ ok: true, value: key });
  });

  test.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["41 characters", "A".repeat(41)],
  ])("rejects an Alliance key that is %s", (_label, input) => {
    expect(parseAllianceKey(input)).toEqual({ ok: false });
  });
});

describe("parsePlayerName", () => {
  test("trims surrounding spaces and keeps the letter case of the name", () => {
    expect(parsePlayerName("  DrLol  ")).toEqual({ ok: true, value: "DrLol" });
  });

  test.each([
    ["one character", "A"],
    ["32 characters", "A".repeat(32)],
    ["spaces inside", "Lord of the Plague"],
    ["an apostrophe", "O'Brien"],
    ["an emoji", "🔥Drake"],
  ])("accepts a Player Name with %s", (_label, input) => {
    expect(parsePlayerName(input)).toEqual({ ok: true, value: input });
  });

  test.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["33 characters", "A".repeat(33)],
    ["one dot", "."],
    ["only dots", "..."],
    ["dots between spaces", "  ..  "],
  ])("rejects a Player Name that is %s", (_label, input) => {
    expect(parsePlayerName(input)).toEqual({ ok: false });
  });
});

describe("parseAllianceKey with dots only", () => {
  test.each([
    ["one dot", "."],
    ["two dots", ".."],
    ["three dots", "..."],
  ])("rejects an Alliance key of %s, because it would be a path segment", (_label, input) => {
    expect(parseAllianceKey(input)).toEqual({ ok: false });
  });
});
