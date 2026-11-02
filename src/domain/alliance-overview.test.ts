import { describe, expect, test } from "vitest";
import { leastActive, overviewOf, tablePage, topBy } from "./alliance-overview.js";
import { parseUid } from "./lookup-input.js";
import type { RosterEntry } from "./player.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const HOUR_MS = 3_600_000;

interface Figures {
  readonly weeklyActivity?: number;
  readonly dailyHonor?: number;
  readonly dailyTech?: number;
  readonly online?: boolean;
  readonly lastOnlineAt?: Date;
}

let nextUid = 100_000_000_001;

/** A roster member; a figure left out is undefined, as the Game API gives it when there is no data. */
function member(name: string, figures: Figures = {}): RosterEntry {
  const parsed = parseUid(String(nextUid));
  nextUid += 1;
  if (!parsed.ok) throw new Error("the test uid must parse");
  return {
    uid: parsed.value,
    name,
    allianceRank: "R1",
    kingdom: undefined,
    sanctuaryLevel: undefined,
    weeklyActivity: figures.weeklyActivity,
    dailyHonor: figures.dailyHonor,
    dailyTech: figures.dailyTech,
    online: figures.online,
    lastOnlineAt: figures.lastOnlineAt,
  };
}

function namesOf(entries: readonly RosterEntry[]): string[] {
  return entries.map((entry) => entry.name);
}

describe("overviewOf totals", () => {
  test("sums and averages each Alliance Overview figure over the members who have it", () => {
    const roster = [
      member("Alpha", { weeklyActivity: 490, dailyHonor: 40, dailyTech: 4600 }),
      member("Beta", { weeklyActivity: 10, dailyHonor: 60, dailyTech: 400 }),
    ];

    const overview = overviewOf(roster, NOW);

    expect(overview.totals.weeklyActivity).toEqual({ sum: 500, average: 250 });
    expect(overview.totals.dailyHonor).toEqual({ sum: 100, average: 50 });
    expect(overview.totals.dailyTech).toEqual({ sum: 5000, average: 2500 });
  });

  test("leaves a member without activity data out of the sums and averages", () => {
    const roster = [
      member("Alpha", { weeklyActivity: 490, dailyHonor: 40, dailyTech: 4600 }),
      member("Beta", { weeklyActivity: 10, dailyHonor: 60, dailyTech: 400 }),
      member("Gamma"),
    ];

    const overview = overviewOf(roster, NOW);

    expect(overview.totals.weeklyActivity).toEqual({ sum: 500, average: 250 });
    expect(overview.totals.dailyTech).toEqual({ sum: 5000, average: 2500 });
  });

  test("gives no average, and a sum of 0, for a figure that no member has", () => {
    const overview = overviewOf([member("Alpha"), member("Beta")], NOW);

    expect(overview.totals.weeklyActivity).toEqual({ sum: 0, average: undefined });
  });
});

describe("overviewOf online", () => {
  test("counts the members online now", () => {
    const roster = [
      member("Alpha", { online: true, lastOnlineAt: NOW }),
      member("Beta", { online: true, lastOnlineAt: NOW }),
      member("Gamma", { online: false, lastOnlineAt: new Date(NOW.getTime() - 5 * HOUR_MS) }),
    ];

    expect(overviewOf(roster, NOW).onlineNow).toBe(2);
  });

  test("counts the members whose last online time is within the last 24 hours", () => {
    const roster = [
      member("Alpha", { online: false, lastOnlineAt: new Date(NOW.getTime() - 23 * HOUR_MS) }),
      member("Beta", { online: false, lastOnlineAt: new Date(NOW.getTime() - 25 * HOUR_MS) }),
      member("Gamma", { online: true, lastOnlineAt: NOW }),
    ];

    expect(overviewOf(roster, NOW).onlineLast24h).toBe(2);
  });
});

describe("overviewOf no data", () => {
  test("counts the members with no activity figure at all as no data", () => {
    const roster = [
      member("Alpha", { weeklyActivity: 490, dailyHonor: 40, dailyTech: 4600 }),
      member("Beta"),
      member("Gamma"),
    ];

    expect(overviewOf(roster, NOW).noData).toBe(2);
  });
});

