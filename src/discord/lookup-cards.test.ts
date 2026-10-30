import { describe, expect, test } from "vitest";
import {
  parseAllianceKey,
  parseKingdom,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type Uid,
} from "../domain/lookup-input.js";
import type { Alliance, Match, Player } from "../domain/player.js";
import { lookupMessages, renderAllianceCard, renderPlayerCard, timeLeft } from "./lookup-cards.js";

function uid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid "${text}" is not a valid uid`);
  return parsed.value;
}

function kingdom(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} is not valid`);
  return parsed.value;
}

const FETCHED_AT = new Date("2026-10-30T14:05:00Z");
const NOW = new Date("2026-10-30T16:00:00Z");

const inAlliance: Player = {
  uid: uid("145563254785"),
  name: "Vex",
  kingdom: kingdom(330),
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men" },
  allianceRank: "R5",
};

const withoutAlliance: Player = {
  uid: uid("145563254785"),
  name: "Vex",
  kingdom: kingdom(330),
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

describe("renderPlayerCard", () => {
  test("titles the card with the Player's name", () => {
    expect(renderPlayerCard(inAlliance, FETCHED_AT, NOW)).toMatchObject({ title: "Vex" });
  });

  test("shows uid, Kingdom, Power, Sanctuary level, Alliance and Alliance Rank as inline fields", () => {
    expect(renderPlayerCard(inAlliance, FETCHED_AT, NOW)).toMatchObject({
      fields: [
        { name: "uid", value: "145563254785", inline: true },
        { name: "Kingdom", value: "#330", inline: true },
        { name: "Power", value: "15,902,728", inline: true },
        { name: "Sanctuary level", value: "42", inline: true },
        { name: "Alliance", value: "[NML] Neil's Men", inline: true },
        { name: "Alliance Rank", value: "R5", inline: true },
      ],
    });
  });

  test("shows No alliance and leaves out the Alliance Rank field without an Alliance", () => {
    const card = renderPlayerCard(withoutAlliance, FETCHED_AT, NOW);

    expect(card).toMatchObject({
      fields: [
        { name: "uid", value: "145563254785" },
        { name: "Kingdom", value: "#330" },
        { name: "Power", value: "15,902,728" },
        { name: "Sanctuary level", value: "42" },
        { name: "Alliance", value: "No alliance" },
      ],
    });
    expect(card.fields?.map((field) => field.name)).not.toContain("Alliance Rank");
  });

  test("shows Unknown as the Alliance Rank when the Game gives none", () => {
    const card = renderPlayerCard({ ...inAlliance, allianceRank: "unknown" }, FETCHED_AT, NOW);

    expect(card.fields?.find((field) => field.name === "Alliance Rank")).toMatchObject({ value: "Unknown" });
  });

  test("credits Last Asylum Tracker in the footer", () => {
    expect(renderPlayerCard(inAlliance, FETCHED_AT, NOW)).toMatchObject({
      footer: { text: "Data from Last Asylum Tracker · as of 14:05 UTC" },
    });
  });

  test("escapes markdown in the Player's name and in the Alliance's name", () => {
    const card = renderPlayerCard({
      ...inAlliance,
      name: "*Bold_* `x`",
      alliance: { tag: "NML", name: "_Tilted_ ~Men~" },
    }, FETCHED_AT, NOW);

    expect(card).toMatchObject({ title: "\\*Bold\\_\\* \\`x\\`" });
    expect(card.fields?.find((field) => field.name === "Alliance")).toMatchObject({
      value: "[NML] \\_Tilted\\_ \\~Men\\~",
    });
  });
});

describe("lookupMessages", () => {
  test.each([
    ["invalidUid", "That doesn't look like a uid. A uid is a number: in the game, tap your profile picture (top left), then the feather next to your name; the number under the picture is your uid."],
    ["tryAgain", "The game tracker is busy right now. Try again in a moment."],
    ["unavailable", "Lookups are not working right now. Please tell an Officer."],
  ] as const)("%s has the contract's text", (key, text) => {
    expect(lookupMessages[key]).toBe(text);
  });

  test("playerNotFound names the uid", () => {
    expect(lookupMessages.playerNotFound("145563254785")).toBe("No player has the uid 145563254785.");
  });

  test("playerNotFound escapes the uid as typed", () => {
    expect(lookupMessages.playerNotFound("1_2*")).toBe("No player has the uid 1\\_2\\*.");
  });

  test("playerNotPrepared names the uid and hints that the uid may be wrong or the tracker busy", () => {
    expect(lookupMessages.playerNotPrepared("145563254785")).toBe(
      "Couldn't find a player with the uid 145563254785. Check the uid; if it's right, the tracker may be busy, so try again later.",
    );
  });

  test("playerNotPrepared escapes the uid as typed", () => {
    expect(lookupMessages.playerNotPrepared("1_2*")).toBe(
      "Couldn't find a player with the uid 1\\_2\\*. Check the uid; if it's right, the tracker may be busy, so try again later.",
    );
  });
});

function allianceKey(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test alliance key "${text}" is not valid`);
  return parsed.value;
}

const alliance: Alliance = {
  tag: "NML",
  name: "No Man's Land",
  kingdom: kingdom(1),
  power: 208815434,
  memberCount: 52,
  capacity: 100,
  leaderName: "DrLOL",
};

describe("renderAllianceCard", () => {
  test("titles the card with the Alliance's tag and name", () => {
    expect(renderAllianceCard(alliance, FETCHED_AT, NOW)).toMatchObject({
      title: "[NML] No Man's Land",
    });
  });

  test("shows Kingdom, Power, Members as count/capacity, and Leader as inline fields", () => {
    expect(renderAllianceCard(alliance, FETCHED_AT, NOW)).toMatchObject({
      fields: [
        { name: "Kingdom", value: "#1", inline: true },
        { name: "Power", value: "208,815,434", inline: true },
        { name: "Members", value: "52/100", inline: true },
        { name: "Leader", value: "DrLOL", inline: true },
      ],
    });
  });

  test("shows Unknown as the Leader when the Game gives no leader name", () => {
    const card = renderAllianceCard({ ...alliance, leaderName: undefined }, FETCHED_AT, NOW);

    expect(card.fields?.find((field) => field.name === "Leader")).toMatchObject({ value: "Unknown" });
  });

  test("credits Last Asylum Tracker in the footer", () => {
    expect(renderAllianceCard(alliance, FETCHED_AT, NOW)).toMatchObject({
      footer: { text: "Data from Last Asylum Tracker · as of 14:05 UTC" },
    });
  });

  test("escapes markdown in the tag, the name and the leader name", () => {
    const card = renderAllianceCard({
      ...alliance,
      tag: "N_M",
      name: "*Bold* ~x~",
      leaderName: "_DrLOL_",
    }, FETCHED_AT, NOW);

    expect(card).toMatchObject({ title: "[N\\_M] \\*Bold\\* \\~x\\~" });
    expect(card.fields?.find((field) => field.name === "Leader")).toMatchObject({ value: "\\_DrLOL\\_" });
  });
});

describe("lookupMessages for /alliance", () => {
  test("invalidKingdom gives the contract's text", () => {
    expect(lookupMessages.invalidKingdom).toBe("The kingdom must be a number from 1 to 9999.");
  });

  test("invalidAlliance gives the contract's text", () => {
    expect(lookupMessages.invalidAlliance).toBe("Give the alliance's tag (up to 40 characters).");
  });

  test("allianceNotFound names the key and the Kingdom", () => {
    expect(lookupMessages.allianceNotFound(allianceKey("ZZZQX"), kingdom(1))).toBe(
      'No alliance "ZZZQX" in kingdom #1.',
    );
  });

  test("allianceNotFound escapes the key as typed", () => {
    expect(lookupMessages.allianceNotFound(allianceKey("N_M*"), kingdom(1))).toBe(
      'No alliance "N\\_M\\*" in kingdom #1.',
    );
  });

  test("ambiguous lists each match as [tag] name and asks for the exact tag", () => {
    const matches: readonly Match[] = [
      { tag: "NML", name: "No Man's Land", kingdom: 1, uid: "145563254785" },
      { tag: "NMX", name: "No Man's Land", kingdom: 2, uid: "93159425" },
    ];

    expect(lookupMessages.ambiguous(allianceKey("No Man's Land"), matches)).toBe(
      "More than one alliance matches \"No Man's Land\": [NML] No Man's Land, [NMX] No Man's Land. Try the exact tag.",
    );
  });

  test("ambiguous escapes the key and the names", () => {
    const matches: readonly Match[] = [
      { tag: "N_M", name: "*Bold*", kingdom: 1 },
      { tag: "NMX", name: "Plain", kingdom: 2 },
    ];

    expect(lookupMessages.ambiguous(allianceKey("N_M"), matches)).toBe(
      'More than one alliance matches "N\\_M": [N\\_M] \\*Bold\\*, [NMX] Plain. Try the exact tag.',
    );
  });
});

describe("lookupMessages.ambiguous with many matches", () => {
  const manyMatches: readonly Match[] = Array.from({ length: 60 }, (_, index) => ({
    tag: `T${index.toString().padStart(2, "0")}`,
    name: "C".repeat(40),
    kingdom: index + 1,
  }));

  test("lists at most 10 matches, then says how many more there are", () => {
    const text = lookupMessages.ambiguous(allianceKey("Clan"), manyMatches);

    expect(text.match(/\[T\d{2}\] C{40}/g)).toHaveLength(10);
    expect(text).toContain("[T09] " + "C".repeat(40));
    expect(text).not.toContain("[T10] " + "C".repeat(40));
    expect(text).toContain("and 50 more");
  });

  test("keeps the whole text within Discord's 2000-character message limit", () => {
    expect(lookupMessages.ambiguous(allianceKey("Clan"), manyMatches).length).toBeLessThanOrEqual(2000);
  });
});

describe("card titles within Discord's 256-character limit", () => {
  const longName = "A".repeat(300);

  test("truncates a Player's name of 300 characters to at most 256, ending with an ellipsis", () => {
    const title = renderPlayerCard({ ...inAlliance, name: longName }, FETCHED_AT, NOW).title ?? "";

    expect(title.length).toBeLessThanOrEqual(256);
    expect(title.endsWith("…")).toBe(true);
  });

  test("truncates an Alliance's title of 300 characters to at most 256, ending with an ellipsis", () => {
    const title = renderAllianceCard({ ...alliance, name: longName }, FETCHED_AT, NOW).title ?? "";

    expect(title.length).toBeLessThanOrEqual(256);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("renderAllianceCard with an empty leader name", () => {
  test("shows Unknown as the Leader, never an empty field value", () => {
    const card = renderAllianceCard({ ...alliance, leaderName: "" }, FETCHED_AT, NOW);

    expect(card.fields?.find((field) => field.name === "Leader")).toMatchObject({ value: "Unknown" });
  });
});

describe("timeLeft", () => {
  const MINUTE_MS = 60_000;
  const HOUR_MS = 60 * MINUTE_MS;

  test.each([
    { label: "3 h 12 min", ms: 3 * HOUR_MS + 12 * MINUTE_MS, text: "in 3 h 12 min" },
    { label: "exactly 1 h", ms: HOUR_MS, text: "in 1 h 0 min" },
    { label: "59 min 59 s, minutes rounded down", ms: HOUR_MS - 1000, text: "in 59 min" },
    { label: "3 h 12 min 45 s, seconds dropped", ms: 3 * HOUR_MS + 12 * MINUTE_MS + 45_000, text: "in 3 h 12 min" },
    { label: "exactly 1 min", ms: MINUTE_MS, text: "in 1 min" },
    { label: "59 s, under a minute", ms: MINUTE_MS - 1000, text: "in under a minute" },
    { label: "no time left", ms: 0, text: "in under a minute" },
  ])("$label reads as $text", ({ ms, text }) => {
    expect(timeLeft(new Date(NOW.getTime() + ms), NOW)).toBe(text);
  });
});

describe("lookupMessages.quotaSpent", () => {
  test("says the lookups are paused, names the Daily Quota and gives the reset time with the time left", () => {
    expect(
      lookupMessages.quotaSpent(new Date("2026-10-31T00:00:00Z"), new Date("2026-10-30T20:48:00Z")),
    ).toBe(
      "Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC (in 3 h 12 min).",
    );
  });
});

describe("card footers say when the data was fetched", () => {
  test.each([
    {
      label: "the Player card",
      render: (fetchedAt: Date, now: Date) => renderPlayerCard(inAlliance, fetchedAt, now),
    },
    {
      label: "the Alliance card",
      render: (fetchedAt: Date, now: Date) => renderAllianceCard(alliance, fetchedAt, now),
    },
  ])("$label shows zero-padded UTC time for a fetch on today's UTC day", ({ render }) => {
    expect(render(new Date("2026-10-30T09:05:00Z"), NOW)).toMatchObject({
      footer: { text: "Data from Last Asylum Tracker · as of 09:05 UTC" },
    });
  });

  test.each([
    {
      label: "the Player card",
      render: (fetchedAt: Date, now: Date) => renderPlayerCard(inAlliance, fetchedAt, now),
    },
    {
      label: "the Alliance card",
      render: (fetchedAt: Date, now: Date) => renderAllianceCard(alliance, fetchedAt, now),
    },
  ])("$label shows the day, English month and UTC time for a fetch on an earlier UTC day", ({ render }) => {
    expect(render(new Date("2026-10-29T23:50:00Z"), NOW)).toMatchObject({
      footer: { text: "Data from Last Asylum Tracker · as of 29 Oct 23:50 UTC" },
    });
  });

  test.each([
    {
      label: "the Player card",
      render: (fetchedAt: Date, now: Date) => renderPlayerCard(inAlliance, fetchedAt, now),
    },
    {
      label: "the Alliance card",
      render: (fetchedAt: Date, now: Date) => renderAllianceCard(alliance, fetchedAt, now),
    },
  ])("$label counts a fetch from just before midnight UTC as an earlier day, right after midnight", ({ render }) => {
    expect(render(new Date("2026-10-29T23:50:00Z"), new Date("2026-10-30T00:05:00Z"))).toMatchObject({
      footer: { text: "Data from Last Asylum Tracker · as of 29 Oct 23:50 UTC" },
    });
  });

  test.each([
    {
      label: "the Player card",
      render: (fetchedAt: Date, now: Date) => renderPlayerCard(inAlliance, fetchedAt, now),
    },
    {
      label: "the Alliance card",
      render: (fetchedAt: Date, now: Date) => renderAllianceCard(alliance, fetchedAt, now),
    },
  ])("$label writes the day of the month without a leading zero", ({ render }) => {
    expect(render(new Date("2026-10-03T09:05:00Z"), NOW)).toMatchObject({
      footer: { text: "Data from Last Asylum Tracker · as of 3 Oct 09:05 UTC" },
    });
  });
});
