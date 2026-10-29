import { escapeMarkdown, type APIEmbed, type APIEmbedField } from "discord.js";
import type { Player } from "../domain/player.js";

const FOOTER = "Data from Last Asylum Tracker";

/** Escapes Game API and user text for Discord markdown; discord.js leaves a lone `~` alone, so it is escaped here. */
function escapeText(text: string): string {
  return escapeMarkdown(text).replaceAll("~", "\\~");
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
    title: escapeText(player.name),
    fields,
    footer: { text: FOOTER },
  };
}

/** Texts Neil sends privately when a lookup does not give a card. Interpolated input is escaped. */
export const lookupMessages = {
  invalidUid:
    "That doesn't look like a uid. A uid is a number: in the game, tap your profile picture (top left), then the feather next to your name; the number under the picture is your uid.",
  playerNotFound: (uid: string): string => `No player has the uid ${escapeText(uid)}.`,
  quotaSpent: "Lookups are used up for today. They work again after 00:00 UTC.",
  tryAgain: "The game tracker is busy right now. Try again in a moment.",
  unavailable: "Lookups are not working right now. Please tell an Officer.",
} as const;
