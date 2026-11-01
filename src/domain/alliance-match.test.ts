import { describe, expect, test } from "vitest";
import { matchAlliances, normalise, type KnownAlliance } from "./alliance-match.js";
import { parseKingdom, type KingdomNumber } from "./lookup-input.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const DAY_MS = 86_400_000;
const HOME_KINGDOM = kingdomOf(330);

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

/** A Known Alliance of the Home Kingdom, last seen `ago` milliseconds before NOW (now by default). */
function known(tag: string, name: string, ago = 0): KnownAlliance {
  return { kingdom: HOME_KINGDOM, tag, name, lastSeen: new Date(NOW.getTime() - ago) };
}

/** The tags of the matches, in the order they are returned. */
function matchTags(query: string, alliances: readonly KnownAlliance[], limit?: number): string[] {
  return matchAlliances(query, alliances, NOW, limit).map((alliance) => alliance.tag);
}

const NO_MANS_LAND = known("NML", "No Man's Land");
const NIGHT_MARES = known("NMA", "Night Mares");

describe("normalise", () => {
  test.each([
    ["No Man's Land", "nomansland"],
    ["Ça Va", "cava"],
    ["Ñandú", "nandu"],
    ["  NML!! ", "nml"],
    ["Clan 07", "clan07"],
    ["---", ""],
  ])("normalises %j to %j: lower case, accents, spaces and punctuation removed", (text, expected) => {
    expect(normalise(text)).toBe(expected);
  });
});

describe("matchAlliances ranking", () => {
  test("an exact full name outranks a prefix of another name", () => {
    const alliances = [known("NMX", "No Mans Landing"), NO_MANS_LAND];

    expect(matchTags("no mans land", alliances)).toEqual(["NML", "NMX"]);
  });

  test("an exact tag outranks a prefix of another name", () => {
    const alliances = [known("ZZZ", "NMA Crew"), known("NMA", "Night Mares")];

    expect(matchTags("NMA", alliances)).toEqual(["NMA", "ZZZ"]);
  });

  test("a prefix outranks a part", () => {
    const alliances = [NO_MANS_LAND, known("MNS", "Mansfield")];

    expect(matchTags("mans", alliances)).toEqual(["MNS", "NML"]);
  });

  test("a part outranks a near spelling", () => {
    const alliances = [known("MNS", "Mnas"), NO_MANS_LAND];

    expect(matchTags("mans", alliances)).toEqual(["NML", "MNS"]);
  });

  test("at the same rank a tag match outranks a name match", () => {
    const alliances = [known("ZZZ", "Night Mares"), known("NIGA", "Zed")];

    expect(matchTags("nig", alliances)).toEqual(["NIGA", "ZZZ"]);
  });

  test("at the same rank the more recently seen Alliance comes first", () => {
    const alliances = [known("AAA", "Manor Old", 2 * DAY_MS), known("BBB", "Manor New", 60 * 60 * 1000)];

    expect(matchTags("manor", alliances)).toEqual(["BBB", "AAA"]);
  });
});

describe("matchAlliances by part and near spelling", () => {
  test.each([
    ["man", ["NML"]],
    ["no mans", ["NML"]],
    ["No Mna's Land", ["NML"]],
  ])("the query %j finds No Man's Land among Known Alliances", (query, expected) => {
    expect(matchTags(query, [NO_MANS_LAND, NIGHT_MARES])).toEqual(expected);
  });

  test("a 4 to 7 letter query allows one wrong, missing or swapped letter", () => {
    expect(matchTags("redwod", [known("RWD", "Redwood")])).toEqual(["RWD"]);
  });

  test("a 4 to 7 letter query does not allow two wrong letters", () => {
    expect(matchTags("redwxxd", [known("RWD", "Redwood")])).toEqual([]);
  });

  test("an 8 letter or longer query allows two wrong letters", () => {
    expect(matchTags("nomxnslxnd", [NO_MANS_LAND])).toEqual(["NML"]);
  });

  test("a 3 letter query takes prefixes and parts only, no near spelling", () => {
    expect(matchTags("nmi", [NO_MANS_LAND])).toEqual([]);
  });
});

describe("matchAlliances for short queries", () => {
  test("a 2 letter query matches prefixes only, not parts", () => {
    expect(matchTags("ma", [NO_MANS_LAND])).toEqual([]);
    expect(matchTags("no", [NO_MANS_LAND, NIGHT_MARES])).toEqual(["NML"]);
  });

  test("a 1 letter query matches prefixes only", () => {
    expect(matchTags("a", [NO_MANS_LAND, NIGHT_MARES])).toEqual([]);
    expect(matchTags("n", [NO_MANS_LAND, NIGHT_MARES]).sort()).toEqual(["NMA", "NML"]);
  });
});

describe("matchAlliances selection", () => {
  test("gives nothing when no Known Alliance matches", () => {
    expect(matchTags("zzzz", [NO_MANS_LAND, NIGHT_MARES])).toEqual([]);
  });

  test("leaves out an Alliance last seen more than 30 days ago, and keeps one seen exactly 30 days ago", () => {
    const alliances = [known("NML", "Nomads", 30 * DAY_MS), known("NMA", "Nomad Army", 30 * DAY_MS + 1)];

    expect(matchTags("nm", alliances)).toEqual(["NML"]);
  });

  test("gives at most 25 matches by default, and at most the limit given", () => {
    const alliances = Array.from({ length: 30 }, (_, index) =>
      known(`T${String(index).padStart(2, "0")}`, `Manor ${String(index).padStart(2, "0")}`),
    );

    expect(matchTags("manor", alliances)).toHaveLength(25);
    expect(matchTags("manor", alliances, 3)).toHaveLength(3);
  });
});
