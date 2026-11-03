import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
  type APIEmbedField,
} from "discord.js";
import {
  TABLE_PAGE_SIZE,
  figureOf,
  lastSeen,
  leastActive,
  overviewOf,
  tablePage,
  topBy,
  type ActivityKind,
  type ActivityTotal,
  type TablePage,
  type TableSort,
} from "../domain/alliance-overview.js";
import type { Alliance, RosterEntry } from "../domain/player.js";
import {
  CARD_COLOR,
  compactNumber,
  embedCharacters,
  escapeText,
  fitTitle,
  footerFor,
  kingdomAuthor,
  thumbnailOf,
} from "./lookup-cards.js";

/** The Alliance Overview: the overview embed, the table page embed and the buttons under them. */
export interface OverviewReply {
  readonly embeds: APIEmbed[];
  readonly components: APIActionRowComponent<APIButtonComponentWithCustomId>[];
}

/** The buttons of an Alliance Overview, parsed back from their custom id: the sort and the page of the table. */
export interface OverviewCustomId {
  readonly sessionId: string;
  readonly sort: TableSort;
  readonly page: number;
}

/** The table sorts, in the order of the table's columns and of the sort buttons. */
const TABLE_SORTS: readonly TableSort[] = ["might", "weeklyActivity", "dailyHonor", "dailyTech", "lastOnline"];
/** The short key of each sort, as it appears in the custom ids. */
const SORT_KEYS: Readonly<Record<TableSort, string>> = {
  might: "m",
  weeklyActivity: "w",
  dailyHonor: "h",
  dailyTech: "t",
  lastOnline: "l",
};
/** The name of each sort, as the sort buttons and the table title show it. */
const SORT_NAMES: Readonly<Record<TableSort, string>> = {
  might: "Might",
  weeklyActivity: "Weekly Activity",
  dailyHonor: "Daily Honor",
  dailyTech: "Daily Tech",
  lastOnline: "Last Online",
};
/** `overview:{session}:{key}:{page}`: a page of the table in a sort. */
const PAGE_CUSTOM_ID = /^overview:([0-9a-f]+):([a-z]+):(\d+)$/;
/** `overview:{session}:sort:{key}`: a sort button, which shows the first page of that sort. */
const SORT_CUSTOM_ID = /^overview:([0-9a-f]+):sort:([a-z]+)$/;
/** `overview:{session}:{page}`: the page button of earlier versions, which sorted by Might. */
const LEGACY_CUSTOM_ID = /^overview:([0-9a-f]+):(\d+)$/;
const ACTIVITY_LABELS: Readonly<Record<ActivityKind, string>> = {
  weeklyActivity: "Weekly Activity",
  dailyHonor: "Daily Honor",
  dailyTech: "Daily Tech",
};
const ACTIVITY_KINDS: readonly ActivityKind[] = ["weeklyActivity", "dailyHonor", "dailyTech"];
const LIST_LENGTH = 5;
/** Discord's limits: a description, and everything in one message (titles, footers, field names and values). */
const DESCRIPTION_MAX_LENGTH = 4096;
const MESSAGE_MAX_LENGTH = 6000;
const NAME_MAX_LENGTH = 32;
/** The width of the name column in the table; a longer name is cut to it, with an ellipsis. */
const TABLE_NAME_LENGTH = 14;
const RANK_WIDTH = 2;
const MIGHT_WIDTH = 5;
const WEEKLY_WIDTH = 6;
const HONOR_WIDTH = 5;
const TECH_WIDTH = 5;
/** The three backticks that open and close the code block of the table, with their newlines. */
const CODE_BLOCK_LENGTH = "```\n\n```".length;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const NO_ACTIVITY_DATA = "no activity data";
const UNKNOWN_VALUE = "–";
const SECTION_SEPARATOR = " · ";
const numbers = new Intl.NumberFormat("en-US");

/** The table's column titles, as its header line shows them. */
const HEADER_CELLS: TableCells = { rank: "#", name: "Name", might: "Might", weekly: "Weekly", honor: "Honor", tech: "Tech", last: "Last" };

/** The text of each column of one table line. */
interface TableCells {
  readonly rank: string;
  readonly name: string;
  readonly might: string;
  readonly weekly: string;
  readonly honor: string;
  readonly tech: string;
  readonly last: string;
}

/** The button id that shows one page of the table of an Alliance Overview, in its sort. */
export function overviewCustomId(sessionId: string, sort: TableSort, page: number): string {
  return `overview:${sessionId}:${SORT_KEYS[sort]}:${page.toString()}`;
}

/** Reads an Alliance Overview button id back; undefined for any other id. */
export function parseOverviewCustomId(customId: string): OverviewCustomId | undefined {
  const paged = PAGE_CUSTOM_ID.exec(customId);
  if (paged !== null) return overviewIdOf(paged[1], paged[2], paged[3]);
  const sorted = SORT_CUSTOM_ID.exec(customId);
  if (sorted !== null) return overviewIdOf(sorted[1], sorted[2], "0");
  const legacy = LEGACY_CUSTOM_ID.exec(customId);
  if (legacy !== null) return overviewIdOf(legacy[1], SORT_KEYS.might, legacy[2]);
  return undefined;
}

