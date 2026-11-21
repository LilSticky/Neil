import type { RosterEntry } from "./player.js";

/** The three activity figures of a roster member. */
export type ActivityKind = "weeklyActivity" | "dailyHonor" | "dailyTech";

const ACTIVITY_KINDS: readonly ActivityKind[] = ["weeklyActivity", "dailyHonor", "dailyTech"];

/** The sum of one figure over the members who have it, and its average (undefined when no member has it). */
export interface ActivityTotal {
  readonly sum: number;
  readonly average: number | undefined;
}

/** The Alliance Overview totals of a roster. Members without data are left out of every total. */
export interface OverviewTotals {
  readonly totals: Readonly<Record<ActivityKind, ActivityTotal>>;
  /** Members with none of the three activity figures. */
  readonly noData: number;
}

/** How the per-member table is sorted: by Might or by a figure, highest first with no value last. */
export type TableSort = "might" | "weeklyActivity" | "dailyHonor" | "dailyTech";

/** The table page of the per-member table: 25 members in the order of its sort. */
export interface TablePage {
  readonly rows: readonly RosterEntry[];
  readonly page: number;
  readonly pageCount: number;
}

/** How many members a page of the table lists. */
export const TABLE_PAGE_SIZE = 25;

/**
 * The totals and number of members without data of a roster. The moment is not used: the Game gives no online data to
 * count against it. It stays in the signature until its callers stop passing it.
 */
export function overviewOf(roster: readonly RosterEntry[]): OverviewTotals {
  return {
    totals: {
      weeklyActivity: totalOf(roster, "weeklyActivity"),
      dailyHonor: totalOf(roster, "dailyHonor"),
      dailyTech: totalOf(roster, "dailyTech"),
    },
    noData: roster.filter((entry) => ACTIVITY_KINDS.every((kind) => figureOf(entry, kind) === undefined)).length,
  };
}

/** The `count` members with the highest figure of one kind, highest first; members without that figure are left out. */
export function topBy(roster: readonly RosterEntry[], kind: ActivityKind, count: number): RosterEntry[] {
  return roster
    .filter((entry) => figureOf(entry, kind) !== undefined)
    .sort((a, b) => (figureOf(b, kind) ?? 0) - (figureOf(a, kind) ?? 0))
    .slice(0, count);
}

/** The `count` members with the lowest Weekly Activity, lowest first; members without Weekly Activity are left out. */
export function leastActive(roster: readonly RosterEntry[], count: number): RosterEntry[] {
  return roster
    .filter((entry) => entry.weeklyActivity !== undefined)
    .sort((a, b) => (a.weeklyActivity ?? 0) - (b.weeklyActivity ?? 0))
    .slice(0, count);
}

/** One page of the table, in the order of its sort. An empty roster is one empty page. */
export function tablePage(roster: readonly RosterEntry[], sort: TableSort, page: number): TablePage {
  const sorted = [...roster].sort(orderOf(sort));
  const pageCount = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const shown = Math.min(Math.max(0, page), pageCount - 1);
  const start = shown * TABLE_PAGE_SIZE;
  return { rows: sorted.slice(start, start + TABLE_PAGE_SIZE), page: shown, pageCount };
}

type Comparison = (a: RosterEntry, b: RosterEntry) => number;

/** Highest figure first, a member without the figure after every member who has it; ties by name. */
function orderOf(sort: TableSort): Comparison {
  return (a, b) => {
    const figureA = sort === "might" ? a.might : figureOf(a, sort);
    const figureB = sort === "might" ? b.might : figureOf(b, sort);
    if (figureA === undefined || figureB === undefined) {
      return Number(figureA === undefined) - Number(figureB === undefined) || byName(a, b);
    }
    return figureB - figureA || byName(a, b);
  };
}

function byName(a: RosterEntry, b: RosterEntry): number {
  return a.name.localeCompare(b.name);
}

/** The figure of one kind a member has, undefined when the Game gave none. */
export function figureOf(entry: RosterEntry, kind: ActivityKind): number | undefined {
  return entry[kind];
}

function totalOf(roster: readonly RosterEntry[], kind: ActivityKind): ActivityTotal {
  const figures = roster.flatMap((entry) => {
    const figure = figureOf(entry, kind);
    return figure === undefined ? [] : [figure];
  });
  const sum = figures.reduce((total, figure) => total + figure, 0);
  return { sum, average: figures.length === 0 ? undefined : sum / figures.length };
}
