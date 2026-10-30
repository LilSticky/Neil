import { ComponentType, type APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
import {
  parseAllianceKey,
  parseKingdom,
  parsePlayerName,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type PlayerName,
  type Uid,
} from "../domain/lookup-input.js";
import type { Alliance, Match, Player, RosterEntry } from "../domain/player.js";
import {
  lookupMessages,
  renderAllianceCard,
  renderAlliancePickList,
  renderPlayerCard,
  renderPlayerPickList,
  renderRosterComponents,
  timeLeft,
} from "./lookup-cards.js";

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
  roster: [],
};

describe("renderAllianceCard", () => {
  test("titles the card with the Alliance's tag and name", () => {
    expect(renderAllianceCard(alliance, FETCHED_AT, NOW)).toMatchObject({
      title: "[NML] No Man's Land",
    });
  });

  test("shows Kingdom, Power, Members as count/capacity, and Leader as inline fields, before the roster", () => {
    const fields = renderAllianceCard(alliance, FETCHED_AT, NOW).fields ?? [];

    expect(fields.slice(0, 4)).toEqual([
      { name: "Kingdom", value: "#1", inline: true },
      { name: "Power", value: "208,815,434", inline: true },
      { name: "Members", value: "52/100", inline: true },
      { name: "Leader", value: "DrLOL", inline: true },
    ]);
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

function playerName(text: string): PlayerName {
  const parsed = parsePlayerName(text);
  if (!parsed.ok) throw new Error(`test player name "${text}" is not valid`);
  return parsed.value;
}

describe("lookupMessages for /player by name", () => {
  test("giveUidOrName gives the contract's text", () => {
    expect(lookupMessages.giveUidOrName).toBe("Give a uid, or a name (and optionally a kingdom).");
  });

  test("invalidPlayerName gives the contract's text", () => {
    expect(lookupMessages.invalidPlayerName).toBe(
      "Give the player's complete in-game name (up to 32 characters).",
    );
  });

  test("playerNameNotFound with a Kingdom names the name and the Kingdom", () => {
    expect(lookupMessages.playerNameNotFound(playerName("DrLOL"), kingdom(1))).toBe(
      'No player is named "DrLOL" in kingdom #1. The name must be complete; a uid always works.',
    );
  });

  test("playerNameNotFound without a Kingdom names only the name", () => {
    expect(lookupMessages.playerNameNotFound(playerName("DrLOL"), undefined)).toBe(
      'No player is named "DrLOL". The name must be complete; a uid always works.',
    );
  });

  test("playerNameNotFound escapes the name as typed", () => {
    expect(lookupMessages.playerNameNotFound(playerName("Dr_LOL"), undefined)).toBe(
      'No player is named "Dr\\_LOL". The name must be complete; a uid always works.',
    );
  });

  test("playerNameNotPrepared names the name and hints that the name may be wrong or the tracker busy", () => {
    expect(lookupMessages.playerNameNotPrepared(playerName("DrLOL"))).toBe(
      "Couldn't find a player named \"DrLOL\". Check the name; if it's right, the tracker may be busy, so try again later.",
    );
  });

  test("playerNameNotPrepared escapes the name as typed", () => {
    expect(lookupMessages.playerNameNotPrepared(playerName("Dr_LOL"))).toBe(
      "Couldn't find a player named \"Dr\\_LOL\". Check the name; if it's right, the tracker may be busy, so try again later.",
    );
  });
});

describe("renderPlayerPickList", () => {
  const unordered: readonly Match[] = [
    { name: "Vex", kingdom: 330, uid: "145563254785" },
    { name: "DrLOL", kingdom: 1, uid: "100000000002" },
  ];

  test("asks which player is meant, naming the typed name, with no note when every match is listed", () => {
    expect(renderPlayerPickList(playerName("DrLOL"), unordered, "a1b2c3d4")).toMatchObject({
      content: 'Several players are named "DrLOL". Pick one:',
    });
  });

  test("offers the matches in one select menu, ordered by Kingdom, valued by index in that order", () => {
    expect(renderPlayerPickList(playerName("DrLOL"), unordered, "a1b2c3d4")).toMatchObject({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: "pick:a1b2c3d4:select",
              options: [
                { label: "DrLOL · kingdom #1", value: "0" },
                { label: "Vex · kingdom #330", value: "1" },
              ],
            },
          ],
        },
      ],
    });
  });

  test("escapes the typed name in the question", () => {
    expect(renderPlayerPickList(playerName("Dr_LOL"), unordered, "a1b2c3d4")).toMatchObject({
      content: 'Several players are named "Dr\\_LOL". Pick one:',
    });
  });
});