function overviewIdOf(
  sessionId: string | undefined,
  key: string | undefined,
  pageText: string | undefined,
): OverviewCustomId | undefined {
  const sort = key === undefined ? undefined : sortOfKey(key);
  const page = pageText === undefined ? Number.NaN : Number(pageText);
  if (sessionId === undefined || sort === undefined || !Number.isSafeInteger(page)) return undefined;
  return { sessionId, sort, page };
}

function sortOfKey(key: string): TableSort | undefined {
  return TABLE_SORTS.find((sort) => SORT_KEYS[sort] === key);
}

/** The button id of a sort button: the first page of that sort. */
function sortButtonId(sessionId: string, sort: TableSort): string {
  return `overview:${sessionId}:sort:${SORT_KEYS[sort]}`;
}

/**
 * The Alliance Overview of an Alliance fetched at one moment and shown at another: the overview embed and one page of
 * the member table, sorted by `sort`. The table's rows are cut so the whole reply stays within Discord's limits.
 */
export function renderOverview(
  alliance: Alliance,
  fetchedAt: Date,
  now: Date,
  sessionId: string,
  page: number,
  sort: TableSort = "might",
): OverviewReply {
  const table = tablePage(alliance.roster, sort, page);
  const details = alliance.details;
  const thumbnail = thumbnailOf(details?.badgePath);
  const overview: APIEmbed = {
    title: fitTitle(`[${escapeText(alliance.tag)}] ${escapeText(alliance.name)} · Overview`),
    color: CARD_COLOR,
    author: kingdomAuthor(alliance.kingdom, details?.kingdomBadgePath),
    ...(thumbnail === undefined ? {} : { thumbnail }),
    fields: overviewFields(alliance.roster, now),
    footer: footerFor(fetchedAt, now),
  };
  const embeds: APIEmbed[] = [overview, tableEmbed(table, sort, alliance, now, embedCharacters(overview))];
  return { embeds, components: [sortRow(sessionId, sort), ...pageRows(sessionId, sort, table.page, table.pageCount)] };
}

/** A field of the overview that sits in a row of three with its neighbours. */
function inlineField(name: string, value: string): APIEmbedField {
  return { name, value, inline: true };
}

/** The overview's fields in rows of three, except Least Active, which has a row of its own. */
function overviewFields(roster: readonly RosterEntry[], now: Date): APIEmbedField[] {
  const overview = overviewOf(roster, now);
  return [
    ...ACTIVITY_KINDS.map((kind) => inlineField(ACTIVITY_LABELS[kind], totalText(overview.totals[kind]))),
    inlineField("Online now", numbers.format(overview.onlineNow)),
    inlineField("Online in the last 24 hours", numbers.format(overview.onlineLast24h)),
    inlineField("No data", memberCountText(overview.noData)),
    ...ACTIVITY_KINDS.map((kind) =>
      inlineField(`Top ${ACTIVITY_LABELS[kind]}`, listText(topBy(roster, kind, LIST_LENGTH), kind)),
    ),
    { name: "Least Active", value: listText(leastActive(roster, LIST_LENGTH), "weeklyActivity"), inline: false },
  ];
}

function totalText(total: ActivityTotal): string {
  if (total.average === undefined) return NO_ACTIVITY_DATA;
  return `sum ${numbers.format(total.sum)}${SECTION_SEPARATOR}average ${numbers.format(Math.round(total.average))}`;
}

function memberCountText(count: number): string {
  return count === 1 ? "1 member without data" : `${numbers.format(count)} members without data`;
}

/** A numbered list of members with one figure each; "no activity data" when the list is empty. */
function listText(entries: readonly RosterEntry[], kind: ActivityKind): string {
  if (entries.length === 0) return NO_ACTIVITY_DATA;
  return entries
    .map((entry, index) => `${(index + 1).toString()}. ${displayName(entry.name)}${SECTION_SEPARATOR}${figureText(entry, kind)}`)
    .join("\n");
}

/**
 * The table embed of one page, as one code block: the header line, then a line per member. The lines are kept while the
 * description stays within 4,096 characters and the message within 6,000, given the `otherCharacters` the rest of the
 * reply takes; the rows that do not fit are left out.
 */
function tableEmbed(table: TablePage, sort: TableSort, alliance: Alliance, now: Date, otherCharacters: number): APIEmbed {
  const embed: APIEmbed = {
    title: `Members · sorted by ${SORT_NAMES[sort]}`,
    color: CARD_COLOR,
    author: kingdomAuthor(alliance.kingdom, alliance.details?.kingdomBadgePath),
    footer: { text: `Page ${(table.page + 1).toString()} of ${table.pageCount.toString()}` },
  };
  const room =
    Math.min(DESCRIPTION_MAX_LENGTH, MESSAGE_MAX_LENGTH - otherCharacters - embedCharacters(embed)) - CODE_BLOCK_LENGTH;
  const firstPlace = table.page * TABLE_PAGE_SIZE + 1;
  const rows = table.rows.map((entry, index) => tableLine(rowCells(entry, firstPlace + index, now)));
  const lines = linesWithin([tableLine(HEADER_CELLS), ...rows], room);
  return { ...embed, description: ["```", ...lines, "```"].join("\n") };
}

