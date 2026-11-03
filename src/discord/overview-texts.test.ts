import { ButtonStyle, ComponentType, type APIActionRowComponent, type APIButtonComponentWithCustomId, type APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
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
  readonly power?: number;
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
    ...(figures.power === undefined ? {} : { power: figures.power }),
  };
}

const allianceDetails: AllianceDetails = {
  level: 4,
  xp: 8_829_850,
  giftLevel: 6,
  kingdomPowerRank: 25,
  language: "ja",
  joinRequirements: { open: true, minimumPower: 0, minimumSanctuaryLevel: 0 },
  badgePath: "/static/alliance/badge_103.png",
  kingdomBadgePath: "/static/kingdom/badge_1.png",
};

function allianceWith(roster: readonly RosterEntry[]): Alliance {
  return {
    tag: "NML",
    name: "No Man's Land",
    kingdom: kingdom(1),
    power: 208815434,
    memberCount: roster.length,
    capacity: 100,
    leaderName: "DrLOL",
    roster,
  };
}

/** The Alliance Overview of a roster, fetched at FETCHED_AT and shown at NOW, on the given page. */
function overviewOf(roster: readonly RosterEntry[], page = 0): OverviewReply {
  return renderOverview(allianceWith(roster), FETCHED_AT, NOW, SESSION, page);
}

const alpha = member("179060285441", "Alpha", {
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

describe("renderOverview: the table page", () => {
  test("lists each member's name, Weekly Activity, Daily Honor, Daily Tech and last online in its description", () => {
    const table = overviewOf([alpha]).embeds[1];

    expect(table?.description).toBe("Alpha · 490 · 40 · 4,600 · <t:1793285439:R>");
  });

  test("shows online instead of a time for a member online now, and for a member without a last online time", () => {
    const table = overviewOf([beta, delta]).embeds[1];

    expect(table?.description).toContain("Beta · 10 · 60 · 400 · online");
    expect(table?.description).toContain("Delta · no data · online");
  });

  test("lists 25 members on the first page, and the next page holds the rest", () => {
    const roster = Array.from({ length: 30 }, (_, index) =>
      member(String(100_000_000_000 + index), `Player ${index.toString()}`, { weeklyActivity: index + 1 }),
    );

    const first = overviewOf(roster, 0).embeds[1];
    const second = overviewOf(roster, 1).embeds[1];

    expect(first?.description?.split("\n")).toHaveLength(25);
    expect(second?.description?.split("\n")).toHaveLength(5);
    expect(first?.title).toBe("Members · page 1 of 2");
    expect(second?.title).toBe("Members · page 2 of 2");
  });

  test("gives a member with no data last", () => {
    const table = overviewOf([delta, gamma]).embeds[1];

    expect(table?.description?.split("\n")[0]).toContain("Gamma");
    expect(table?.description?.split("\n")[1]).toContain("Delta");
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

describe("renderOverview: power in the table", () => {
  test("shows each member's power in short form after the name, and leaves it out when unknown", () => {
    const powered = member("179060285441", "Alpha", {
      power: 27_626_362,
      weeklyActivity: 490,
      dailyHonor: 40,
      dailyTech: 4600,
      online: false,
      lastOnlineAt: new Date(1793285439 * 1000),
    });

    const description = overviewOf([powered, beta]).embeds[1]?.description ?? "";

    expect(description).toContain("Alpha · 27.6M · 490 · 40 · 4,600 · <t:1793285439:R>");
    expect(description).toContain("Beta · 10 · 60 · 400 · online");
  });

  test("shows the power in place of no data for a member with power and no figures", () => {
    const description = overviewOf([member("300000000001", "Delta", { power: 5_000 })]).embeds[1]?.description ?? "";

    expect(description).toBe("Delta · 5K · no data · online");
  });

  test("keeps 25 rows of 100-character names with power within the description and message limits", () => {
    const longName = "N".repeat(100);
    const roster = Array.from({ length: 25 }, (_, index) =>
      member(String(100_000_000_000 + index), `${longName}${index.toString()}`, {
        power: 27_626_362,
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
    expect(table?.description?.split("\n")).toHaveLength(25);
    expect(table?.description).toContain(" · 27.6M · ");
  });
});

describe("renderOverview: page buttons", () => {
  const thirty = Array.from({ length: 30 }, (_, index) =>
    member(String(100_000_000_000 + index), `Player ${index.toString()}`, { weeklyActivity: index + 1 }),
  );

  function buttonsOf(
    components: readonly APIActionRowComponent<APIButtonComponentWithCustomId>[],
  ): APIButtonComponentWithCustomId[] {
    return components.flatMap((row) => row.components);
  }

  test("has no page buttons when the table fits one page", () => {
    const reply = overviewOf([alpha, beta]);

    expect(reply.components).toEqual([]);
  });

  test("on the first of two pages, Previous is disabled and Next turns to page 2", () => {
    const reply = overviewOf(thirty, 0);
    const [previous, , next] = buttonsOf(reply.components);

    expect(reply.components).toHaveLength(1);
    expect(reply.components[0]?.components[0]?.type).toBe(ComponentType.Button);
    expect(previous).toMatchObject({ label: "◀ Previous", disabled: true, style: ButtonStyle.Secondary });
    expect(next).toMatchObject({ label: "Next ▶", custom_id: `overview:${SESSION}:1`, disabled: false });
  });

  test("on the second of two pages, Previous turns to page 1 and Next is disabled", () => {
    const reply = overviewOf(thirty, 1);
    const [previous, , next] = buttonsOf(reply.components);

    expect(previous).toMatchObject({ custom_id: `overview:${SESSION}:0`, disabled: false });
    expect(next).toMatchObject({ disabled: true });
  });

  test.each([0, 1])("on page %i, every button has its own custom id, as Discord requires", (page) => {
    const ids = buttonsOf(overviewOf(thirty, page).components).map((button) => button.custom_id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the page label is no page button: its id reads back as no Overview page", () => {
    const [, label] = buttonsOf(overviewOf(thirty, 0).components);

    expect(label).toMatchObject({ label: "1 / 2", disabled: true });
    expect(parseOverviewCustomId(label?.custom_id ?? "")).toBeUndefined();
  });
});

describe("overviewCustomId and parseOverviewCustomId", () => {
  test("builds overview:{session}:{page} and reads it back", () => {
    const customId = overviewCustomId(SESSION, 3);

    expect(customId).toBe(`overview:${SESSION}:3`);
    expect(parseOverviewCustomId(customId)).toEqual({ sessionId: SESSION, page: 3 });
  });

  test.each(["pick:a1b2:page:1", "overview:a1b2", "overview:a1b2:x", "overview:a1b2:1:2", "something else"])(
    "gives undefined for %s",
    (customId) => {
      expect(parseOverviewCustomId(customId)).toBeUndefined();
    },
  );
});