describe("renderPlayerPickList with more than 25 matches", () => {
  const thirtyMatches: readonly Match[] = Array.from({ length: 30 }, (_, index) => ({
    name: `P${index.toString()}`,
    kingdom: index + 1,
    uid: (100_000_000_000 + index).toString(),
  })).reverse();

  test("offers only the first 25 by Kingdom, with values 0 to 24", () => {
    expect(renderPlayerPickList(playerName("DrLOL"), thirtyMatches, "a1b2c3d4")).toMatchObject({
      components: [
        {
          components: [
            {
              custom_id: "pick:a1b2c3d4:select",
              options: Array.from({ length: 25 }, (_, index) => ({
                label: `P${index.toString()} · kingdom #${(index + 1).toString()}`,
                value: index.toString(),
              })),
            },
          ],
        },
      ],
    });
  });

  test("says that only the first 25 are listed and how to narrow the list", () => {
    const pickList = renderPlayerPickList(playerName("DrLOL"), thirtyMatches, "a1b2c3d4");
    expect(pickList.content).toContain("Only the first 25 are listed; add a kingdom to narrow it.");
  });
});

function rosterEntry(uidText: string, name: string, allianceRank: RosterEntry["allianceRank"]): RosterEntry {
  return { uid: uid(uidText), name, allianceRank };
}

function fieldValue(embed: APIEmbed, name: string): string | undefined {
  return embed.fields?.find((field) => field.name === name)?.value;
}

/** Every character Discord counts toward an embed's 6,000: title, footer and each field's name and value. */
function embedCharacters(embed: APIEmbed): number {
  const parts = [
    embed.title ?? "",
    embed.footer?.text ?? "",
    ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
  ];
  return parts.reduce((total, part) => total + part.length, 0);
}

describe("renderAllianceCard roster fields", () => {
  const roster: readonly RosterEntry[] = [
    rosterEntry("93159425", "Benedict", "R3"),
    rosterEntry("179060285441", "etranger", "R4"),
    rosterEntry("147744374785", "Settong", "R1"),
    rosterEntry("5555", "Ana", "R4"),
    rosterEntry("42", "Unnamed", "unknown"),
  ];

  test("groups the roster into one field per Alliance Rank present, from R5 down to Unknown", () => {
    const card = renderAllianceCard({ ...alliance, roster }, FETCHED_AT, NOW);

    expect(card.fields?.map((field) => field.name)).toEqual([
      "Kingdom",
      "Power",
      "Members",
      "Leader",
      "R4",
      "R3",
      "R1",
      "Unknown",
    ]);
  });

  test("lists each Player as name · uid, sorted by name ignoring case within the rank", () => {
    const card = renderAllianceCard({ ...alliance, roster }, FETCHED_AT, NOW);

    expect(fieldValue(card, "R4")).toBe("Ana · 5555\netranger · 179060285441");
    expect(fieldValue(card, "R3")).toBe("Benedict · 93159425");
    expect(fieldValue(card, "Unknown")).toBe("Unnamed · 42");
  });

  test("escapes the Player's name in each row", () => {
    const card = renderAllianceCard({ ...alliance, roster: [rosterEntry("5555", "_Ana_", "R4")] }, FETCHED_AT, NOW);

    expect(fieldValue(card, "R4")).toBe("\\_Ana\\_ · 5555");
  });

  test("continues an Alliance Rank whose rows pass 1,024 characters in a field named R5 (cont.)", () => {
    const longRoster: RosterEntry[] = Array.from({ length: 30 }, (_, index) =>
      rosterEntry((100_000_000_000 + index).toString(), `${"N".repeat(40)}${index.toString().padStart(2, "0")}`, "R5"),
    );
    const fields = renderAllianceCard({ ...alliance, roster: longRoster }, FETCHED_AT, NOW).fields ?? [];
    const r5 = fields.filter((field) => field.name === "R5" || field.name === "R5 (cont.)");

    expect(r5.map((field) => field.name)).toEqual(["R5", "R5 (cont.)"]);
    for (const field of r5) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
    expect(r5.flatMap((field) => field.value.split("\n"))).toHaveLength(30);
  });
});