/** The first lines that, joined by newlines, take at most `limit` characters. */
function linesWithin(lines: readonly string[], limit: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const next = used + (kept.length === 0 ? 0 : 1) + line.length;
    if (next > limit) break;
    kept.push(line);
    used = next;
  }
  return kept;
}

/** The cells of one member's line of the table, the member's place in the sorted roster as the rank. */
function rowCells(entry: RosterEntry, place: number, now: Date): TableCells {
  return {
    rank: place.toString(),
    name: tableName(entry.name),
    might: figureCell(entry.might),
    weekly: figureCell(entry.weeklyActivity),
    honor: figureCell(entry.dailyHonor),
    tech: figureCell(entry.dailyTech),
    last: lastOnlineCell(entry, now),
  };
}

/** One line of the table: each figure right-aligned under the end of its column title, the rest left-aligned. */
function tableLine(cells: TableCells): string {
  const start = `${padEnd(cells.rank, RANK_WIDTH)} ${padEnd(cells.name, TABLE_NAME_LENGTH)} ${padStart(cells.might, MIGHT_WIDTH)}`;
  const activity = [padStart(cells.weekly, WEEKLY_WIDTH), padStart(cells.honor, HONOR_WIDTH), padStart(cells.tech, TECH_WIDTH)];
  return `${start}  ${activity.join("  ")}  ${cells.last}`;
}

/** The name in the table: cut to the column width, with a backtick replaced so the code block is not broken. */
function tableName(name: string): string {
  const safe = name.replace(/`/g, "ˋ");
  const characters = Array.from(safe);
  return characters.length > TABLE_NAME_LENGTH ? `${characters.slice(0, TABLE_NAME_LENGTH - 1).join("")}…` : safe;
}

function figureCell(figure: number | undefined): string {
  return figure === undefined ? UNKNOWN_VALUE : compactNumber(figure);
}

/** "online" for a member online now, otherwise the time since the known last online time, in short form. */
function lastOnlineCell(entry: RosterEntry, now: Date): string {
  const seen = lastSeen(entry);
  if (seen.kind === "online") return "online";
  return compactAge(now.getTime() - seen.at.getTime());
}

/** A span of time in minutes, hours or days, as `5m`, `3h` or `2d`. */
function compactAge(ms: number): string {
  const span = Math.max(0, ms);
  if (span < HOUR_MS) return `${Math.floor(span / MINUTE_MS).toString()}m`;
  if (span < DAY_MS) return `${Math.floor(span / HOUR_MS).toString()}h`;
  return `${Math.floor(span / DAY_MS).toString()}d`;
}

/** The text cut or padded to a width, counting characters rather than UTF-16 units. */
function padEnd(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - Array.from(text).length));
}

function padStart(text: string, width: number): string {
  return " ".repeat(Math.max(0, width - Array.from(text).length)) + text;
}

function figureText(entry: RosterEntry, kind: ActivityKind): string {
  const figure = figureOf(entry, kind);
  return figure === undefined ? UNKNOWN_VALUE : numbers.format(figure);
}

/** A member's name cut to the name limit (with "…") and escaped for Discord markdown. */
function displayName(name: string): string {
  const characters = Array.from(name);
  const cut = characters.length > NAME_MAX_LENGTH ? `${characters.slice(0, NAME_MAX_LENGTH - 1).join("")}…` : name;
  return escapeText(cut);
}

/** The row of sort buttons: the active sort is Primary, the others Secondary. */
function sortRow(sessionId: string, active: TableSort): APIActionRowComponent<APIButtonComponentWithCustomId> {
  return {
    type: ComponentType.ActionRow,
    components: TABLE_SORTS.map((sort) =>
      button(SORT_NAMES[sort], sortButtonId(sessionId, sort), false, sort === active ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  };
}

/** Previous, the page, Next, in the sort; no row when the table fits one page. */
function pageRows(
  sessionId: string,
  sort: TableSort,
  page: number,
  pageCount: number,
): APIActionRowComponent<APIButtonComponentWithCustomId>[] {
  if (pageCount <= 1) return [];
  const last = pageCount - 1;
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        button("◀ Previous", overviewCustomId(sessionId, sort, Math.max(0, page - 1)), page === 0),
        // The label is no page button; its own id keeps every custom id in the row unique (Discord refuses duplicates).
        button(`${(page + 1).toString()} / ${pageCount.toString()}`, `overview:${sessionId}:label`, true),
        button("Next ▶", overviewCustomId(sessionId, sort, Math.min(last, page + 1)), page === last),
      ],
    },
  ];
}

function button(
  label: string,
  customId: string,
  disabled: boolean,
  style: ButtonStyle.Primary | ButtonStyle.Secondary = ButtonStyle.Secondary,
): APIButtonComponentWithCustomId {
  return { type: ComponentType.Button, style, label, custom_id: customId, disabled };
}
