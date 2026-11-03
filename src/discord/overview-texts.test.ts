import { ButtonStyle, type APIActionRowComponent, type APIButtonComponentWithCustomId, type APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
import type { TableSort } from "../domain/alliance-overview.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, AllianceDetails, RosterEntry } from "../domain/player.js";
import { overviewCustomId, parseOverviewCustomId, renderOverview, type OverviewReply } from "./overview-texts.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const FETCHED_AT = new Date("2026-11-02T10:00:00Z");
const SESSION = "a1b2c3d4e5f60718";
const DESCRIPTION_MAX_LENGTH = 4096;
const FIELD_VALUE_MAX_LENGTH = 1024;
const MESSAGE_MAX_LENGTH = 6000;
const TITLE_MAX_LENGTH = 256;
/** The accent color the Player and Alliance cards share. */
const ACCENT_COLOR = 0xb33a3a;
const TRACKER = "https://lastasylumtracker.com";
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const TABLE_HEADER = "#  Name           Might  Weekly  Honor   Tech  Last";

/** The table sorts: the key in the button id, and the name the table title and the button show. */
const SORTS: readonly { readonly sort: TableSort; readonly key: string; readonly name: string }[] = [
  { sort: "might", key: "m", name: "Might" },
  { sort: "weeklyActivity", key: "w", name: "Weekly Activity" },
  { sort: "dailyHonor", key: "h", name: "Daily Honor" },
  { sort: "dailyTech", key: "t", name: "Daily Tech" },
  { sort: "lastOnline", key: "l", name: "Last Online" },
];

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

interface Figures {
  readonly might?: number;
  readonly weeklyActivity?: number;
  readonly dailyHonor?: number;
  readonly dailyTech?: number;
  readonly online?: boolean;
  readonly lastOnlineAt?: Date;
}

/** A roster member; a figure left out is undefined, as when the Game gives no data. */
function member(uidText: string, name: string, figures: Figures = {}): RosterEntry {
  return {
    uid: uid(uidText),
    name,
    allianceRank: "R3",
    kingdom: undefined,
    sanctuaryLevel: undefined,
    weeklyActivity: figures.weeklyActivity,
    dailyHonor: figures.dailyHonor,
    dailyTech: figures.dailyTech,
    online: figures.online,
    lastOnlineAt: figures.lastOnlineAt,
    ...(figures.might === undefined ? {} : { might: figures.might }),
  };
}

const allianceDetails: AllianceDetails = {
  level: 4,
  xp: 8_829_850,
  giftLevel: 6,
  kingdomMightRank: 25,
  language: "ja",
  joinRequirements: { open: true, minimumMight: 0, minimumSanctuaryLevel: 0 },
  badgePath: "/static/alliance/badge_103.png",
  kingdomBadgePath: "/static/kingdom/badge_1.png",
};

function allianceWith(roster: readonly RosterEntry[]): Alliance {
  return {
    tag: "NML",
    name: "No Man's Land",
    kingdom: kingdom(1),
    might: 208815434,
    memberCount: roster.length,
    capacity: 100,
    leaderName: "DrLOL",
    roster,
  };
}

/** The Alliance Overview of a roster, fetched at FETCHED_AT and shown at NOW, on the given page, sorted by Might. */
function overviewOf(roster: readonly RosterEntry[], page = 0): OverviewReply {
  return renderOverview(allianceWith(roster), FETCHED_AT, NOW, SESSION, page);
}

/** The Alliance Overview of a roster on the given page and sort. */
function overviewSorted(roster: readonly RosterEntry[], sort: TableSort, page = 0): OverviewReply {
  return renderOverview(allianceWith(roster), FETCHED_AT, NOW, SESSION, page, sort);
}

const alpha = member("179060285441", "Alpha", {
  might: 27_626_362,
  weeklyActivity: 490,
  dailyHonor: 40,
  dailyTech: 4600,
  online: false,
  lastOnlineAt: new Date(1793285439 * 1000),
});
const beta = member("93159425", "Beta", {
  weeklyActivity: 10,
  dailyHonor: 60,
  dailyTech: 400,
  online: true,
  lastOnlineAt: NOW,
});
const gamma = member("147744374785", "Gamma", { weeklyActivity: 5, dailyHonor: 2, dailyTech: 9, online: false });
const delta = member("300000000001", "Delta");

/** Thirty members with Might 1 to 30, Player0 to Player29, so the table takes two pages. */
const thirtyRanked = Array.from({ length: 30 }, (_value, index) =>
  member(String(100_000_000_000 + index), `Player${index.toString()}`, { might: index + 1 }),
);

function fieldValue(embed: APIEmbed | undefined, name: string): string | undefined {
  return embed?.fields?.find((field) => field.name === name)?.value;
}

function totalCharacters(embeds: readonly APIEmbed[]): number {
  return embeds.reduce((total, embed) => {
    const texts = [
      embed.title ?? "",
      embed.author?.name ?? "",
      embed.description ?? "",
      embed.footer?.text ?? "",
      ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ];
    return total + texts.reduce((sum, text) => sum + text.length, 0);
  }, 0);
}

/** The whitespace-separated words of a table line. */
function tokens(line: string | undefined): string[] {
  return (line ?? "").trim().split(/\s+/);
}

/** The lines inside the table's code block: the header line, then one line per member. */
function blockLines(embed: APIEmbed | undefined): string[] {
  const lines = (embed?.description ?? "").split("\n");
  expect(lines[0]).toBe("```");
  expect(lines.at(-1)).toBe("```");
  return lines.slice(1, -1);
}

function buttonsOf(components: readonly APIActionRowComponent<APIButtonComponentWithCustomId>[]): APIButtonComponentWithCustomId[] {
  return components.flatMap((row) => row.components);
}

describe("renderOverview: the Alliance Overview embed", () => {
  test("titles the overview with the Alliance's tag and name", () => {
    const reply = overviewOf([alpha, beta, gamma]);

    expect(reply.embeds[0]?.title).toBe("[NML] No Man's Land · Overview");
  });

  test("escapes the tag and the name in the title, and a lone ~, as the card titles do", () => {
    const alliance: Alliance = { ...allianceWith([alpha]), tag: "N*L", name: "Tilde ~ Clan" };

    const reply = renderOverview(alliance, FETCHED_AT, NOW, SESSION, 0);

    expect(reply.embeds[0]?.title).toBe("[N\\*L] Tilde \\~ Clan · Overview");
  });

  test("cuts a title longer than Discord's 256 characters, ending with an ellipsis", () => {
    const alliance: Alliance = { ...allianceWith([alpha]), name: "N".repeat(300) };

    const title = renderOverview(alliance, FETCHED_AT, NOW, SESSION, 0).embeds[0]?.title ?? "";

    expect(title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
    expect(title.endsWith("…")).toBe(true);
  });

  test("shows the sum and the average of Weekly Activity, Daily Honor and Daily Tech", () => {
    const embed = overviewOf([alpha, beta]).embeds[0];

    expect(fieldValue(embed, "Weekly Activity")).toBe("sum 500 · average 250");
    expect(fieldValue(embed, "Daily Honor")).toBe("sum 100 · average 50");
    expect(fieldValue(embed, "Daily Tech")).toBe("sum 5,000 · average 2,500");
  });

  test("leaves a member without data out of the totals, which then count only the others", () => {
    const embed = overviewOf([alpha, beta, delta]).embeds[0];

    expect(fieldValue(embed, "Weekly Activity")).toBe("sum 500 · average 250");
  });

  test("says no activity data for a figure that no member has", () => {
    const embed = overviewOf([delta]).embeds[0];

    expect(fieldValue(embed, "Weekly Activity")).toBe("no activity data");
    expect(fieldValue(embed, "Top Weekly Activity")).toBe("no activity data");
    expect(fieldValue(embed, "Least Active")).toBe("no activity data");
  });

  test("shows how many members are online now and how many were online in the last 24 hours", () => {
    const embed = overviewOf([alpha, beta, gamma]).embeds[0];

    expect(fieldValue(embed, "Online now")).toBe("2");
    expect(fieldValue(embed, "Online in the last 24 hours")).toBe("2");
  });

  test("counts the members without data in words", () => {
    const embed = overviewOf([alpha, delta]).embeds[0];

    expect(fieldValue(embed, "No data")).toBe("1 member without data");
  });

  test("lists the top 5 by each figure, highest first, with the value", () => {
    const roster = [
      member("100000000001", "Ann", { weeklyActivity: 30, dailyHonor: 1, dailyTech: 5 }),
      member("100000000002", "Ben", { weeklyActivity: 70, dailyHonor: 2, dailyTech: 6 }),
      member("100000000003", "Cy", { weeklyActivity: 10, dailyHonor: 3, dailyTech: 7 }),
      member("100000000004", "Di", { weeklyActivity: 90, dailyHonor: 4, dailyTech: 8 }),
      member("100000000005", "Ed", { weeklyActivity: 50, dailyHonor: 5, dailyTech: 9 }),
      member("100000000006", "Fi", { weeklyActivity: 20, dailyHonor: 6, dailyTech: 10 }),
      member("100000000007", "Gi", { weeklyActivity: 60, dailyHonor: 7, dailyTech: 11 }),
    ];

    const embed = overviewOf(roster).embeds[0];

    expect(fieldValue(embed, "Top Weekly Activity")).toBe("1. Di · 90\n2. Ben · 70\n3. Gi · 60\n4. Ed · 50\n5. Ann · 30");
    expect(fieldValue(embed, "Top Daily Honor")).toBe("1. Gi · 7\n2. Fi · 6\n3. Ed · 5\n4. Di · 4\n5. Cy · 3");
    expect(fieldValue(embed, "Top Daily Tech")).toBe("1. Gi · 11\n2. Fi · 10\n3. Ed · 9\n4. Di · 8\n5. Cy · 7");
  });

  test("lists the 5 Least Active by Weekly Activity, lowest first, and not the members without data", () => {
    const roster = [
      member("100000000001", "Ann", { weeklyActivity: 30 }),
      member("100000000002", "Ben", { weeklyActivity: 70 }),
      member("100000000003", "Cy", { weeklyActivity: 10 }),
      member("100000000004", "Di", { weeklyActivity: 90 }),
      member("100000000005", "Ed", { weeklyActivity: 50 }),
      member("100000000006", "Fi", { weeklyActivity: 20 }),
      member("100000000007", "Gi", { weeklyActivity: 60 }),
      member("100000000008", "Hal"),
    ];

    const embed = overviewOf(roster).embeds[0];

    expect(fieldValue(embed, "Least Active")).toBe("1. Cy · 10\n2. Fi · 20\n3. Ann · 30\n4. Ed · 50\n5. Gi · 60");
  });

  test("escapes markdown in the names of the lists", () => {
    const embed = overviewOf([member("100000000001", "*Vex*", { weeklyActivity: 5 })]).embeds[0];

    expect(fieldValue(embed, "Least Active")).toBe("1. \\*Vex\\* · 5");
  });

  test("shows no uid anywhere in the reply", () => {
    const reply = overviewOf([alpha, beta, gamma, delta]);

    const text = JSON.stringify(reply);
    expect(text).not.toContain("179060285441");
    expect(text).not.toContain("93159425");
    expect(text).not.toContain("300000000001");
  });

  test("shows when the roster was fetched in the footer, in UTC, as the card does", () => {
    const reply = overviewOf([alpha]);

    expect(reply.embeds[0]?.footer?.text).toBe("Data from Last Asylum Tracker · as of 10:00 UTC");
  });

  test("shows the day and the month of a roster fetched on an earlier day", () => {
    const reply = renderOverview(allianceWith([alpha]), new Date("2026-10-30T16:00:00Z"), NOW, SESSION, 0);

    expect(reply.embeds[0]?.footer?.text).toBe("Data from Last Asylum Tracker · as of 30 Oct 16:00 UTC");
  });

  test("keeps the whole reply within the message limit when names escape to twice their length and figures are long", () => {
    const roster = Array.from({ length: 30 }, (_, index) =>
      member(String(100_000_000_000 + index), "*".repeat(40), {
        weeklyActivity: Number.MAX_SAFE_INTEGER - index,
        dailyHonor: Number.MAX_SAFE_INTEGER - index,
        dailyTech: Number.MAX_SAFE_INTEGER - index,
        online: false,
        lastOnlineAt: NOW,
      }),
    );

    const reply = overviewOf(roster);

    expect(reply.embeds[1]?.description?.length ?? 0).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    expect(totalCharacters(reply.embeds)).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
  });
});

describe("renderOverview: the Alliance card's look", () => {
  test("gives the overview and the table the accent color of the cards", () => {
    const reply = overviewOf([alpha]);

    expect(reply.embeds[0]?.color).toBe(ACCENT_COLOR);
    expect(reply.embeds[1]?.color).toBe(ACCENT_COLOR);
  });

  test("shows the Kingdom in the author line with the Kingdom badge beside it, and the Alliance badge as the thumbnail", () => {
    const reply = renderOverview({ ...allianceWith([alpha]), details: allianceDetails }, FETCHED_AT, NOW, SESSION, 0);

    expect(reply.embeds[0]).toMatchObject({
      author: { name: "Kingdom #1", icon_url: `${TRACKER}/static/kingdom/badge_1.png` },
      thumbnail: { url: `${TRACKER}/static/alliance/badge_103.png` },
    });
  });

  test("shows the Kingdom in the author line alone, with no thumbnail, when the details are missing", () => {
    const overview = overviewOf([alpha]).embeds[0];

    expect(overview?.author).toEqual({ name: "Kingdom #1" });
    expect(overview?.thumbnail).toBeUndefined();
  });

  test("lists the overview fields in rows of three, with Least Active on a row of its own, not inline", () => {
    const fields = overviewOf([alpha, beta, gamma, delta]).embeds[0]?.fields ?? [];

    expect(fields.map(({ name, inline }) => ({ name, inline }))).toEqual([
      { name: "Weekly Activity", inline: true },
      { name: "Daily Honor", inline: true },
      { name: "Daily Tech", inline: true },
      { name: "Online now", inline: true },
      { name: "Online in the last 24 hours", inline: true },
      { name: "No data", inline: true },
      { name: "Top Weekly Activity", inline: true },
      { name: "Top Daily Honor", inline: true },
      { name: "Top Daily Tech", inline: true },
      { name: "Least Active", inline: false },
    ]);
  });
});

describe("renderOverview: the table embed", () => {
  test("shows the table as one code block, whose first line is the header", () => {
    const lines = blockLines(overviewOf([alpha]).embeds[1]);

    expect(lines[0]).toBe(TABLE_HEADER);
  });

  test("shows a row per member: rank, name, Might, the three figures in short form, and last online", () => {
    const [row] = blockLines(overviewOf([alpha]).embeds[1]).slice(1);

    expect(tokens(row)).toEqual(["1", "Alpha", "27.6M", "490", "40", "4.6K", "3d"]);
  });

  test("shows a missing figure as –, and a member online now, or with no Last Online, as online", () => {
    const rows = blockLines(overviewOf([beta, delta]).embeds[1]).slice(1);

    expect(tokens(rows[0])).toEqual(["1", "Beta", "–", "10", "60", "400", "online"]);
    expect(tokens(rows[1])).toEqual(["2", "Delta", "–", "–", "–", "–", "online"]);
  });

  test("shows the last online time as minutes, hours or days, in short form", () => {
    const roster = [
      member("100000000001", "Ann", { might: 30, online: false, lastOnlineAt: new Date(NOW.getTime() - 5 * MINUTE_MS) }),
      member("100000000002", "Ben", { might: 20, online: false, lastOnlineAt: new Date(NOW.getTime() - 3 * HOUR_MS) }),
      member("100000000003", "Cy", { might: 10, online: false, lastOnlineAt: new Date(NOW.getTime() - 2 * DAY_MS) }),
    ];

    const rows = blockLines(overviewOf(roster).embeds[1]).slice(1);

    expect(rows.map((row) => tokens(row).at(-1))).toEqual(["5m", "3h", "2d"]);
  });

  test("right-aligns each figure under the end of its column header", () => {
    const lines = blockLines(overviewOf([alpha]).embeds[1]);
    const header = lines[0] ?? "";
    const row = lines[1] ?? "";

    expect(row.indexOf("27.6M") + "27.6M".length).toBe(header.indexOf("Might") + "Might".length);
    expect(row.indexOf(" 490 ") + " 490".length).toBe(header.indexOf("Weekly") + "Weekly".length);
    expect(row.indexOf(" 40 ") + " 40".length).toBe(header.indexOf("Honor") + "Honor".length);
    expect(row.indexOf(" 4.6K ") + " 4.6K".length).toBe(header.indexOf("Tech") + "Tech".length);
  });

  test("starts the Last Online column at the same place in every row, whatever the names", () => {
    const roster = [alpha, beta, delta, member("100000000005", "Commander Anastasia the Great", { might: 5 })];

    const rows = blockLines(overviewOf(roster).embeds[1]).slice(1);

    expect(new Set(rows.map((row) => row.lastIndexOf(" ") + 1)).size).toBe(1);
  });

  test("cuts a name longer than 14 characters to 13 and an ellipsis", () => {
    const [row] = blockLines(overviewOf([member("100000000001", "Commander Anastasia the Great", { might: 5 })]).embeds[1]).slice(1);

    expect(row).toContain("Commander Ana…");
    expect(row).not.toContain("Anastasia");
  });

  test("leaves a name of exactly 14 characters as it is", () => {
    const [row] = blockLines(overviewOf([member("100000000001", "Fourteen Chars", { might: 5 })]).embeds[1]).slice(1);

    expect(row).toContain("Fourteen Chars");
    expect(row).not.toContain("…");
  });

  test("replaces a backtick in a name with ˋ, so the code block is not broken", () => {
    const embed = overviewOf([member("100000000001", "Be`st", { might: 5 })]).embeds[1];

    expect(blockLines(embed)[1]).toContain("Beˋst");
    expect(embed?.description?.split("```")).toHaveLength(3);
  });

  test("shows markdown in a name as typed, since the code block shows it as text", () => {
    const [row] = blockLines(overviewOf([member("100000000001", "*Vex*", { might: 5 })]).embeds[1]).slice(1);

    expect(row).toContain("*Vex*");
    expect(row).not.toContain("\\*");
  });

  test("puts members without Might last, after every member who has one", () => {
    const names = blockLines(overviewOf([delta, beta, alpha]).embeds[1]).slice(1).map((row) => tokens(row)[1]);

    expect(names).toEqual(["Alpha", "Beta", "Delta"]);
  });

  test.each(SORTS)("sorts the rows by $name, and titles the table with that name", ({ sort, name }) => {
    const roster = [
      member("100000000001", "Ann", { might: 30, weeklyActivity: 5, dailyHonor: 300, dailyTech: 1, online: false, lastOnlineAt: new Date(NOW.getTime() - 2 * DAY_MS) }),
      member("100000000002", "Ben", { might: 10, weeklyActivity: 50, dailyHonor: 100, dailyTech: 9, online: true }),
      member("100000000003", "Cy", { might: 20, weeklyActivity: 1, dailyHonor: 900, dailyTech: 3, online: false, lastOnlineAt: new Date(NOW.getTime() - 5 * MINUTE_MS) }),
    ];
    const expected: Readonly<Record<TableSort, readonly string[]>> = {
      might: ["Ann", "Cy", "Ben"],
      weeklyActivity: ["Ben", "Ann", "Cy"],
      dailyHonor: ["Cy", "Ann", "Ben"],
      dailyTech: ["Ben", "Cy", "Ann"],
      lastOnline: ["Ben", "Cy", "Ann"],
    };

    const table = overviewSorted(roster, sort).embeds[1];

    expect(table?.title).toBe(`Members · sorted by ${name}`);
    expect(blockLines(table).slice(1).map((row) => tokens(row)[1])).toEqual(expected[sort]);
  });

  test("gives the table the card's color and the Kingdom author with its badge, and no thumbnail", () => {
    const reply = renderOverview({ ...allianceWith([alpha]), details: allianceDetails }, FETCHED_AT, NOW, SESSION, 0);

    expect(reply.embeds[1]).toMatchObject({
      color: ACCENT_COLOR,
      author: { name: "Kingdom #1", icon_url: `${TRACKER}/static/kingdom/badge_1.png` },
    });
    expect(reply.embeds[1]?.thumbnail).toBeUndefined();
  });

  test("shows the page in the footer of the table", () => {
    expect(overviewOf(thirtyRanked, 0).embeds[1]?.footer?.text).toBe("Page 1 of 2");
    expect(overviewOf(thirtyRanked, 1).embeds[1]?.footer?.text).toBe("Page 2 of 2");
  });

  test("lists 25 members on the first page and the rest on the second, ranked by place in the sorted roster", () => {
    const first = blockLines(overviewOf(thirtyRanked, 0).embeds[1]).slice(1);
    const second = blockLines(overviewOf(thirtyRanked, 1).embeds[1]).slice(1);

    expect(first).toHaveLength(25);
    expect(second).toHaveLength(5);
    expect(tokens(first[0])[0]).toBe("1");
    expect(tokens(first[0])[1]).toBe("Player29");
    expect(tokens(second[0])[0]).toBe("26");
    expect(tokens(second[0])[1]).toBe("Player4");
  });

  test("cuts long names so the table fits the description limit and the whole reply fits the message limit", () => {
    const longName = "N".repeat(200);
    const roster = Array.from({ length: 30 }, (_, index) =>
      member(String(100_000_000_000 + index), `${longName}${index.toString()}`, {
        weeklyActivity: index + 1,
        dailyHonor: index + 1,
        dailyTech: index + 1,
        online: false,
        lastOnlineAt: NOW,
      }),
    );

    const reply = overviewOf(roster);
    const table = reply.embeds[1];

    expect(table?.description?.length ?? 0).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    expect(table?.description).toContain("…");
    for (const embed of reply.embeds) {
      for (const field of embed.fields ?? []) {
        expect(field.value.length).toBeLessThanOrEqual(FIELD_VALUE_MAX_LENGTH);
      }
    }
    expect(totalCharacters(reply.embeds)).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
  });

  test("keeps 25 rows of 100-character names with Might within the description and message limits", () => {
    const longName = "N".repeat(100);
    const roster = Array.from({ length: 25 }, (_, index) =>
      member(String(100_000_000_000 + index), `${longName}${index.toString()}`, {
        might: 27_626_362,
        weeklyActivity: index + 1,
        dailyHonor: index + 1,
        dailyTech: index + 1,
        online: false,
        lastOnlineAt: NOW,
      }),
    );

    const reply = overviewOf(roster);
    const table = reply.embeds[1];

    expect(table?.description?.length ?? 0).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH);
    expect(totalCharacters(reply.embeds)).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH);
    expect(blockLines(table).slice(1)).toHaveLength(25);
  });
});

