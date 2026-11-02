import {
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type APIEmbedField,
} from "discord.js";
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
import type {
  Alliance,
  AllianceDetails,
  Match,
  Player,
  PlayerDetails,
  RosterEntry,
} from "../domain/player.js";
import {
  compactNumber,
  joinRequirementsText,
  languageName,
  lookupMessages,
  renderAllianceCard,
  renderAllianceComponents,
  renderAlliancePickList,
  renderCloseAlliancePickList,
  renderPlayerCard,
  renderPlayerPickList,
  renderRosterComponents,
  timeAgo,
  timeLeft,
  trackerPicture,
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
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: undefined },
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

  test("shows Power, Sanctuary level, Alliance and Alliance Rank as inline fields, with the Kingdom in the author line", () => {
    expect(renderPlayerCard(inAlliance, FETCHED_AT, NOW)).toMatchObject({
      author: { name: "Kingdom #330" },
      fields: [
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
        { name: "Power", value: "15,902,728" },
        { name: "Sanctuary level", value: "42" },
        { name: "Alliance", value: "No alliance" },
      ],
    });
    expect(card.fields?.map((field) => field.name)).not.toContain("Alliance Rank");
  });

  test("shows no uid anywhere on the card, lookups never show one", () => {
    expect(JSON.stringify(renderPlayerCard(inAlliance, FETCHED_AT, NOW))).not.toContain("145563254785");
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
      alliance: { tag: "NML", name: "_Tilted_ ~Men~", leaderUid: undefined },
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

  test("shows Power, Members as count/capacity, and Leader as inline fields, before the roster, with the Kingdom in the author line", () => {
    const card = renderAllianceCard(alliance, FETCHED_AT, NOW);
    const fields = card.fields ?? [];

    expect(card).toMatchObject({ author: { name: "Kingdom #1" } });
    expect(fields.slice(0, 3)).toEqual([
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

describe("lookupMessages.reserveKept", () => {
  test("says the lookups are paused for today, the rest of the Daily Quota is kept for interviews, and gives the reset time with the time left", () => {
    expect(
      lookupMessages.reserveKept(new Date("2026-10-31T00:00:00Z"), new Date("2026-10-30T20:48:00Z")),
    ).toBe(
      "Lookups are paused for today: the rest of the Daily Quota is kept for interviewing new members. They work again at 00:00 UTC (in 3 h 12 min).",
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

  test("offers the matches in one select menu, ordered by Kingdom, each labelled by its Player Name and described by its Kingdom, valued by index in that order", () => {
    expect(renderPlayerPickList(playerName("DrLOL"), unordered, "a1b2c3d4")).toMatchObject({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: "pick:a1b2c3d4:select",
              options: [
                { label: "DrLOL", description: "Kingdom #1", value: "0" },
                { label: "Vex", description: "Kingdom #330", value: "1" },
              ],
            },
          ],
        },
      ],
    });
  });

  test("shows no uid in the Player pick list", () => {
    const text = JSON.stringify(renderPlayerPickList(playerName("DrLOL"), unordered, "a1b2c3d4"));

    expect(text).not.toContain("145563254785");
    expect(text).not.toContain("100000000002");
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
                label: `P${index.toString()}`,
                description: `Kingdom #${(index + 1).toString()}`,
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
  return { uid: uid(uidText), name, allianceRank, kingdom: undefined, sanctuaryLevel: undefined, weeklyActivity: undefined, dailyHonor: undefined, dailyTech: undefined, online: undefined, lastOnlineAt: undefined };
}

function fieldValue(embed: APIEmbed, name: string): string | undefined {
  return embed.fields?.find((field) => field.name === name)?.value;
}

/** Every character Discord counts toward an embed's 6,000: title, author name, description, footer and each field's name and value. */
function embedCharacters(embed: APIEmbed): number {
  const parts = [
    embed.title ?? "",
    embed.author?.name ?? "",
    embed.description ?? "",
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
      "Power",
      "Members",
      "Leader",
      "R4",
      "R3",
      "R1",
      "Unknown",
    ]);
  });

  test("lists each Player by name alone, sorted by name ignoring case within the rank", () => {
    const card = renderAllianceCard({ ...alliance, roster }, FETCHED_AT, NOW);

    expect(fieldValue(card, "R4")).toBe("Ana\netranger");
    expect(fieldValue(card, "R3")).toBe("Benedict");
    expect(fieldValue(card, "Unknown")).toBe("Unnamed");
  });

  test("shows no uid in any roster row", () => {
    const card = renderAllianceCard({ ...alliance, roster }, FETCHED_AT, NOW);

    expect(JSON.stringify(card)).not.toMatch(/93159425|179060285441|147744374785|5555|"42"/);
  });

  test("escapes the Player's name in each row", () => {
    const card = renderAllianceCard({ ...alliance, roster: [rosterEntry("5555", "_Ana_", "R4")] }, FETCHED_AT, NOW);

    expect(fieldValue(card, "R4")).toBe("\\_Ana\\_");
  });

  test("continues an Alliance Rank whose rows pass 1,024 characters in a field named R5 (cont.)", () => {
    const longRoster: RosterEntry[] = Array.from({ length: 25 }, (_, index) =>
      rosterEntry((100_000_000_000 + index).toString(), `${"N".repeat(40)}${index.toString().padStart(2, "0")}`, "R5"),
    );
    const fields = renderAllianceCard({ ...alliance, roster: longRoster }, FETCHED_AT, NOW).fields ?? [];
    const r5 = fields.filter((field) => field.name === "R5" || field.name === "R5 (cont.)");

    expect(r5.map((field) => field.name)).toEqual(["R5", "R5 (cont.)"]);
    for (const field of r5) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
    expect(r5.flatMap((field) => field.value.split("\n"))).toHaveLength(25);
  });
});

describe("renderAllianceCard with 100 long rows", () => {
  const RANKS: readonly RosterEntry["allianceRank"][] = ["R5", "R4", "R3", "R2", "R1"];
  const hundred: RosterEntry[] = Array.from({ length: 100 }, (_, index) => ({
    uid: uid((100_000_000_000_000 + index).toString()),
    name: `${"_".repeat(30)}${index.toString().padStart(2, "0")}`,
    allianceRank: RANKS[index % RANKS.length] ?? "unknown",
    kingdom: undefined,
    sanctuaryLevel: undefined,
    weeklyActivity: undefined,
    dailyHonor: undefined,
    dailyTech: undefined,
    online: undefined,
    lastOnlineAt: undefined,
  }));

  test("keeps the whole card within Discord's 6,000 characters", () => {
    const card = renderAllianceCard({ ...alliance, roster: hundred }, FETCHED_AT, NOW);

    expect(embedCharacters(card)).toBeLessThanOrEqual(6000);
  });

  test("lists only the 25 rows of the first page", () => {
    const card = renderAllianceCard({ ...alliance, roster: hundred }, FETCHED_AT, NOW);

    expect(rosterRowsOf(card)).toHaveLength(25);
  });
});

/** The member rows an Alliance card lists, in order: the three Alliance fields come first, then the roster fields. */
function rosterRowsOf(card: APIEmbed): string[] {
  return (card.fields ?? []).slice(3).flatMap((field) => field.value.split("\n"));
}

describe("renderAllianceCard on a page of a roster of 100", () => {
  const members: RosterEntry[] = Array.from({ length: 100 }, (_value, index) =>
    rosterEntry((100_000_000_000 + index).toString(), `M${index.toString().padStart(2, "0")}`, "R4"),
  );

  /** The row the card shows for the member at this index of the menu order: the name alone, no uid. */
  function rowOf(index: number): string {
    return `M${index.toString().padStart(2, "0")}`;
  }

  /** The 25 rows of a page, starting at the member index the page begins with. */
  function pageRows(start: number): string[] {
    return Array.from({ length: 25 }, (_value, offset) => rowOf(start + offset));
  }

  test("lists exactly the first 25 members, in menu order, on page 0", () => {
    const card = renderAllianceCard({ ...alliance, roster: [...members].reverse() }, FETCHED_AT, NOW, 0);

    expect(rosterRowsOf(card)).toEqual(pageRows(0));
  });

  test("lists exactly the last 25 members on page 3", () => {
    const card = renderAllianceCard({ ...alliance, roster: members }, FETCHED_AT, NOW, 3);

    expect(rosterRowsOf(card)).toEqual(pageRows(75));
  });

  test("clamps a page past the last one to the last page", () => {
    const card = renderAllianceCard({ ...alliance, roster: members }, FETCHED_AT, NOW, 9);

    expect(rosterRowsOf(card)).toEqual(pageRows(75));
  });

  test("keeps the Alliance fields the same on every page", () => {
    const first = renderAllianceCard({ ...alliance, roster: members }, FETCHED_AT, NOW, 0);
    const last = renderAllianceCard({ ...alliance, roster: members }, FETCHED_AT, NOW, 3);

    expect(last.fields?.slice(0, 3)).toEqual(first.fields?.slice(0, 3));
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

  test("offers one select menu of the members, placeholder Look up a member…, each labelled by name and described by its Alliance Rank, valued by index on the page", () => {
    expect(renderRosterComponents(members(3), 0, "a1b2c3d4")).toMatchObject([
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.StringSelect,
            custom_id: "pick:a1b2c3d4:select:0",
            placeholder: "Look up a member…",
            options: [
              { label: "M00", description: "R4", value: "0" },
              { label: "M01", description: "R4", value: "1" },
              { label: "M02", description: "R4", value: "2" },
            ],
          },
        ],
      },
    ]);
  });

  test("shows no uid in the roster menu's labels or descriptions", () => {
    const text = JSON.stringify(renderRosterComponents(members(3), 0, "a1b2c3d4"));

    expect(text).not.toMatch(/10000000000[0-2]/);
  });

  test("describes a member without a known rank as Unknown", () => {
    expect(renderRosterComponents([rosterEntry("42", "Unnamed", "unknown")], 0, "a1b2c3d4")).toMatchObject([
      { components: [{ options: [{ label: "Unnamed", description: "Unknown", value: "0" }] }] },
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
            { label: "M25", description: "R4", value: "0" },
            { label: "M26", description: "R4", value: "1" },
            { label: "M27", description: "R4", value: "2" },
            { label: "M28", description: "R4", value: "3" },
            { label: "M29", description: "R4", value: "4" },
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

describe("renderCloseAlliancePickList", () => {
  test("labels each close Known Alliance as plain [TAG] Name, without escaping its markdown characters", () => {
    const pickList = renderCloseAlliancePickList(
      allianceKey("no mans"),
      [{ tag: "NML", name: "No_Man's *Land*", kingdom: 330 }],
      "a1b2c3d4",
    );

    expect(optionLabelsOf(pickList.components)).toEqual(["[NML] No_Man's *Land*"]);
  });

  test("escapes the typed name in the question, not in the labels", () => {
    const pickList = renderCloseAlliancePickList(
      allianceKey("no_mans*"),
      [{ tag: "NML", name: "No_Man's *Land*", kingdom: 330 }],
      "a1b2c3d4",
    );

    expect(pickList.content).toBe('No alliance is named "no\\_mans\\*". Did you mean one of these?');
    expect(optionLabelsOf(pickList.components)).toEqual(["[NML] No_Man's *Land*"]);
  });

  test("lists the matches in the order given, valued by index in that order, not sorted by name", () => {
    const pickList = renderCloseAlliancePickList(
      allianceKey("wolf"),
      [
        { tag: "WLF", name: "Wolfpack", kingdom: 330 },
        { tag: "BWC", name: "Big Wolf Clan", kingdom: 330 },
      ],
      "a1b2c3d4",
    );

    expect(pickList.components).toMatchObject([
      {
        components: [
          {
            options: [
              { label: "[WLF] Wolfpack", value: "0" },
              { label: "[BWC] Big Wolf Clan", value: "1" },
            ],
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

  test("allianceNameNotFound names the name, says none is close and points to the tag or a suggestion", () => {
    expect(lookupMessages.allianceNameNotFound(allianceKey("No Such Land"))).toBe(
      'No alliance is named "No Such Land", and none I know is close. Try the tag, or start typing and pick a suggestion.',
    );
  });

  test("allianceNameNotFound escapes the name as typed", () => {
    expect(lookupMessages.allianceNameNotFound(allianceKey("N_M*"))).toBe(
      'No alliance is named "N\\_M\\*", and none I know is close. Try the tag, or start typing and pick a suggestion.',
    );
  });
});

function rosterMembers(count: number): RosterEntry[] {
  return Array.from({ length: count }, (_, index) =>
    rosterEntry((100_000_000_000 + index).toString(), `M${index.toString().padStart(2, "0")}`, "R4"),
  );
}

/** The custom ids of every component in the rows that have one; link buttons have none. */
function customIdsOf(rows: readonly APIActionRowComponent<APIComponentInMessageActionRow>[]): string[] {
  return rows.flatMap((row) =>
    row.components.flatMap((component) => ("custom_id" in component ? [component.custom_id] : [])),
  );
}

describe("renderRosterComponents custom ids are unique within the message", () => {
  test.each([26, 50, 60, 100])("gives every component of a %d-member roster its own custom id on every page", (count) => {
    const pages = Math.ceil(count / 25);
    for (let page = 0; page < pages; page += 1) {
      const ids = customIdsOf(renderRosterComponents(rosterMembers(count), page, "a1b2c3d4"));

      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("gives the disabled Page indicator the custom id pick:{id}:info", () => {
    const rows = renderRosterComponents(rosterMembers(60), 1, "a1b2c3d4");

    expect(rows[1]).toMatchObject({
      components: expect.arrayContaining([
        expect.objectContaining({ label: "Page 2/3", disabled: true, custom_id: "pick:a1b2c3d4:info" }),
      ]) as unknown,
    });
  });
});

/** The labels of every select menu option in the rows. */
function optionLabelsOf(rows: readonly APIActionRowComponent<APIComponentInMessageActionRow>[]): string[] {
  return rows.flatMap((row) =>
    row.components.flatMap((component) =>
      component.type === ComponentType.StringSelect ? component.options.map((option) => option.label) : [],
    ),
  );
}

describe("select menu option labels stay within 100 characters", () => {
  const longName = "A".repeat(150);

  test("cuts a Player pick list label of a 150-character Game name to 100, ending with an ellipsis", () => {
    const pickList = renderPlayerPickList(
      playerName("DrLOL"),
      [{ uid: "145563254785", name: longName, kingdom: 12 }],
      "a1b2c3d4",
    );

    expect(optionLabelsOf(pickList.components)).toEqual([`${"A".repeat(99)}…`]);
  });

  test("cuts an Alliance pick list label of a 150-character Game name to 100, ending with an ellipsis", () => {
    const pickList = renderAlliancePickList(
      allianceKey("NML"),
      [{ tag: "NML", name: longName, kingdom: 1 }],
      "a1b2c3d4",
    );

    expect(optionLabelsOf(pickList.components)).toEqual([`[NML] ${"A".repeat(93)}…`]);
  });

  test("cuts a roster menu label of a 150-character Game name to 100, ending with an ellipsis", () => {
    const roster = [rosterEntry("145563254785", longName, "R4")];

    expect(optionLabelsOf(renderRosterComponents(roster, 0, "a1b2c3d4"))).toEqual([`${"A".repeat(99)}…`]);
  });
});

/** The buttons of the rows, the ones with a custom id (the Overview button and the page buttons). */
function buttonsWithCustomIdOf(
  rows: readonly APIActionRowComponent<APIComponentInMessageActionRow>[],
): APIButtonComponentWithCustomId[] {
  return rows.flatMap((row) =>
    row.components.filter(
      (component): component is APIButtonComponentWithCustomId =>
        component.type === ComponentType.Button && "custom_id" in component,
    ),
  );
}

describe("renderAllianceComponents", () => {
  const SESSION_ID = "a1b2c3d4";

  test("puts an Overview button in a row after the roster menu, its custom id starting with the pick session, for any Member", () => {
    const rows = renderAllianceComponents({ ...alliance, roster: rosterMembers(3) }, 0, SESSION_ID);

    expect(rows[0]).toMatchObject({ components: [{ type: ComponentType.StringSelect }] });
    expect(buttonsWithCustomIdOf(rows.slice(1))).toEqual([
      expect.objectContaining({
        label: "Overview",
        custom_id: expect.stringMatching(new RegExp(`^pick:${SESSION_ID}:overview`)) as unknown,
      }) as unknown,
    ]);
  });
});

/** The accent color both cards use. */
const ACCENT_COLOR = 0xb33a3a;
const TRACKER = "https://lastasylumtracker.com";
const EMPTY_ROSTER_FIELD: APIEmbedField = { name: "Roster", value: "The tracker lists no members." };

const fullPlayerDetails: PlayerDetails = {
  kills: 4420,
  vipLevel: 4,
  likes: 110,
  lastOnlineAt: new Date("2026-10-28T02:25:02Z"),
  language: "en",
  location: { x: 807, y: 846 },
  avatarPath: "/static/avatars/head_90002.png",
  kingdomBadgePath: "/static/kingdom/badge_1.png",
};

const fullPlayer: Player = { ...inAlliance, details: fullPlayerDetails };

/** The Player card's fields for `fullPlayerDetails`, in the order the card shows them. */
const fullPlayerFields: APIEmbedField[] = [
  { name: "Power", value: "15,902,728", inline: true },
  { name: "Kills", value: "4,420", inline: true },
  { name: "Likes", value: "110", inline: true },
  { name: "Sanctuary level", value: "42", inline: true },
  { name: "VIP Level", value: "4", inline: true },
  { name: "Language", value: "English", inline: true },
  { name: "Alliance", value: "[NML] Neil's Men", inline: true },
  { name: "Alliance Rank", value: "R5", inline: true },
  { name: "Location", value: "X:807 Y:846", inline: true },
];

const fullPlayerCard: APIEmbed = {
  title: "Vex",
  color: ACCENT_COLOR,
  author: { name: "Kingdom #330", icon_url: `${TRACKER}/static/kingdom/badge_1.png` },
  thumbnail: { url: `${TRACKER}/static/avatars/head_90002.png` },
  description: "Last online 2 days ago",
  fields: fullPlayerFields,
  footer: { text: "Data from Last Asylum Tracker · as of 14:05 UTC" },
};

const noDetailsPlayerCard: APIEmbed = {
  title: "Vex",
  color: ACCENT_COLOR,
  author: { name: "Kingdom #330" },
  fields: [
    { name: "Power", value: "15,902,728", inline: true },
    { name: "Sanctuary level", value: "42", inline: true },
    { name: "Alliance", value: "[NML] Neil's Men", inline: true },
    { name: "Alliance Rank", value: "R5", inline: true },
  ],
  footer: { text: "Data from Last Asylum Tracker · as of 14:05 UTC" },
};

describe("renderPlayerCard with details", () => {
  test("shows the full card: accent color, Kingdom badge beside the Kingdom, avatar, Last Online, and the fields in order", () => {
    expect(renderPlayerCard(fullPlayer, FETCHED_AT, NOW)).toEqual(fullPlayerCard);
  });

  test.each([
    { label: "Kills", details: { kills: undefined }, field: "Kills" },
    { label: "VIP Level", details: { vipLevel: undefined }, field: "VIP Level" },
    { label: "Likes", details: { likes: undefined }, field: "Likes" },
    { label: "Language", details: { language: undefined }, field: "Language" },
    { label: "Location", details: { location: undefined }, field: "Location" },
  ])("leaves only $label off the card when the Game gives none", ({ details, field }) => {
    const card = renderPlayerCard({ ...inAlliance, details: { ...fullPlayerDetails, ...details } }, FETCHED_AT, NOW);

    expect(card).toEqual({ ...fullPlayerCard, fields: fullPlayerFields.filter((item) => item.name !== field) });
  });

  test.each([
    { label: "Last Online", details: { lastOnlineAt: undefined }, change: { description: undefined } },
    { label: "avatar", details: { avatarPath: undefined }, change: { thumbnail: undefined } },
    {
      label: "Kingdom badge",
      details: { kingdomBadgePath: undefined },
      change: { author: { name: "Kingdom #330" } },
    },
  ])("leaves only the $label off the card when the Game gives none", ({ details, change }) => {
    const card = renderPlayerCard({ ...inAlliance, details: { ...fullPlayerDetails, ...details } }, FETCHED_AT, NOW);

    expect(card).toEqual({ ...fullPlayerCard, ...change });
  });

  test("renders a Player whose details are all unknown as one without details", () => {
    const allUnknown: PlayerDetails = {
      kills: undefined,
      vipLevel: undefined,
      likes: undefined,
      lastOnlineAt: undefined,
      language: undefined,
      location: undefined,
      avatarPath: undefined,
      kingdomBadgePath: undefined,
    };

    expect(renderPlayerCard({ ...inAlliance, details: allUnknown }, FETCHED_AT, NOW)).toEqual(noDetailsPlayerCard);
  });

  test("leaves out a picture whose path is not a tracker /static/ path", () => {
    const card = renderPlayerCard(
      {
        ...inAlliance,
        details: {
          ...fullPlayerDetails,
          avatarPath: "https://evil.example/head.png",
          kingdomBadgePath: "/static/../secret.png",
        },
      },
      FETCHED_AT,
      NOW,
    );

    expect(card).toEqual({ ...fullPlayerCard, thumbnail: undefined, author: { name: "Kingdom #330" } });
  });

  test("shows No alliance and no Alliance Rank with the details", () => {
    const card = renderPlayerCard({ ...withoutAlliance, details: fullPlayerDetails }, FETCHED_AT, NOW);

    expect(card.fields?.find((field) => field.name === "Alliance")).toEqual({
      name: "Alliance",
      value: "No alliance",
      inline: true,
    });
    expect(card.fields?.map((field) => field.name)).not.toContain("Alliance Rank");
  });
});

describe("renderPlayerCard without details", () => {
  test("shows today's card, with the Kingdom in the author line and no picture, description or Kingdom field", () => {
    expect(renderPlayerCard(inAlliance, FETCHED_AT, NOW)).toEqual(noDetailsPlayerCard);
  });
});

describe("timeAgo", () => {
  const MINUTE_MS = 60_000;
  const HOUR_MS = 60 * MINUTE_MS;
  const DAY_MS = 24 * HOUR_MS;

  test.each([
    { label: "59 s ago, under a minute", ms: MINUTE_MS - 1000, text: "just now" },
    { label: "5 min in the future, clock skew", ms: -5 * MINUTE_MS, text: "just now" },
    { label: "exactly 1 min", ms: MINUTE_MS, text: "1 min ago" },
    { label: "59 min 59 s, minutes rounded down", ms: HOUR_MS - 1000, text: "59 min ago" },
    { label: "exactly 1 h", ms: HOUR_MS, text: "1 h ago" },
    { label: "23 h 59 min, hours rounded down", ms: DAY_MS - MINUTE_MS, text: "23 h ago" },
    { label: "exactly 24 h", ms: DAY_MS, text: "1 day ago" },
    { label: "47 h, days rounded down", ms: 2 * DAY_MS - HOUR_MS, text: "1 day ago" },
    { label: "3 days", ms: 3 * DAY_MS, text: "3 days ago" },
    { label: "400 days, beyond a year", ms: 400 * DAY_MS, text: "400 days ago" },
  ])("$label reads as $text", ({ ms, text }) => {
    expect(timeAgo(new Date(NOW.getTime() - ms), NOW)).toBe(text);
  });
});

describe("compactNumber", () => {
  test.each([
    { n: 0, text: "0" },
    { n: 999, text: "999" },
    { n: 1_000, text: "1K" },
    { n: 1_500, text: "1.5K" },
    { n: 12_000, text: "12K" },
    { n: 999_949, text: "999.9K" },
    { n: 999_950, text: "1M" },
    { n: 1_000_000, text: "1M" },
    { n: 27_626_362, text: "27.6M" },
    { n: 1_000_000_000, text: "1B" },
    { n: 1_500_000_000, text: "1.5B" },
  ])("$n reads as $text", ({ n, text }) => {
    expect(compactNumber(n)).toBe(text);
  });
});

describe("languageName", () => {
  test.each([
    { code: "ja", name: "Japanese" },
    { code: "en", name: "English" },
    { code: "xx", name: "XX" },
    { code: "ab!", name: "AB!" },
  ])("$code reads as $name", ({ code, name }) => {
    expect(languageName(code)).toBe(name);
  });
});

describe("trackerPicture", () => {
  test("prefixes a /static/ path with the tracker's own address", () => {
    expect(trackerPicture("/static/avatars/head_90002.png")).toBe(
      "https://lastasylumtracker.com/static/avatars/head_90002.png",
    );
  });
});

describe("joinRequirementsText", () => {
  test.each([
    { label: "open, no minimums", open: true, minimumPower: 0, minimumSanctuaryLevel: 0, text: "Open to all" },
    {
      label: "by application, no minimums",
      open: false,
      minimumPower: 0,
      minimumSanctuaryLevel: 0,
      text: "By application",
    },
    {
      label: "open, minimum power 10M",
      open: true,
      minimumPower: 10_000_000,
      minimumSanctuaryLevel: 0,
      text: "Open to all · min. 10M power",
    },
    {
      label: "by application, minimum sanctuary level 15",
      open: false,
      minimumPower: 0,
      minimumSanctuaryLevel: 15,
      text: "By application · min. sanctuary level 15",
    },
    {
      label: "open, both minimums",
      open: true,
      minimumPower: 10_000_000,
      minimumSanctuaryLevel: 15,
      text: "Open to all · min. 10M power · min. sanctuary level 15",
    },
    {
      label: "minimum power 1,000",
      open: false,
      minimumPower: 1_000,
      minimumSanctuaryLevel: 0,
      text: "By application · min. 1K power",
    },
  ])("$label reads as $text", ({ open, minimumPower, minimumSanctuaryLevel, text }) => {
    expect(joinRequirementsText({ open, minimumPower, minimumSanctuaryLevel })).toBe(text);
  });
});

const fullAllianceDetails: AllianceDetails = {
  level: 4,
  xp: 8_881_750,
  giftLevel: 6,
  kingdomPowerRank: 24,
  language: "ja",
  joinRequirements: { open: true, minimumPower: 0, minimumSanctuaryLevel: 0 },
  badgePath: "/static/alliance/badge_103.png",
  kingdomBadgePath: "/static/kingdom/badge_1.png",
};

const fullAlliance: Alliance = { ...alliance, details: fullAllianceDetails };

/** The Alliance fields for `fullAllianceDetails`, in the order the card shows them. */
const fullAllianceFields: APIEmbedField[] = [
  { name: "Power", value: "208,815,434", inline: true },
  { name: "Kingdom Power Rank", value: "#24 in Kingdom #1", inline: true },
  { name: "Members", value: "52/100", inline: true },
  { name: "Leader", value: "DrLOL", inline: true },
  { name: "Alliance Level", value: "Level 4 · 8,881,750 XP", inline: true },
  { name: "Gift Level", value: "6", inline: true },
  { name: "Language", value: "Japanese", inline: true },
];

const fullAllianceCard: APIEmbed = {
  title: "[NML] No Man's Land",
  color: ACCENT_COLOR,
  author: { name: "Kingdom #1", icon_url: `${TRACKER}/static/kingdom/badge_1.png` },
  thumbnail: { url: `${TRACKER}/static/alliance/badge_103.png` },
  description: "Open to all",
  fields: [...fullAllianceFields, EMPTY_ROSTER_FIELD],
  footer: { text: "Data from Last Asylum Tracker · as of 14:05 UTC" },
};

const noDetailsAllianceCard: APIEmbed = {
  title: "[NML] No Man's Land",
  color: ACCENT_COLOR,
  author: { name: "Kingdom #1" },
  fields: [
    { name: "Power", value: "208,815,434", inline: true },
    { name: "Members", value: "52/100", inline: true },
    { name: "Leader", value: "DrLOL", inline: true },
    EMPTY_ROSTER_FIELD,
  ],
  footer: { text: "Data from Last Asylum Tracker · as of 14:05 UTC" },
};

describe("renderAllianceCard with details", () => {
  test("shows the full card: accent color, Kingdom badge beside the Kingdom, Alliance badge, Join Requirements, and the fields in order", () => {
    expect(renderAllianceCard(fullAlliance, FETCHED_AT, NOW)).toEqual(fullAllianceCard);
  });

  test("shows the Alliance Level as Level alone when the XP is missing", () => {
    const card = renderAllianceCard(
      { ...alliance, details: { ...fullAllianceDetails, xp: undefined } },
      FETCHED_AT,
      NOW,
    );

    expect(fieldValue(card, "Alliance Level")).toBe("Level 4");
  });

  test.each([
    { label: "Kingdom Power Rank", details: { kingdomPowerRank: undefined }, field: "Kingdom Power Rank" },
    { label: "Alliance Level", details: { level: undefined, xp: undefined }, field: "Alliance Level" },
    { label: "Gift Level", details: { giftLevel: undefined }, field: "Gift Level" },
    { label: "Language", details: { language: undefined }, field: "Language" },
  ])("leaves only $label off the card when the Game gives none", ({ details, field }) => {
    const card = renderAllianceCard({ ...alliance, details: { ...fullAllianceDetails, ...details } }, FETCHED_AT, NOW);

    expect(card.fields).toEqual([...fullAllianceFields.filter((item) => item.name !== field), EMPTY_ROSTER_FIELD]);
  });

  test.each([
    {
      label: "Join Requirements",
      details: { joinRequirements: undefined },
      change: { description: undefined },
    },
    { label: "Alliance badge", details: { badgePath: undefined }, change: { thumbnail: undefined } },
    {
      label: "Kingdom badge",
      details: { kingdomBadgePath: undefined },
      change: { author: { name: "Kingdom #1" } },
    },
  ])("leaves only the $label off the card when the Game gives none", ({ details, change }) => {
    const card = renderAllianceCard({ ...alliance, details: { ...fullAllianceDetails, ...details } }, FETCHED_AT, NOW);

    expect(card).toEqual({ ...fullAllianceCard, ...change });
  });

  test("shows today's card without the Kingdom field when the details are missing", () => {
    expect(renderAllianceCard(alliance, FETCHED_AT, NOW)).toEqual(noDetailsAllianceCard);
  });
});

function rosterEntryWithPower(
  uidText: string,
  name: string,
  allianceRank: RosterEntry["allianceRank"],
  power: number,
): RosterEntry {
  return { ...rosterEntry(uidText, name, allianceRank), power };
}

describe("renderAllianceCard roster rows with power", () => {
  test("shows each row's power in short form after the name, and only the name when the power is unknown", () => {
    const card = renderAllianceCard(
      {
        ...alliance,
        roster: [rosterEntryWithPower("5555", "Ana", "R4", 27_626_362), rosterEntry("42", "Benedict", "R3")],
      },
      FETCHED_AT,
      NOW,
    );

    expect(fieldValue(card, "R4")).toBe("Ana · 27.6M");
    expect(fieldValue(card, "R3")).toBe("Benedict");
  });

  test("escapes the name in a row that shows power", () => {
    const card = renderAllianceCard(
      { ...alliance, roster: [rosterEntryWithPower("5555", "_Ana_", "R4", 27_626_362)] },
      FETCHED_AT,
      NOW,
    );

    expect(fieldValue(card, "R4")).toBe("\\_Ana\\_ · 27.6M");
  });
});

describe("renderAllianceCard with a page of 25 rows of 100-character names and power", () => {
  const longRows: RosterEntry[] = Array.from({ length: 25 }, (_value, index) =>
    rosterEntryWithPower(
      (100_000_000_000 + index).toString(),
      `${"N".repeat(96)}${index.toString().padStart(4, "0")}`,
      "R4",
      27_626_362,
    ),
  );

  test("keeps the whole card within Discord's 6,000 characters", () => {
    const card = renderAllianceCard({ ...fullAlliance, roster: longRows }, FETCHED_AT, NOW);

    expect(embedCharacters(card)).toBeLessThanOrEqual(6000);
  });

  test("keeps every field value within Discord's 1,024 characters", () => {
    const card = renderAllianceCard({ ...fullAlliance, roster: longRows }, FETCHED_AT, NOW);

    for (const field of card.fields ?? []) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
  });

  test("lists all 25 rows, each with its power", () => {
    const card = renderAllianceCard({ ...fullAlliance, roster: longRows }, FETCHED_AT, NOW);
    const rows = (card.fields ?? []).slice(7).flatMap((field) => field.value.split("\n"));

    expect(rows).toHaveLength(25);
    expect(rows.every((row) => row.endsWith(" · 27.6M"))).toBe(true);
  });
});

describe("renderAllianceCard with details on every page", () => {
  test("keeps the author, picture, description and Alliance fields the same on every page", () => {
    const members: RosterEntry[] = Array.from({ length: 100 }, (_value, index) =>
      rosterEntryWithPower(
        (100_000_000_000 + index).toString(),
        `M${index.toString().padStart(2, "0")}`,
        "R4",
        1_000_000 + index,
      ),
    );

    const first = renderAllianceCard({ ...fullAlliance, roster: members }, FETCHED_AT, NOW, 0);
    const last = renderAllianceCard({ ...fullAlliance, roster: members }, FETCHED_AT, NOW, 3);

    expect(last.author).toEqual(first.author);
    expect(last.thumbnail).toEqual(first.thumbnail);
    expect(last.description).toBe(first.description);
    expect(last.fields?.slice(0, 7)).toEqual(first.fields?.slice(0, 7));
  });
});