describe("topBy", () => {
  const roster = [
    member("Alpha", { weeklyActivity: 30, dailyHonor: 1, dailyTech: 500 }),
    member("Beta", { weeklyActivity: 70, dailyHonor: 5, dailyTech: 100 }),
    member("Gamma", { weeklyActivity: 10, dailyHonor: 9, dailyTech: 300 }),
    member("Delta", { weeklyActivity: 90, dailyHonor: 2, dailyTech: 200 }),
    member("Epsilon", { weeklyActivity: 50, dailyHonor: 7, dailyTech: 400 }),
    member("Zeta", { weeklyActivity: 20, dailyHonor: 3, dailyTech: 600 }),
    member("Eta", { weeklyActivity: 60, dailyHonor: 8, dailyTech: 700 }),
  ];

  test("gives the 5 highest Weekly Activity, highest first", () => {
    expect(namesOf(topBy(roster, "weeklyActivity", 5))).toEqual(["Delta", "Beta", "Eta", "Epsilon", "Alpha"]);
  });

  test("ranks by Daily Honor and by Daily Tech with their own figures", () => {
    expect(namesOf(topBy(roster, "dailyHonor", 5))).toEqual(["Gamma", "Eta", "Epsilon", "Beta", "Zeta"]);
    expect(namesOf(topBy(roster, "dailyTech", 5))).toEqual(["Eta", "Zeta", "Alpha", "Epsilon", "Gamma"]);
  });

  test("leaves out a member who has no figure of that kind", () => {
    const partial = [
      member("Alpha", { weeklyActivity: 500 }),
      member("Beta", { weeklyActivity: 5, dailyHonor: 2 }),
    ];

    expect(namesOf(topBy(partial, "dailyHonor", 5))).toEqual(["Beta"]);
  });
});

describe("leastActive", () => {
  test("gives the 5 lowest Weekly Activity, lowest first", () => {
    const roster = [
      member("Alpha", { weeklyActivity: 30 }),
      member("Beta", { weeklyActivity: 70 }),
      member("Gamma", { weeklyActivity: 10 }),
      member("Delta", { weeklyActivity: 90 }),
      member("Epsilon", { weeklyActivity: 50 }),
      member("Zeta", { weeklyActivity: 20 }),
      member("Eta", { weeklyActivity: 60 }),
    ];

    expect(namesOf(leastActive(roster, 5))).toEqual(["Gamma", "Zeta", "Alpha", "Epsilon", "Eta"]);
  });

  test("leaves out a member without Weekly Activity, who is no data and not Least Active", () => {
    const roster = [
      member("Alpha", { weeklyActivity: 5 }),
      member("Beta"),
      member("Gamma", { weeklyActivity: 1 }),
      member("Delta", { weeklyActivity: 9 }),
    ];

    expect(namesOf(leastActive(roster, 5))).toEqual(["Gamma", "Alpha", "Delta"]);
  });
});

describe("tablePage", () => {
  const thirty = Array.from({ length: 30 }, (_, index) => member(`Player ${index.toString()}`, { weeklyActivity: index }));

  test("lists 25 members on the first page and the rest on the second", () => {
    const first = tablePage(thirty, 0);
    const second = tablePage(thirty, 1);

    expect(first.pageCount).toBe(2);
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(5);
  });

  test("sorts the table by Weekly Activity, highest first", () => {
    const roster = [
      member("Alpha", { weeklyActivity: 5 }),
      member("Beta", { weeklyActivity: 50 }),
      member("Gamma", { weeklyActivity: 20 }),
    ];

    expect(namesOf(tablePage(roster, 0).rows)).toEqual(["Beta", "Gamma", "Alpha"]);
  });

  test("puts members with no Weekly Activity last, after every member who has one", () => {
    const roster = [
      member("Alpha"),
      member("Beta", { weeklyActivity: 5 }),
      member("Gamma", { weeklyActivity: 20 }),
    ];

    const rows = tablePage(roster, 0).rows;

    expect(namesOf(rows)).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  test("continues the sorted order on the second page", () => {
    const second = tablePage(thirty, 1);

    expect(second.page).toBe(1);
    expect(second.rows[0]?.weeklyActivity).toBe(4);
  });

  test("an empty roster is one page with no rows", () => {
    expect(tablePage([], 0)).toEqual({ rows: [], page: 0, pageCount: 1 });
  });
});
