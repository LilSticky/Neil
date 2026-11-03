const ACTIVITY_KINDS = ["weeklyActivity", "dailyHonor", "dailyTech"];
const TABLE_PAGE_SIZE = 25;
const ONLINE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** The totals, online counts and number of members without data of a roster, as of a moment. */
export function overviewOf(roster, now) {
    const windowStart = now.getTime() - ONLINE_WINDOW_MS;
    return {
        totals: {
            weeklyActivity: totalOf(roster, "weeklyActivity"),
            dailyHonor: totalOf(roster, "dailyHonor"),
            dailyTech: totalOf(roster, "dailyTech"),
        },
        onlineNow: roster.filter((entry) => entry.online === true).length,
        onlineLast24h: roster.filter((entry) => entry.online === true || (entry.lastOnlineAt !== undefined && entry.lastOnlineAt.getTime() >= windowStart)).length,
        noData: roster.filter((entry) => ACTIVITY_KINDS.every((kind) => figureOf(entry, kind) === undefined)).length,
    };
}
/** The `count` members with the highest figure of one kind, highest first; members without that figure are left out. */
export function topBy(roster, kind, count) {
    return roster
        .filter((entry) => figureOf(entry, kind) !== undefined)
        .sort((a, b) => (figureOf(b, kind) ?? 0) - (figureOf(a, kind) ?? 0))
        .slice(0, count);
}
/** The `count` members with the lowest Weekly Activity, lowest first; members without Weekly Activity are left out. */
export function leastActive(roster, count) {
    return roster
        .filter((entry) => entry.weeklyActivity !== undefined)
        .sort((a, b) => (a.weeklyActivity ?? 0) - (b.weeklyActivity ?? 0))
        .slice(0, count);
}
/** One page of the table, sorted by Weekly Activity (highest first, no data last). An empty roster is one empty page. */
export function tablePage(roster, page) {
    const sorted = [...roster].sort(byWeeklyActivityWithNoDataLast);
    const pageCount = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
    const shown = Math.min(Math.max(0, page), pageCount - 1);
    const start = shown * TABLE_PAGE_SIZE;
    return { rows: sorted.slice(start, start + TABLE_PAGE_SIZE), page: shown, pageCount };
}
/** Highest Weekly Activity first; a member without Weekly Activity after every member who has one. */
function byWeeklyActivityWithNoDataLast(a, b) {
    if (a.weeklyActivity === undefined || b.weeklyActivity === undefined) {
        return Number(a.weeklyActivity === undefined) - Number(b.weeklyActivity === undefined);
    }
    return b.weeklyActivity - a.weeklyActivity;
}
/** The figure of one kind a member has, undefined when the Game gave none. */
export function figureOf(entry, kind) {
    return entry[kind];
}
function totalOf(roster, kind) {
    const figures = roster.flatMap((entry) => {
        const figure = figureOf(entry, kind);
        return figure === undefined ? [] : [figure];
    });
    const sum = figures.reduce((total, figure) => total + figure, 0);
    return { sum, average: figures.length === 0 ? undefined : sum / figures.length };
}
//# sourceMappingURL=alliance-overview.js.map