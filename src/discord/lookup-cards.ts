import { escapeMarkdown, type APIEmbed, type APIEmbedField } from "discord.js";
import type { AllianceKey, KingdomNumber } from "../domain/lookup-input.js";
import type { Alliance, Match, Player } from "../domain/player.js";

const FOOTER = "Data from Last Asylum Tracker";
const TITLE_MAX_LENGTH = 256;
const AMBIGUOUS_LIST_LIMIT = 10;

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
export function renderPlayerCard(player: Player): APIEmbed {
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
    footer: { text: FOOTER },
  };
}

/** The public card for an Alliance. Every Game API text is escaped; a missing Leader reads Unknown. */
export function renderAllianceCard(alliance: Alliance): APIEmbed {
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
  return {
    title: fitTitle(`[${escapeText(alliance.tag)}] ${escapeText(alliance.name)}`),
    fields,
    footer: { text: FOOTER },
  };
}

/** One candidate of an ambiguous lookup, as `[tag] name`; a field the Game left out reads Unknown. */
function matchLabel(match: Match): string {
  return `[${escapeText(match.tag ?? "Unknown")}] ${escapeText(match.name ?? "Unknown")}`;
}

/** Texts Neil sends privately when a lookup does not give a card. Interpolated input is escaped. */
export const lookupMessages = {
  invalidUid:
    "That doesn't look like a uid. A uid is a number: in the game, tap your profile picture (top left), then the feather next to your name; the number under the picture is your uid.",
  invalidKingdom: "The kingdom must be a number from 1 to 9999.",
  invalidAlliance: "Give the alliance's tag or full name (up to 40 characters).",
  playerNotFound: (uid: string): string => `No player has the uid ${escapeText(uid)}.`,
  allianceNotFound: (key: AllianceKey, kingdom: KingdomNumber): string =>
    `No alliance "${escapeText(key)}" in kingdom #${kingdom.toString()}.`,
  ambiguous: (key: AllianceKey, matches: readonly Match[]): string => {
    const listed = matches.slice(0, AMBIGUOUS_LIST_LIMIT).map(matchLabel).join(", ");
    const more = matches.length - AMBIGUOUS_LIST_LIMIT;
    const rest = more > 0 ? ` and ${more.toString()} more` : "";
    return `More than one alliance matches "${escapeText(key)}": ${listed}${rest}. Try the exact tag.`;
  },
  quotaSpent: "Lookups are used up for today. They work again after 00:00 UTC.",
  tryAgain: "The game tracker is busy right now. Try again in a moment.",
  unavailable: "Lookups are not working right now. Please tell an Officer.",
} as const;
