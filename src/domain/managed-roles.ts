import { bracketFor } from "./troop-bracket.js";
import type { RankOnLink } from "./link.js";
import type { KingdomNumber } from "./lookup-input.js";
import type { Player } from "./player.js";

const ALLIANCE_RANK_NAME = /^R[1-5]$/;
const KINGDOM_NAME = /^#[1-9]\d{0,3}$/;
const TROOP_BRACKET_NAME = /^T(?:[1-9]|10)$/;
const ALLIANCE_ROLE_NAME = /^\[(.+)\]$/;
const ALLIANCE_LEADERS_ROLE_NAME = /^\[(.+)\] Leaders$/;
/** The Alliance Ranks whose holders get their Alliance's Leaders Role. */
const LEADER_RANKS: readonly string[] = ["R4", "R5"];

/** The name of the Alliance role of a tag: the tag in square brackets. */
export function allianceRoleName(tag: string): string {
  return `[${tag}]`;
}

/** The name of the Alliance Leaders Role of a tag: the Alliance role's name, then " Leaders". */
export function allianceLeadersRoleName(tag: string): string {
  return `${allianceRoleName(tag)} Leaders`;
}

/** The tag of an Alliance role's name, undefined when the name carries no brackets. */
export function tagOfAllianceRole(name: string): string | undefined {
  return ALLIANCE_ROLE_NAME.exec(name)?.[1];
}

/**
 * The Managed Role names a Member should hold for a Player (FR-003 to FR-006): the Alliance tag for a Home Kingdom
 * Alliance, the Alliance Rank for a known rank in one and, for an R4 or R5, the Alliance Leaders Role (slice 045),
 * `#<kingdom>` always, and the Troop Bracket when the sanctuary level unlocks one.
 */
export function rolesFor(
  player: Player,
  rank: RankOnLink,
  homeKingdom: KingdomNumber,
  troopBracketLevels: readonly number[],
): string[] {
  const roles: string[] = [];
  if (player.alliance !== undefined && player.kingdom === homeKingdom) {
    roles.push(allianceRoleName(player.alliance.tag));
    if (rank.source === "game-api" || rank.source === "rank-approval") {
      roles.push(rank.rank);
      if (LEADER_RANKS.includes(rank.rank)) roles.push(allianceLeadersRoleName(player.alliance.tag));
    }
  }
  roles.push(`#${player.kingdom.toString()}`);
  const bracket = bracketFor(player.sanctuaryLevel, troopBracketLevels);
  if (bracket !== undefined) roles.push(bracket);
  return roles;
}

/**
 * Whether a role name is one Neil manages: an Alliance Rank, a Kingdom, a Troop Bracket, an Alliance Leaders Role of any
 * tag (so one of an old tag is taken off too), or the Alliance role of a given tag, bracketed or, for a plain role not yet
 * renamed, bare.
 */
export function isManagedRoleName(name: string, allianceTags: readonly string[]): boolean {
  return (
    ALLIANCE_RANK_NAME.test(name) ||
    KINGDOM_NAME.test(name) ||
    TROOP_BRACKET_NAME.test(name) ||
    ALLIANCE_LEADERS_ROLE_NAME.test(name) ||
    allianceTags.includes(name) ||
    allianceTags.some((tag) => allianceRoleName(tag) === name)
  );
}

/** The Managed Roles to add and to remove so that a Member holding `held` ends with exactly `wanted`. */
export function planApply(
  held: readonly string[],
  wanted: readonly string[],
): { readonly add: string[]; readonly remove: string[] } {
  return {
    add: wanted.filter((name) => !held.includes(name)),
    remove: held.filter((name) => !wanted.includes(name)),
  };
}
