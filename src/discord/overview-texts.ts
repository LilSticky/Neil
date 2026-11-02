import {
  ButtonStyle,
  ComponentType,
  escapeMarkdown,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
  type APIEmbedField,
} from "discord.js";
import {
  figureOf,
  leastActive,
  overviewOf,
  tablePage,
  topBy,
  type ActivityKind,
  type ActivityTotal,
} from "../domain/alliance-overview.js";
import type { Alliance, RosterEntry } from "../domain/player.js";

/** The Alliance Overview: the overview embed, the table page embed and the page buttons under them. */
export interface OverviewReply {
  readonly embeds: APIEmbed[];
  readonly components: APIActionRowComponent<APIButtonComponentWithCustomId>[];
}

/** The page buttons, parsed back from `overview:{session}:{page}`. */
export interface OverviewCustomId {
  readonly sessionId: string;
  readonly page: number;
}

const OVERVIEW_CUSTOM_ID = /^overview:([0-9a-f]+):(\d+)$/;
const ACTIVITY_LABELS: Readonly<Record<ActivityKind, string>> = {
  weeklyActivity: "Weekly Activity",
  dailyHonor: "Daily Honor",
  dailyTech: "Daily Tech",
};
const ACTIVITY_KINDS: readonly ActivityKind[] = ["weeklyActivity", "dailyHonor", "dailyTech"];
const LIST_LENGTH = 5;
const NAME_MAX_LENGTH = 32;
const NO_ACTIVITY_DATA = "no activity data";
const NO_DATA = "no data";
const UNKNOWN_VALUE = "–";
const SECTION_SEPARATOR = " · ";
const numbers = new Intl.NumberFormat("en-US");

/** The button id that shows one page of the table of an Alliance Overview. */
export function overviewCustomId(sessionId: string, page: number): string {
  return `overview:${sessionId}:${page.toString()}`;
}

/** Reads an Alliance Overview page button id back; undefined for any other id. */
export function parseOverviewCustomId(customId: string): OverviewCustomId | undefined {
  const match = OVERVIEW_CUSTOM_ID.exec(customId);
  if (match === null) return undefined;
  const [, sessionId, pageText] = match;
  const page = Number(pageText);
  if (sessionId === undefined || pageText === undefined || !Number.isSafeInteger(page)) return undefined;
  return { sessionId, page };
}

/** The Alliance Overview of an Alliance as of a moment: the overview embed and one page of the member table. */
export function renderOverview(alliance: Alliance, sessionId: string, page: number, now: Date): OverviewReply {
  const table = tablePage(alliance.roster, page);
  const embeds: APIEmbed[] = [
    {
      title: `[${alliance.tag}] ${escapeMarkdown(alliance.name)} · Overview`,
      fields: overviewFields(alliance.roster, now),
    },
    tableEmbed(table.rows, table.page, table.pageCount),
  ];
  return { embeds, components: pageButtons(sessionId, table.page, table.pageCount) };
}

function overviewFields(roster: readonly RosterEntry[], now: Date): APIEmbedField[] {
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

function tableEmbed(rows: readonly RosterEntry[], page: number, pageCount: number): APIEmbed {
  const embed: APIEmbed = { title: `Members · page ${(page + 1).toString()} of ${pageCount.toString()}` };
  if (rows.length === 0) return embed;
  return { ...embed, description: rows.map(tableRow).join("\n") };
}

/** One member of the table: name, the three figures (or "no data") and the last online time. */
function tableRow(entry: RosterEntry): string {
  const hasAnyFigure = ACTIVITY_KINDS.some((kind) => figureOf(entry, kind) !== undefined);
  const figures = hasAnyFigure
    ? ACTIVITY_KINDS.map((kind) => figureText(entry, kind)).join(SECTION_SEPARATOR)
    : NO_DATA;
  return [displayName(entry.name), figures, seenText(entry)].join(SECTION_SEPARATOR);
}

function figureText(entry: RosterEntry, kind: ActivityKind): string {
  const figure = figureOf(entry, kind);
  return figure === undefined ? UNKNOWN_VALUE : numbers.format(figure);
}

/** "online" for a member online now, a Discord relative timestamp for a known last online time, otherwise "–". */
function seenText(entry: RosterEntry): string {
  if (entry.online === true) return "online";
  if (entry.lastOnlineAt === undefined) return UNKNOWN_VALUE;
  return `<t:${Math.floor(entry.lastOnlineAt.getTime() / 1000).toString()}:R>`;
}

/** A member's name cut to the name limit (with "…") and escaped for Discord markdown. */
function displayName(name: string): string {
  const characters = Array.from(name);
  const cut = characters.length > NAME_MAX_LENGTH ? `${characters.slice(0, NAME_MAX_LENGTH - 1).join("")}…` : name;
  return escapeMarkdown(cut);
}

/** Previous, the page, Next; no buttons when the table fits one page. */
function pageButtons(
  sessionId: string,
  page: number,
  pageCount: number,
): APIActionRowComponent<APIButtonComponentWithCustomId>[] {
  if (pageCount <= 1) return [];
  const last = pageCount - 1;
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        button("◀ Previous", overviewCustomId(sessionId, Math.max(0, page - 1)), page === 0),
        button(`${(page + 1).toString()} / ${pageCount.toString()}`, overviewCustomId(sessionId, page), true),
        button("Next ▶", overviewCustomId(sessionId, Math.min(last, page + 1)), page === last),
      ],
    },
  ];
}

function button(label: string, customId: string, disabled: boolean): APIButtonComponentWithCustomId {
  return { type: ComponentType.Button, style: ButtonStyle.Secondary, label, custom_id: customId, disabled };
}
