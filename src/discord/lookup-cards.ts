import {
  ButtonStyle,
  ComponentType,
  escapeMarkdown,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type APIEmbedField,
  type APIStringSelectComponent,
} from "discord.js";
import { sortRoster } from "../domain/alliance-rank.js";
import { utcDayOf } from "../domain/daily-quota.js";
import type { AllianceKey, KingdomNumber, PlayerName } from "../domain/lookup-input.js";
import {
  listedAllianceMatches,
  listedPlayerMatches,
  type AllianceRank,
  type Alliance,
  type Match,
  type PickableAllianceMatch,
  type PickablePlayerMatch,
  type Player,
  type RosterEntry,
} from "../domain/player.js";
import { clampPage, pageCount, pageOf } from "./pick-sessions.js";

const FOOTER_SOURCE = "Data from Last Asylum Tracker";
const TITLE_MAX_LENGTH = 256;
/** Discord's limits: a field's value, and everything in one embed (title, footers, field names and values). */
const FIELD_VALUE_MAX_LENGTH = 1024;
const EMBED_MAX_LENGTH = 6000;
const ROSTER_FIELD = "Roster";
const EMPTY_ROSTER_TEXT = "The tracker lists no members.";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

/** The time from now until a moment, as "in 3 h 12 min", "in 59 min" or "in under a minute"; seconds are dropped. */
export function timeLeft(until: Date, now: Date): string {
  const ms = Math.max(0, until.getTime() - now.getTime());
  if (ms < MINUTE_MS) return "in under a minute";
  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
  return hours > 0 ? `in ${hours.toString()} h ${minutes.toString()} min` : `in ${minutes.toString()} min`;
}

/** A moment as "HH:MM UTC". Formatted by hand so no locale changes it. */
export function utcTime(moment: Date): string {
  return `${twoDigits(moment.getUTCHours())}:${twoDigits(moment.getUTCMinutes())} UTC`;
}

/**
 * The card footer: the source and when the data was fetched, in UTC. Today's fetch shows the time only; an earlier
 * day shows the day and English month too.
 */
function footerFor(fetchedAt: Date, now: Date): { readonly text: string } {
  const time = utcTime(fetchedAt);
  const when = utcDayOf(fetchedAt) === utcDayOf(now)
    ? time
    : `${fetchedAt.getUTCDate().toString()} ${MONTHS[fetchedAt.getUTCMonth()] ?? ""} ${time}`;
  return { text: `${FOOTER_SOURCE} · as of ${when}` };
}

/** Escapes Game API and user text for Discord markdown; discord.js leaves a lone `~` alone, so it is escaped here. */
function escapeText(text: string): string {
  return escapeMarkdown(text).replaceAll("~", "\\~");
}

/**
 * Fits an escaped title into Discord's 256 characters, ending with an ellipsis. It cuts after escaping, so the
 * limit counts what Discord shows, and it never leaves a backslash without the character it escapes.
 */
function fitTitle(escaped: string): string {
  if (escaped.length <= TITLE_MAX_LENGTH) return escaped;
  let kept = escaped.slice(0, TITLE_MAX_LENGTH - 1);
  const trailingBackslashes = /\\*$/.exec(kept)?.[0] ?? "";
  if (trailingBackslashes.length % 2 === 1) kept = kept.slice(0, -1);
  return `${kept}…`;
}

/** A Game API text for a field: the escaped text, or Unknown when the Game left it out or sent it empty. */
function valueOrUnknown(text: string | undefined): string {
  return text === undefined || text === "" ? "Unknown" : escapeText(text);
}

