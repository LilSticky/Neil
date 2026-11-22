import { describe, expect, test } from "vitest";
import type { KnownAlliance } from "./alliance-match.js";
import { exactKnownAlliance, matchesIn, parseAllianceSearch } from "./alliance-search.js";
import { parseKingdom, type KingdomNumber } from "./lookup-input.js";
import type { Match } from "./player.js";

const NOW = new Date("2026-11-22T12:00:00Z");
const DAY_MS = 86_400_000;
const HOME_KINGDOM = kingdomOf(330);
const OTHER_KINGDOM = kingdomOf(1);

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

/** A Known Alliance of `kingdom`, last seen `ago` milliseconds before NOW (now by default). */
function known(kingdom: KingdomNumber, tag: string, name: string, ago = 0): KnownAlliance {
  return { kingdom, tag, name, lastSeen: new Date(NOW.getTime() - ago) };
}

describe("parseAllianceSearch", () => {
  test("a bracketed tag is a search by tag", () => {
    expect(parseAllianceSearch("[REB]")).toEqual({ ok: true, value: { kind: "tag", tag: "REB" } });
  });

  test("a pasted [TAG] Name is a search by its tag", () => {
    expect(parseAllianceSearch("[REB] Rebirth")).toEqual({ ok: true, value: { kind: "tag", tag: "REB" } });
  });

  test("other text is a search by name, trimmed", () => {
    expect(parseAllianceSearch("  reb ")).toEqual({ ok: true, value: { kind: "text", key: "reb" } });
  });

  test("text of 40 characters is the longest search", () => {
    const longest = "a".repeat(40);

    expect(parseAllianceSearch(longest)).toEqual({ ok: true, value: { kind: "text", key: longest } });
  });

  test.each([
    ["an empty text", ""],
    ["a text of only spaces", "   "],
    ["an empty tag", "[]"],
    ["a tag of only spaces", "[ ]"],
    ["text of 41 characters", "a".repeat(41)],
  ])("%s is invalid", (_description, text) => {
    expect(parseAllianceSearch(text)).toEqual({ ok: false });
  });
});

describe("exactKnownAlliance", () => {
  test("finds the Alliance by its tag in any letter case", () => {
    const rebirth = known(HOME_KINGDOM, "REB", "Rebirth");

    expect(exactKnownAlliance("reb", [rebirth], HOME_KINGDOM, NOW)).toEqual(rebirth);
  });

  test("finds the Alliance by its full name, ignoring case and punctuation", () => {
    const noMansLand = known(HOME_KINGDOM, "NML", "No Man's Land");

    expect(exactKnownAlliance("no mans land", [noMansLand], HOME_KINGDOM, NOW)).toEqual(noMansLand);
  });

  test("only Alliances of the given Kingdom count", () => {
    const otherKingdomRebirth = known(OTHER_KINGDOM, "REB", "Rebirth");

    expect(exactKnownAlliance("REB", [otherKingdomRebirth], HOME_KINGDOM, NOW)).toBeUndefined();
  });

  test("a tag match is preferred over a name match", () => {
    const nameMatch = known(HOME_KINGDOM, "ZZZ", "NMA");
    const tagMatch = known(HOME_KINGDOM, "NMA", "Night Mares");

    expect(exactKnownAlliance("NMA", [nameMatch, tagMatch], HOME_KINGDOM, NOW)).toEqual(tagMatch);
  });

  test("an Alliance seen 29 days ago is still found", () => {
    const rebirth = known(HOME_KINGDOM, "REB", "Rebirth", 29 * DAY_MS);

    expect(exactKnownAlliance("REB", [rebirth], HOME_KINGDOM, NOW)).toEqual(rebirth);
  });

  test("an Alliance not seen for 30 days is left out", () => {
    const rebirth = known(HOME_KINGDOM, "REB", "Rebirth", 31 * DAY_MS);

    expect(exactKnownAlliance("REB", [rebirth], HOME_KINGDOM, NOW)).toBeUndefined();
  });

  test("a text that equals no tag or name gives undefined", () => {
    const rebirth = known(HOME_KINGDOM, "REB", "Rebirth");

    expect(exactKnownAlliance("rebirt", [rebirth], HOME_KINGDOM, NOW)).toBeUndefined();
  });
});

describe("matchesIn", () => {
  test("keeps only the matches of the given Kingdom", () => {
    const homeMatch: Match = { tag: "REB", name: "Rebirth", kingdom: 330 };
    const otherMatch: Match = { tag: "REB", name: "Rebirth", kingdom: 1 };

    expect(matchesIn([homeMatch, otherMatch], HOME_KINGDOM)).toEqual([homeMatch]);
  });

  test("leaves out matches without a tag or without a Kingdom", () => {
    const pickable: Match = { tag: "REB", name: "Rebirth", kingdom: 330 };
    const withoutTag: Match = { name: "Rebirth", kingdom: 330 };
    const withoutKingdom: Match = { tag: "REB", name: "Rebirth" };

    expect(matchesIn([withoutTag, pickable, withoutKingdom], HOME_KINGDOM)).toEqual([pickable]);
  });
});
