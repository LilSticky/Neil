import type { RankOnLink } from "../domain/link.js";
import { ALL_PREFERENCE_ROLE_NAMES, allianceRankOf, preferenceRolesFor } from "../domain/preferences.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import { giveNamedRole, takeOffNamedRole, type RolesGuild, type RolesMember, type Skipped } from "./member-roles.js";
import type { ServerMember, ServerMembers } from "./name-and-roles.js";

export interface PreferenceRolesDeps {
  readonly members: ServerMembers;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly preferences: Pick<PreferenceStore, "get" | "forget">;
  readonly logError: (line: string) => void;
}

/**
 * The Preference Roles: the roles a Member holds for their Preferences and Alliance Rank. Its methods never throw: a
 * failure is logged with the Member and the rest of the change still stands.
 */
export interface PreferenceRoles {
  /**
   * Gives the Member the Preference Roles wanted by their Preferences and rank, and takes off the other Preference Roles
   * they hold. A Member not on the server is left alone.
   */
  apply(memberId: MemberId, rank: RankOnLink): Promise<void>;
  /** Takes every Preference Role off the Member and deletes their Preferences, even when the server cannot be reached. */
  forget(memberId: MemberId): Promise<void>;
}

/** Builds the Preference Roles service. */
export function createPreferenceRoles(deps: PreferenceRolesDeps): PreferenceRoles {
  return {
    apply: (memberId, rank) => applyTo(deps, memberId, rank),
    forget: (memberId) => forgetOf(deps, memberId),
  };
}

/** The change of one Preference Role of one Member: given or taken off, returning the skip when it was not made. */
type Change = (guild: RolesGuild, member: RolesMember, name: string) => Promise<Skipped | undefined>;

async function applyTo(deps: PreferenceRolesDeps, memberId: MemberId, rank: RankOnLink): Promise<void> {
  try {
    const server = await deps.members.memberOf(memberId);
    if (server === undefined) return;
    const wanted = wantedRoles(deps, memberId, rank);
    const held = heldNames(server.member);
    const unwanted = ALL_PREFERENCE_ROLE_NAMES.filter((name) => held.has(name) && !wanted.includes(name));
    const missing = wanted.filter((name) => !held.has(name));
    for (const name of unwanted) await changeAndLog(deps, memberId, server, name, takeOffNamedRole);
    for (const name of missing) await changeAndLog(deps, memberId, server, name, giveNamedRole);
  } catch (error) {
    deps.logError(`Changing the Preference Roles of ${memberId} failed: ${reasonOf(error)}`);
  }
}

/** The Preference Roles a Member wants: none at all while the Member is not Linked, so their held ones all come off. */
function wantedRoles(deps: PreferenceRolesDeps, memberId: MemberId, rank: RankOnLink): readonly string[] {
  if (deps.links.linkFor(memberId) === undefined) return [];
  return preferenceRolesFor(deps.preferences.get(memberId), allianceRankOf(rank));
}

async function forgetOf(deps: PreferenceRolesDeps, memberId: MemberId): Promise<void> {
  try {
    const server = await deps.members.memberOf(memberId);
    if (server !== undefined) {
      const held = heldNames(server.member);
      for (const name of ALL_PREFERENCE_ROLE_NAMES) {
        if (held.has(name)) await changeAndLog(deps, memberId, server, name, takeOffNamedRole);
      }
    }
  } catch (error) {
    deps.logError(`Taking the Preference Roles off ${memberId} failed: ${reasonOf(error)}`);
  }
  try {
    deps.preferences.forget(memberId);
  } catch (error) {
    deps.logError(`Deleting the Preferences of ${memberId} failed: ${reasonOf(error)}`);
  }
}

/** Makes the change and logs a skip with the Member and the role. */
async function changeAndLog(
  deps: PreferenceRolesDeps,
  memberId: MemberId,
  server: ServerMember,
  name: string,
  change: Change,
): Promise<void> {
  const skip = await change(server.guild, server.member, name);
  if (skip !== undefined) {
    deps.logError(`Changing the ${name} Preference Role of ${memberId} was skipped: ${skip.reason}`);
  }
}

/** The names of the roles a Member holds. */
function heldNames(member: RolesMember): Set<string> {
  return new Set(member.roles.map((role) => role.name));
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
