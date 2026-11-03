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
  /** Members online now. */
  readonly onlineNow: number;
  /** Members online now or whose last online time is within the last 24 hours. */
  readonly onlineLast24h: number;
  /** Members with none of the three activity figures. */
  readonly noData: number;
}

/** The table page of the per-member table: 25 members, sorted by Weekly Activity with no data last. */
export interface TablePage {
  readonly rows: readonly RosterEntry[];
  readonly page: number;
  readonly pageCount: number;
}

const TABLE_PAGE_SIZE = 25;
const ONLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a member is online now: the Game says so, or gives no Last Online time to say otherwise. A member without a
 * Last Online time counts as online now.
 */
export function isOnlineNow(entry: RosterEntry): boolean {
  return entry.online === true || entry.lastOnlineAt === undefined;
}

/** The totals, online counts and number of members without data of a roster, as of a moment. */
export function overviewOf(roster: readonly RosterEntry[], now: Date): OverviewTotals {
  const windowStart = now.getTime() - ONLINE_WINDOW_MS;
  return {
    totals: {
      weeklyActivity: totalOf(roster, "weeklyActivity"),
      dailyHonor: totalOf(roster, "dailyHonor"),
      dailyTech: totalOf(roster, "dailyTech"),
    },
    onlineNow: roster.filter(isOnlineNow).length,
    onlineLast24h: roster.filter(
      (entry) =>
        isOnlineNow(entry) || (entry.lastOnlineAt !== undefined && entry.lastOnlineAt.getTime() >= windowStart),
    ).length,
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

/** One page of the table, sorted by Weekly Activity (highest first, no data last). An empty roster is one empty page. */
export function tablePage(roster: readonly RosterEntry[], page: number): TablePage {
  const sorted = [...roster].sort(byWeeklyActivityWithNoDataLast);
  const pageCount = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const shown = Math.min(Math.max(0, page), pageCount - 1);
  const start = shown * TABLE_PAGE_SIZE;
  return { rows: sorted.slice(start, start + TABLE_PAGE_SIZE), page: shown, pageCount };
}

/** Highest Weekly Activity first; a member without Weekly Activity after every member who has one. */
function byWeeklyActivityWithNoDataLast(a: RosterEntry, b: RosterEntry): number {
  if (a.weeklyActivity === undefined || b.weeklyActivity === undefined) {
    return Number(a.weeklyActivity === undefined) - Number(b.weeklyActivity === undefined);
  }
  return b.weeklyActivity - a.weeklyActivity;
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
