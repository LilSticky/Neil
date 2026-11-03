import type { RankOnLink } from "./link.js";
import type { KingdomNumber } from "./lookup-input.js";
import type { Player } from "./player.js";

/** Discord's limit for a nickname. */
const NICKNAME_MAX_LENGTH = 32;

/**
 * The nickname for a Linked Player (FR-002): `[TAG|Rn] Name | #K`. The tag is shown in any Alliance, the rank only
 * for R4 and R5, and the Kingdom only for a Guest. Cuts the Player Name to fit 32 characters; only when the tag, the
 * rank and the Kingdom alone are too long is the tag cut too. Undefined when the Player Name is empty, so the
 * nickname is left as it is.
 */
export function nicknameFor(player: Player, rank: RankOnLink, homeKingdom: KingdomNumber): string | undefined {
  if (player.name.trim().length === 0) return undefined;

  const suffix = player.kingdom === homeKingdom ? "" : ` | #${player.kingdom.toString()}`;
  const tag = player.alliance?.tag;
  const rankPart = shownRankPart(player, rank);
  const fullPrefix = alliancePrefix(tag, rankPart);
  const fits = fullPrefix.length + suffix.length <= NICKNAME_MAX_LENGTH;
  const prefix = tag === undefined || fits ? fullPrefix : alliancePrefix(cutTag(tag, rankPart, suffix), rankPart);
  const room = Math.max(0, NICKNAME_MAX_LENGTH - prefix.length - suffix.length);
  const name = Array.from(player.name).slice(0, room).join("");
  return `${prefix}${name}${suffix}`;
}

/** The rank shown after the tag, `|R4` or `|R5`; empty for any other rank or none. */
function shownRankPart(player: Player, rank: RankOnLink): string {
  if (player.alliance === undefined) return "";
  const shownRank = rank.source === "game-api" || rank.source === "rank-approval" ? rank.rank : undefined;
  return shownRank === "R4" || shownRank === "R5" ? `|${shownRank}` : "";
}

/** The tag as a prefix: `[TAG|Rn] ` with the rank part, or `[TAG] ` without; empty when there is no Alliance. */
function alliancePrefix(tag: string | undefined, rankPart: string): string {
  return tag === undefined ? "" : `[${tag}${rankPart}] `;
}

/** The tag cut so that its prefix and the Kingdom fit in 32 characters; the Player Name is then left no room. */
function cutTag(tag: string, rankPart: string, suffix: string): string {
  // The brackets and the space after them take three characters.
  const room = Math.max(0, NICKNAME_MAX_LENGTH - suffix.length - rankPart.length - 3);
  return Array.from(tag).slice(0, room).join("");
}