/** The public card for a Player. Every Game API text is escaped, so names cannot format or ping. */
export function renderPlayerCard(player: Player, fetchedAt: Date, now: Date): APIEmbed {
  const alliance =
    player.alliance === undefined
      ? "No alliance"
      : `[${escapeText(player.alliance.tag)}] ${escapeText(player.alliance.name)}`;
  const fields: APIEmbedField[] = [
    { name: "uid", value: escapeText(player.uid), inline: true },
    { name: "Kingdom", value: `#${player.kingdom.toString()}`, inline: true },
    { name: "Power", value: player.power.toLocaleString("en-US"), inline: true },
    { name: "Sanctuary level", value: player.sanctuaryLevel.toString(), inline: true },
    { name: "Alliance", value: alliance, inline: true },
  ];
  if (player.alliance !== undefined) {
    const rank = player.allianceRank === "unknown" ? "Unknown" : player.allianceRank;
    fields.push({ name: "Alliance Rank", value: rank, inline: true });
  }
  return {
    title: fitTitle(escapeText(player.name)),
    fields,
    footer: footerFor(fetchedAt, now),
  };
}

/** The characters Discord counts toward an embed's limit: the title, the footer and every field's name and value. */
function embedCharacters(embed: APIEmbed): number {
  const texts = [
    embed.title ?? "",
    embed.footer?.text ?? "",
    ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
  ];
  return texts.reduce((total, text) => total + text.length, 0);
}

/** One roster row as the card shows it: the escaped name and the uid. */
function rosterRow(entry: RosterEntry): string {
  return `${escapeText(entry.name)} · ${escapeText(entry.uid)}`;
}

/** An Alliance Rank as a field or menu label: R1–R5, or Unknown. */
function rankLabel(rank: AllianceRank): string {
  return rank === "unknown" ? "Unknown" : rank;
}

interface RosterField {
  readonly rank: AllianceRank;
  readonly name: string;
  value: string;
}

/**
 * The roster rows that fit in `budget` characters, as fields in order: one field per rank, continued past 1,024
 * characters. Stops at the first row that does not fit; `shown` counts the rows taken.
 */
function rosterFields(
  entries: readonly RosterEntry[],
  budget: number,
): { readonly fields: APIEmbedField[]; readonly shown: number } {
  const fields: RosterField[] = [];
  let used = 0;
  let shown = 0;
  for (const entry of entries) {
    const row = rosterRow(entry);
    const current = fields.at(-1);
    const sameRank = current !== undefined && current.rank === entry.allianceRank;

    if (current !== undefined && sameRank && current.value.length + 1 + row.length <= FIELD_VALUE_MAX_LENGTH) {
      if (used + 1 + row.length > budget) break;
      current.value = `${current.value}\n${row}`;
      used += 1 + row.length;
    } else {
      const label = rankLabel(entry.allianceRank);
      const name = sameRank ? `${label} (cont.)` : label;
      if (used + name.length + row.length > budget) break;
      fields.push({ rank: entry.allianceRank, name, value: row });
      used += name.length + row.length;
    }
    shown += 1;
  }
  return { fields: fields.map(({ name, value }) => ({ name, value })), shown };
}

/** The note that replaces the rows left out of a card; the menu below still covers all of them. */
function rosterNote(hidden: number): string {
  return `… and ${hidden.toString()} more, see the menu below`;
}

/**
 * The roster fields of a card: an empty roster reads so; otherwise the rows that fit under Discord's embed limit,
 * with a note counting the rest when some do not. `fixed` is what the rest of the embed already takes.
 */
function rosterSection(roster: readonly RosterEntry[], fixed: number): APIEmbedField[] {
  if (roster.length === 0) return [{ name: ROSTER_FIELD, value: EMPTY_ROSTER_TEXT }];

  const ordered = sortRoster(roster);
  const everything = rosterFields(ordered, EMBED_MAX_LENGTH - fixed);
  if (everything.shown === ordered.length) return everything.fields;

  // The reserve is for the note at its longest, when every row is left out.
  const reserve = ROSTER_FIELD.length + rosterNote(ordered.length).length;
  const fitted = rosterFields(ordered, EMBED_MAX_LENGTH - fixed - reserve);
  const hidden = ordered.length - fitted.shown;
  return [...fitted.fields, { name: ROSTER_FIELD, value: rosterNote(hidden) }];
}

