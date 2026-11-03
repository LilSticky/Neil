import { ButtonStyle, ComponentType, } from "discord.js";
import { figureOf, leastActive, overviewOf, tablePage, topBy, } from "../domain/alliance-overview.js";
import { embedCharacters, escapeText, fitTitle, footerFor } from "./lookup-cards.js";
const OVERVIEW_CUSTOM_ID = /^overview:([0-9a-f]+):(\d+)$/;
const ACTIVITY_LABELS = {
    weeklyActivity: "Weekly Activity",
    dailyHonor: "Daily Honor",
    dailyTech: "Daily Tech",
};
const ACTIVITY_KINDS = ["weeklyActivity", "dailyHonor", "dailyTech"];
const LIST_LENGTH = 5;
/** Discord's limits: a description, and everything in one message (titles, footers, field names and values). */
const DESCRIPTION_MAX_LENGTH = 4096;
const MESSAGE_MAX_LENGTH = 6000;
const NAME_MAX_LENGTH = 32;
const NO_ACTIVITY_DATA = "no activity data";
const NO_DATA = "no data";
const UNKNOWN_VALUE = "–";
const SECTION_SEPARATOR = " · ";
const numbers = new Intl.NumberFormat("en-US");
/** The button id that shows one page of the table of an Alliance Overview. */
export function overviewCustomId(sessionId, page) {
    return `overview:${sessionId}:${page.toString()}`;
}
/** Reads an Alliance Overview page button id back; undefined for any other id. */
export function parseOverviewCustomId(customId) {
    const match = OVERVIEW_CUSTOM_ID.exec(customId);
    if (match === null)
        return undefined;
    const [, sessionId, pageText] = match;
    const page = Number(pageText);
    if (sessionId === undefined || pageText === undefined || !Number.isSafeInteger(page))
        return undefined;
    return { sessionId, page };
}
/**
 * The Alliance Overview of an Alliance fetched at one moment and shown at another: the overview embed and one page of
 * the member table. The table's rows are cut so the whole reply stays within Discord's limits.
 */
export function renderOverview(alliance, fetchedAt, now, sessionId, page) {
    const table = tablePage(alliance.roster, page);
    const overview = {
        title: fitTitle(`[${escapeText(alliance.tag)}] ${escapeText(alliance.name)} · Overview`),
        fields: overviewFields(alliance.roster, now),
        footer: footerFor(fetchedAt, now),
    };
    const embeds = [overview, tableEmbed(table, embedCharacters(overview))];
    return { embeds, components: pageButtons(sessionId, table.page, table.pageCount) };
}
function overviewFields(roster, now) {
    const overview = overviewOf(roster, now);
    return [
        ...ACTIVITY_KINDS.map((kind) => ({ name: ACTIVITY_LABELS[kind], value: totalText(overview.totals[kind]) })),
        { name: "Online now", value: numbers.format(overview.onlineNow) },
        { name: "Online in the last 24 hours", value: numbers.format(overview.onlineLast24h) },
        { name: "No data", value: memberCountText(overview.noData) },
        ...ACTIVITY_KINDS.map((kind) => ({
            name: `Top ${ACTIVITY_LABELS[kind]}`,
            value: listText(topBy(roster, kind, LIST_LENGTH), kind),
        })),
        { name: "Least Active", value: listText(leastActive(roster, LIST_LENGTH), "weeklyActivity") },
    ];
}
function totalText(total) {
    if (total.average === undefined)
        return NO_ACTIVITY_DATA;
    return `sum ${numbers.format(total.sum)}${SECTION_SEPARATOR}average ${numbers.format(Math.round(total.average))}`;
}
function memberCountText(count) {
    return count === 1 ? "1 member without data" : `${numbers.format(count)} members without data`;
}
/** A numbered list of members with one figure each; "no activity data" when the list is empty. */
function listText(entries, kind) {
    if (entries.length === 0)
        return NO_ACTIVITY_DATA;
    return entries
        .map((entry, index) => `${(index + 1).toString()}. ${displayName(entry.name)}${SECTION_SEPARATOR}${figureText(entry, kind)}`)
        .join("\n");
}
/**
 * The table embed of one page. Its rows are kept while the description stays within 4,096 characters and the message
 * within 6,000, given the `otherCharacters` the rest of the reply takes; the rows that do not fit are left out.
 */
function tableEmbed(table, otherCharacters) {
    const embed = {
        title: `Members · page ${(table.page + 1).toString()} of ${table.pageCount.toString()}`,
    };
    const room = Math.min(DESCRIPTION_MAX_LENGTH, MESSAGE_MAX_LENGTH - otherCharacters - embedCharacters(embed));
    const lines = linesWithin(table.rows.map(tableRow), room);
    if (lines.length === 0)
        return embed;
    return { ...embed, description: lines.join("\n") };
}
/** The first lines that, joined by newlines, take at most `limit` characters. */
function linesWithin(lines, limit) {
    const kept = [];
    let used = 0;
    for (const line of lines) {
        const next = used + (kept.length === 0 ? 0 : 1) + line.length;
        if (next > limit)
            break;
        kept.push(line);
        used = next;
    }
    return kept;
}
/** One member of the table: name, the three figures (or "no data") and the last online time. */
function tableRow(entry) {
    const hasAnyFigure = ACTIVITY_KINDS.some((kind) => figureOf(entry, kind) !== undefined);
    const figures = hasAnyFigure
        ? ACTIVITY_KINDS.map((kind) => figureText(entry, kind)).join(SECTION_SEPARATOR)
        : NO_DATA;
    return [displayName(entry.name), figures, seenText(entry)].join(SECTION_SEPARATOR);
}
function figureText(entry, kind) {
    const figure = figureOf(entry, kind);
    return figure === undefined ? UNKNOWN_VALUE : numbers.format(figure);
}
/** "online" for a member online now, a Discord relative timestamp for a known last online time, otherwise "–". */
function seenText(entry) {
    if (entry.online === true)
        return "online";
    if (entry.lastOnlineAt === undefined)
        return UNKNOWN_VALUE;
    return `<t:${Math.floor(entry.lastOnlineAt.getTime() / 1000).toString()}:R>`;
}
/** A member's name cut to the name limit (with "…") and escaped for Discord markdown. */
function displayName(name) {
    const characters = Array.from(name);
    const cut = characters.length > NAME_MAX_LENGTH ? `${characters.slice(0, NAME_MAX_LENGTH - 1).join("")}…` : name;
    return escapeText(cut);
}
/** Previous, the page, Next; no buttons when the table fits one page. */
function pageButtons(sessionId, page, pageCount) {
    if (pageCount <= 1)
        return [];
    const last = pageCount - 1;
    return [
        {
            type: ComponentType.ActionRow,
            components: [
                button("◀ Previous", overviewCustomId(sessionId, Math.max(0, page - 1)), page === 0),
                // The label is no page button; its own id keeps every custom id in the row unique (Discord refuses duplicates).
                button(`${(page + 1).toString()} / ${pageCount.toString()}`, `overview:${sessionId}:label`, true),
                button("Next ▶", overviewCustomId(sessionId, Math.min(last, page + 1)), page === last),
            ],
        },
    ];
}
function button(label, customId, disabled) {
    return { type: ComponentType.Button, style: ButtonStyle.Secondary, label, custom_id: customId, disabled };
}
//# sourceMappingURL=overview-texts.js.map