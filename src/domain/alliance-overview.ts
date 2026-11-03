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

/**
 * How the per-member table is sorted: by a figure, highest first with no value last, or by Last Online (online now
 * first, then the most recent).
 */
export type TableSort = "might" | "weeklyActivity" | "dailyHonor" | "dailyTech" | "lastOnline";

/** The table page of the per-member table: 25 members in the order of its sort. */
export interface TablePage {
  readonly rows: readonly RosterEntry[];
  readonly page: number;
  readonly pageCount: number;
}

/** How many members a page of the table lists. */
export const TABLE_PAGE_SIZE = 25;
const ONLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** How a Player was last seen: online now, or at the known Last Online time. */
export type LastSeen = { readonly kind: "online" } | { readonly kind: "lastOnline"; readonly at: Date };

/**
 * How a Player was last seen. Online now when the Game says so, or when it gives no Last Online time to say otherwise;
 * else the Last Online time.
 */
export function lastSeen(seen: {
  readonly online?: boolean | undefined;
  readonly lastOnlineAt?: Date | undefined;
}): LastSeen {
  if (seen.online === true || seen.lastOnlineAt === undefined) return { kind: "online" };
  return { kind: "lastOnline", at: seen.lastOnlineAt };
}

/** Whether a member is online now (see `lastSeen`). */
export function isOnlineNow(entry: RosterEntry): boolean {
  return lastSeen(entry).kind === "online";
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

/** One page of the table, in the order of its sort. An empty roster is one empty page. */
export function tablePage(roster: readonly RosterEntry[], sort: TableSort, page: number): TablePage {
  const sorted = [...roster].sort(orderOf(sort));
  const pageCount = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
  const shown = Math.min(Math.max(0, page), pageCount - 1);
  const start = shown * TABLE_PAGE_SIZE;
  return { rows: sorted.slice(start, start + TABLE_PAGE_SIZE), page: shown, pageCount };
}

type Comparison = (a: RosterEntry, b: RosterEntry) => number;

function orderOf(sort: TableSort): Comparison {
  return sort === "lastOnline" ? byLastSeen : byFigure(sort);
}

/** Highest figure first, a member without the figure after every member who has it; ties by name. */
function byFigure(sort: Exclude<TableSort, "lastOnline">): Comparison {
  return (a, b) => {
    const figureA = sort === "might" ? a.might : figureOf(a, sort);
    const figureB = sort === "might" ? b.might : figureOf(b, sort);
    if (figureA === undefined || figureB === undefined) {
      return Number(figureA === undefined) - Number(figureB === undefined) || byName(a, b);
    }
    return figureB - figureA || byName(a, b);
  };
}

/** Members online now first, then the most recent Last Online first; ties by name. */
function byLastSeen(a: RosterEntry, b: RosterEntry): number {
  const seenA = lastSeen(a);
  const seenB = lastSeen(b);
  if (seenA.kind === "online" || seenB.kind === "online") {
    return Number(seenA.kind !== "online") - Number(seenB.kind !== "online") || byName(a, b);
  }
  return seenB.at.getTime() - seenA.at.getTime() || byName(a, b);
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