describe("renderOverview: the sort and page buttons", () => {
  test("shows the five sort buttons in one row, in the order of the table's columns, named as the sorts", () => {
    const [sortRow] = overviewOf([alpha, beta]).components;

    expect(sortRow?.components.map((button) => button.label)).toEqual(SORTS.map((sort) => sort.name));
  });

  test("gives each sort button the id overview:{session}:sort:{key}, which no page button shares", () => {
    const [sortRow] = overviewOf([alpha, beta]).components;

    expect(sortRow?.components.map((button) => button.custom_id)).toEqual(
      SORTS.map((sort) => `overview:${SESSION}:sort:${sort.key}`),
    );
  });

  test("makes the active sort's button Primary and the others Secondary", () => {
    const [sortRow] = overviewSorted([alpha, beta], "dailyHonor").components;

    expect(sortRow?.components.map((button) => button.style)).toEqual([
      ButtonStyle.Secondary,
      ButtonStyle.Secondary,
      ButtonStyle.Primary,
      ButtonStyle.Secondary,
      ButtonStyle.Secondary,
    ]);
  });

  test("makes the Might button Primary by default", () => {
    const [sortRow] = overviewOf([alpha, beta]).components;

    expect(sortRow?.components[0]?.style).toBe(ButtonStyle.Primary);
  });

  test("shows the sort row on a single page, and no page row", () => {
    const reply = overviewOf([alpha, beta]);

    expect(reply.components).toHaveLength(1);
    expect(reply.components[0]?.components).toHaveLength(SORTS.length);
  });

  test("adds the page row when the table takes more than one page", () => {
    expect(overviewOf(thirtyRanked, 0).components).toHaveLength(2);
  });

  test("on the first of two pages, Previous is disabled and Next turns to page 2 in the same sort", () => {
    const [, pageRow] = overviewSorted(thirtyRanked, "dailyTech").components;
    const [previous, label, next] = pageRow?.components ?? [];

    expect(previous).toMatchObject({ label: "◀ Previous", disabled: true, style: ButtonStyle.Secondary });
    expect(next).toMatchObject({ label: "Next ▶", custom_id: `overview:${SESSION}:t:1`, disabled: false });
    expect(label).toMatchObject({ label: "1 / 2", custom_id: `overview:${SESSION}:label`, disabled: true });
  });

  test("on the second of two pages, Previous turns to page 1 in the same sort, and Next is disabled", () => {
    const [, pageRow] = overviewSorted(thirtyRanked, "dailyTech", 1).components;
    const [previous, , next] = pageRow?.components ?? [];

    expect(previous).toMatchObject({ custom_id: `overview:${SESSION}:t:0`, disabled: false });
    expect(next).toMatchObject({ disabled: true });
  });

  test.each([0, 1])("on page %i, the sort and page buttons together have their own custom ids, as Discord requires", (page) => {
    const ids = buttonsOf(overviewOf(thirtyRanked, page).components).map((button) => button.custom_id);

    expect(ids).toHaveLength(SORTS.length + 3);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("overviewCustomId and parseOverviewCustomId", () => {
  test.each(SORTS)("builds overview:{session}:{key}:{page} for $name and reads it back", ({ sort, key }) => {
    const customId = overviewCustomId(SESSION, sort, 3);

    expect(customId).toBe(`overview:${SESSION}:${key}:3`);
    expect(parseOverviewCustomId(customId)).toEqual({ sessionId: SESSION, sort, page: 3 });
  });

  test("reads the old overview:{session}:{page} id as the Might sort on that page", () => {
    expect(parseOverviewCustomId(`overview:${SESSION}:3`)).toEqual({ sessionId: SESSION, sort: "might", page: 3 });
  });

  test("reads every sort button back as the first page of its sort", () => {
    const [sortRow] = overviewOf([alpha, beta]).components;
    const parsed = sortRow?.components.map((button) => parseOverviewCustomId(button.custom_id));

    expect(parsed).toEqual(SORTS.map((sort) => ({ sessionId: SESSION, sort: sort.sort, page: 0 })));
  });

  test.each([
    "pick:a1b2:page:1",
    "overview:a1b2",
    "overview:a1b2:x",
    "overview:a1b2:x:1",
    "overview:a1b2:1:2",
    "overview:a1b2:m",
    "overview:a1b2:m:1:2",
    `overview:${SESSION}:label`,
    "something else",
  ])("gives undefined for %s", (customId) => {
    expect(parseOverviewCustomId(customId)).toBeUndefined();
  });
});