/** The public card for an Alliance. Every Game API text is escaped; a missing Leader reads Unknown. */
export function renderAllianceCard(alliance: Alliance, fetchedAt: Date, now: Date): APIEmbed {
  const fields: APIEmbedField[] = [
    { name: "Kingdom", value: `#${alliance.kingdom.toString()}`, inline: true },
    { name: "Power", value: alliance.power.toLocaleString("en-US"), inline: true },
    {
      name: "Members",
      value: `${alliance.memberCount.toString()}/${alliance.capacity.toString()}`,
      inline: true,
    },
    {
      name: "Leader",
      value: valueOrUnknown(alliance.leaderName),
      inline: true,
    },
  ];
  const embed: APIEmbed = {
    title: fitTitle(`[${escapeText(alliance.tag)}] ${escapeText(alliance.name)}`),
    fields,
    footer: footerFor(fetchedAt, now),
  };
  return { ...embed, fields: [...fields, ...rosterSection(alliance.roster, embedCharacters(embed))] };
}

/** The Player pick list's note when matches were left out. */
const PLAYER_PICK_LIMIT_NOTE = "Only the first 25 are listed; add a kingdom to narrow it.";

/** Texts Neil sends privately when a lookup does not give a card. Interpolated input is escaped. */
export const lookupMessages = {
  giveUidOrName: "Give a uid, or a name (and optionally a kingdom).",
  invalidUid:
    "That doesn't look like a uid. A uid is a number: in the game, tap your profile picture (top left), then the feather next to your name; the number under the picture is your uid.",
  invalidPlayerName: "Give the player's complete in-game name (up to 32 characters).",
  invalidKingdom: "The kingdom must be a number from 1 to 9999.",
  invalidAlliance: "Give the alliance's tag (up to 40 characters).",
  playerNotFound: (uid: string): string => `No player has the uid ${escapeText(uid)}.`,
  playerNotPrepared: (uid: string): string =>
    `Couldn't find a player with the uid ${escapeText(uid)}. Check the uid; if it's right, the tracker may be busy, so try again later.`,
  playerNameNotFound: (name: PlayerName, kingdom: KingdomNumber | undefined): string => {
    const inKingdom = kingdom === undefined ? "" : ` in kingdom #${kingdom.toString()}`;
    return `No player is named "${escapeText(name)}"${inKingdom}. The name must be complete; a uid always works.`;
  },
  playerNameNotPrepared: (name: PlayerName): string =>
    `Couldn't find a player named "${escapeText(name)}". Check the name; if it's right, the tracker may be busy, so try again later.`,
  allianceNotFound: (key: AllianceKey, kingdom: KingdomNumber): string =>
    `No alliance "${escapeText(key)}" in kingdom #${kingdom.toString()}.`,
  quotaSpent: (resetsAt: Date, now: Date): string =>
    `Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC (${timeLeft(resetsAt, now)}).`,
  reserveKept: (resetsAt: Date, now: Date): string =>
    `Lookups are paused for today: the rest of the Daily Quota is kept for interviewing new members. They work again at 00:00 UTC (${timeLeft(resetsAt, now)}).`,
  tryAgain: "The game tracker is busy right now. Try again in a moment.",
  unavailable: "Lookups are not working right now. Please tell an Officer.",
  showing: (label: string): string => `Showing ${escapeText(label)}.`,
  giveKingdomAndTagOrName: "Give the kingdom and the alliance tag, or the alliance's exact full name.",
  allianceNameNotFound: (key: AllianceKey): string =>
    `No alliance is named exactly "${escapeText(key)}". Use the full name, or the kingdom and tag; approximate names are not supported.`,
} as const;

/** A Player match as the pick list labels it: its name and Kingdom. */
export function playerPickLabel(match: PickablePlayerMatch): string {
  return `${match.name ?? "Unknown"} · kingdom #${match.kingdom.toString()}`;
}

