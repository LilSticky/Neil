import type { RankOnLink } from "./link.js";
import type { KingdomNumber } from "./lookup-input.js";
import type { Player } from "./player.js";

/** Discord's limit for a nickname. */
const NICKNAME_MAX_LENGTH = 32;

/**
 * The nickname for a Linked Player (FR-002): `[TAG|Rn] Name | #K`. The tag is shown in any Alliance, the rank only
 * for R4 and R5, and the Kingdom only for a Guest. Cuts the Player Name, never the rest, to 32 characters.
 * Undefined when the Player Name is empty, so the nickname is left as it is.
 */
export function nicknameFor(player: Player, rank: RankOnLink, homeKingdom: KingdomNumber): string | undefined {
  if (player.name.trim().length === 0) return undefined;

  const prefix = alliancePrefix(player, rank);
  const suffix = player.kingdom === homeKingdom ? "" : ` | #${player.kingdom.toString()}`;
  const room = Math.max(0, NICKNAME_MAX_LENGTH - prefix.length - suffix.length);
  const name = Array.from(player.name).slice(0, room).join("");
  return `${prefix}${name}${suffix}`;
}

function alliancePrefix(player: Player, rank: RankOnLink): string {
  if (player.alliance === undefined) return "";
  const shownRank = rank.source === "game-api" || rank.source === "rank-approval" ? rank.rank : undefined;
  const showsRank = shownRank === "R4" || shownRank === "R5";
  return showsRank ? `[${player.alliance.tag}|${shownRank}] ` : `[${player.alliance.tag}] `;
}