describe("renderAllianceCard with 100 long rows", () => {
  const RANKS: readonly RosterEntry["allianceRank"][] = ["R5", "R4", "R3", "R2", "R1"];
  const hundred: RosterEntry[] = Array.from({ length: 100 }, (_, index) => ({
    uid: uid((100_000_000_000_000 + index).toString()),
    name: `${"_".repeat(30)}${index.toString().padStart(2, "0")}`,
    allianceRank: RANKS[index % RANKS.length] ?? "unknown",
  }));

  test("keeps the whole card within Discord's 6,000 characters", () => {
    const card = renderAllianceCard({ ...alliance, roster: hundred }, FETCHED_AT, NOW);

    expect(embedCharacters(card)).toBeLessThanOrEqual(6000);
  });

  test("replaces the rows that do not fit with a note counting them, pointing to the menu below", () => {
    const card = renderAllianceCard({ ...alliance, roster: hundred }, FETCHED_AT, NOW);
    const text = (card.fields ?? []).map((field) => field.value).join("\n");
    const shown = text.split("\n").filter((line) => line.includes(" · ")).length;
    const note = /… and (\d+) more, see the menu below/.exec(text);

    expect(note).not.toBeNull();
    expect(shown + Number(note?.[1])).toBe(100);
  });
});

describe("renderAllianceCard with an empty roster", () => {
  test("shows one Roster field saying the tracker lists no members", () => {
    const card = renderAllianceCard({ ...alliance, roster: [] }, FETCHED_AT, NOW);

    expect(card.fields?.find((field) => field.name === "Roster")).toMatchObject({
      value: "The tracker lists no members.",
    });
  });
});

describe("renderRosterComponents", () => {
  function members(count: number): RosterEntry[] {
    return Array.from({ length: count }, (_, index) =>
      rosterEntry((100_000_000_000 + index).toString(), `M${index.toString().padStart(2, "0")}`, "R4"),
    );
  }

  test("offers one select menu of the members, placeholder Look up a member…, valued by index on the page", () => {
    expect(renderRosterComponents(members(3), 0, "a1b2c3d4")).toMatchObject([
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: "pick:a1b2c3d4:select",
            placeholder: "Look up a member…",
            options: [
              { label: "R4 · M00", description: "uid 100000000000", value: "0" },
              { label: "R4 · M01", description: "uid 100000000001", value: "1" },
              { label: "R4 · M02", description: "uid 100000000002", value: "2" },
            ],
          },
        ],
      },
    ]);
  });

  test("labels a member without a known rank as Unknown", () => {
    expect(renderRosterComponents([rosterEntry("42", "Unnamed", "unknown")], 0, "a1b2c3d4")).toMatchObject([
      { components: [{ options: [{ label: "Unknown · Unnamed", value: "0" }] }] },
    ]);
  });

  test("has only the select menu while the roster fits on one page of 25", () => {
    expect(renderRosterComponents(members(25), 0, "a1b2c3d4")).toHaveLength(1);
  });

  test("has no components for an empty roster", () => {
    expect(renderRosterComponents([], 0, "a1b2c3d4")).toEqual([]);
  });

  test("adds a row of page buttons past 25 members, with Next and the disabled Page 1/2 on the first page", () => {
    const rows = renderRosterComponents(members(26), 0, "a1b2c3d4");

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      type: ComponentType.ActionRow,
      components: expect.arrayContaining([
        expect.objectContaining({ type: ComponentType.Button, label: "Next ▶", custom_id: "pick:a1b2c3d4:page:1" }),
        expect.objectContaining({ type: ComponentType.Button, label: "Page 1/2", disabled: true }),
      ]) as unknown,
    });
  });

  test("on a middle page, shows Page 2/3 disabled, with Previous and Next pointing to the pages either side", () => {
    const rows = renderRosterComponents(members(60), 1, "a1b2c3d4");

    expect(rows[1]).toMatchObject({
      components: expect.arrayContaining([
        expect.objectContaining({ label: "◀ Previous", custom_id: "pick:a1b2c3d4:page:0" }),
        expect.objectContaining({ label: "Page 2/3", disabled: true }),
        expect.objectContaining({ label: "Next ▶", custom_id: "pick:a1b2c3d4:page:2" }),
      ]) as unknown,
    });
  });

  test("gives each page its own options, valued from 0, so the last page holds only the rest", () => {
    const rows = renderRosterComponents(members(30), 1, "a1b2c3d4");

    expect(rows[0]).toMatchObject({
      components: [
        {
          options: [
            { label: "R4 · M25", value: "0" },
            { label: "R4 · M26", value: "1" },
            { label: "R4 · M27", value: "2" },
            { label: "R4 · M28", value: "3" },
            { label: "R4 · M29", value: "4" },
          ],
        },
      ],
    });
  });
});