/**
 * The private pick list for an ambiguous Player name: a select menu of the pickable matches, valued by their index
 * in the list, under the session id the pick handler looks up.
 */
export function renderPlayerPickList(
  name: PlayerName,
  matches: readonly Match[],
  sessionId: string,
): { readonly content: string; readonly components: APIActionRowComponent<APIStringSelectComponent>[] } {
  const { listed, leftOut } = listedPlayerMatches(matches);
  const note = leftOut > 0 ? `\n${PLAYER_PICK_LIMIT_NOTE}` : "";
  const options = listed.map((match, index) => ({
    label: playerPickLabel(match),
    value: index.toString(),
  }));
  return {
    content: `Several players are named "${escapeText(name)}". Pick one:${note}`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [{ type: ComponentType.StringSelect, custom_id: `pick:${sessionId}:select`, options }],
      },
    ],
  };
}

/** The Alliance pick list's note when matches were left out. */
const ALLIANCE_PICK_LIMIT_NOTE = "Only the first 25 are listed; use the kingdom and tag.";

/** An Alliance match as the pick list labels it: its tag, name and Kingdom. */
export function alliancePickLabel(match: PickableAllianceMatch): string {
  return `[${match.tag}] ${match.name ?? "Unknown"} · kingdom #${match.kingdom.toString()}`;
}

/**
 * The private pick list for an ambiguous Alliance name: a select menu of the pickable matches, valued by their index
 * in the list, under the session id the pick handler looks up.
 */
export function renderAlliancePickList(
  key: AllianceKey,
  matches: readonly Match[],
  sessionId: string,
): { readonly content: string; readonly components: APIActionRowComponent<APIStringSelectComponent>[] } {
  const { listed, leftOut } = listedAllianceMatches(matches);
  const note = leftOut > 0 ? `\n${ALLIANCE_PICK_LIMIT_NOTE}` : "";
  const options = listed.map((match, index) => ({
    label: alliancePickLabel(match),
    value: index.toString(),
  }));
  return {
    content: `Several alliances are named "${escapeText(key)}". Pick one:${note}`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [{ type: ComponentType.StringSelect, custom_id: `pick:${sessionId}:select`, options }],
      },
    ],
  };
}

/**
 * The roster menu under an Alliance card: a select menu of the page's members (by rank and name, valued by index on
 * the page), and past one page a row of Previous, the page and Next. The roster is ordered as the card orders it.
 * An empty roster has no menu.
 */
export function renderRosterComponents(
  entries: readonly RosterEntry[],
  page: number,
  sessionId: string,
): APIActionRowComponent<APIComponentInMessageActionRow>[] {
  if (entries.length === 0) return [];

  const ordered = sortRoster(entries);
  const pages = pageCount(ordered);
  const current = clampPage(page, ordered);
  const options = pageOf(ordered, current).map((entry, index) => ({
    label: `${rankLabel(entry.allianceRank)} · ${entry.name}`,
    description: `uid ${entry.uid}`,
    value: index.toString(),
  }));
  const rows: APIActionRowComponent<APIComponentInMessageActionRow>[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: `pick:${sessionId}:select`,
          placeholder: "Look up a member…",
          options,
        },
      ],
    },
  ];

  if (pages > 1) {
    rows.push({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: "◀ Previous",
          custom_id: `pick:${sessionId}:page:${Math.max(0, current - 1).toString()}`,
          disabled: current === 0,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: `Page ${(current + 1).toString()}/${pages.toString()}`,
          custom_id: `pick:${sessionId}:page:${current.toString()}`,
          disabled: true,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: "Next ▶",
          custom_id: `pick:${sessionId}:page:${Math.min(pages - 1, current + 1).toString()}`,
          disabled: current === pages - 1,
        },
      ],
    });
  }
  return rows;
}
