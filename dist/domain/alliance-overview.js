const ACTIVITY_KINDS = ["weeklyActivity", "dailyHonor", "dailyTech"];
/** How many members a page of the table lists. */
export const TABLE_PAGE_SIZE = 25;
/**
 * The totals and number of members without data of a roster. The moment is not used: the Game gives no online data to
 * count against it. It stays in the signature until its callers stop passing it.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the tests still pass the moment
export function overviewOf(roster, _now) {
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
/** One page of the table, in the order of its sort. An empty roster is one empty page. */
export function tablePage(roster, sort, page) {
    const sorted = [...roster].sort(orderOf(sort));
    const pageCount = Math.max(1, Math.ceil(sorted.length / TABLE_PAGE_SIZE));
    const shown = Math.min(Math.max(0, page), pageCount - 1);
    const start = shown * TABLE_PAGE_SIZE;
    return { rows: sorted.slice(start, start + TABLE_PAGE_SIZE), page: shown, pageCount };
}
/** Highest figure first, a member without the figure after every member who has it; ties by name. */
function orderOf(sort) {
    return (a, b) => {
        const figureA = sort === "might" ? a.might : figureOf(a, sort);
        const figureB = sort === "might" ? b.might : figureOf(b, sort);
        if (figureA === undefined || figureB === undefined) {
            return Number(figureA === undefined) - Number(figureB === undefined) || byName(a, b);
        }
        return figureB - figureA || byName(a, b);
    };
}
function byName(a, b) {
    return a.name.localeCompare(b.name);
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