describe("renderAlliancePickList", () => {
  const unordered: readonly Match[] = [
    { tag: "NMX", name: "No Man's Land", kingdom: 180 },
    { tag: "NML", name: "No Man's Land", kingdom: 1 },
    { name: "No Tag", kingdom: 5 },
  ];

  test("asks which alliance is meant, naming the typed name, with no note when every match is listed", () => {
    expect(renderAlliancePickList(allianceKey("No Man's Land"), unordered, "a1b2c3d4")).toMatchObject({
      content: "Several alliances are named \"No Man's Land\". Pick one:",
    });
  });

  test("offers only matches with a tag and a Kingdom, ordered by Kingdom, valued by index in that order", () => {
    expect(renderAlliancePickList(allianceKey("No Man's Land"), unordered, "a1b2c3d4")).toMatchObject({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: "pick:a1b2c3d4:select",
              options: [
                { label: "[NML] No Man's Land · kingdom #1", value: "0" },
                { label: "[NMX] No Man's Land · kingdom #180", value: "1" },
              ],
            },
          ],
        },
      ],
    });
  });

  test("escapes the typed name in the question", () => {
    expect(renderAlliancePickList(allianceKey("N_M"), unordered, "a1b2c3d4")).toMatchObject({
      content: 'Several alliances are named "N\\_M". Pick one:',
    });
  });

  test("offers only the first 25 by Kingdom, values 0 to 24, and says how to narrow the list", () => {
    const thirty: readonly Match[] = Array.from({ length: 30 }, (_, index) => ({
      tag: `T${index.toString().padStart(2, "0")}`,
      name: "Clan",
      kingdom: index + 1,
    })).reverse();

    const pickList = renderAlliancePickList(allianceKey("Clan"), thirty, "a1b2c3d4");

    expect(pickList.content).toContain("Only the first 25 are listed; use the kingdom and tag.");
    expect(pickList.components).toMatchObject([
      {
        components: [
          {
            custom_id: "pick:a1b2c3d4:select",
            options: Array.from({ length: 25 }, (_, index) => ({
              label: `[T${index.toString().padStart(2, "0")}] Clan · kingdom #${(index + 1).toString()}`,
              value: index.toString(),
            })),
          },
        ],
      },
    ]);
  });
});

describe("lookupMessages for /alliance by name", () => {
  test("giveKingdomAndTagOrName gives the contract's text", () => {
    expect(lookupMessages.giveKingdomAndTagOrName).toBe(
      "Give the kingdom and the alliance tag, or the alliance's exact full name.",
    );
  });

  test("allianceNameNotFound names the name and says approximate names are not supported", () => {
    expect(lookupMessages.allianceNameNotFound(allianceKey("No Such Land"))).toBe(
      'No alliance is named exactly "No Such Land". Use the full name, or the kingdom and tag; approximate names are not supported.',
    );
  });

  test("allianceNameNotFound escapes the name as typed", () => {
    expect(lookupMessages.allianceNameNotFound(allianceKey("N_M*"))).toBe(
      'No alliance is named exactly "N\\_M\\*". Use the full name, or the kingdom and tag; approximate names are not supported.',
    );
  });
});
