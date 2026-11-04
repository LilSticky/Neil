import { ALL_PREFERENCE_ROLE_NAMES, allianceRankOf, preferenceRolesFor, type InterestKey } from "../domain/preferences.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import { giveNamedRole, takeOffNamedRole, type RolesGuild, type RolesMember, type Skipped } from "./member-roles.js";
import type { ServerMember, ServerMembers } from "./name-and-roles.js";
import type { OnboardingChannels } from "./onboarding-channels.js";

export interface PreferenceRolesDeps {
  readonly members: ServerMembers;
  readonly links: Pick<LinkStore, "linkFor" | "pendingFor">;
  readonly preferences: Pick<PreferenceStore, "get" | "setInterests" | "forget" | "prompt">;
  readonly channels: Pick<OnboardingChannels, "deleteThread">;
  readonly logError: (line: string) => void;
  /** The log channel's line for a change of roles: one per apply that changed a role. */
  readonly log: (line: string) => void;
  /** The Officer roles of the server: Neil never gives or takes one, even one named like a Preference Role. */
  readonly officerRoleIds: readonly string[];
}

/**
 * The Preference Roles: the roles a Member holds for their Preferences and Alliance Rank. Its methods never throw: a
 * failure is logged with the Member and the rest of the change still stands. Changes to one Member run one after
 * another, so an apply and a forget never interleave.
 */
export interface PreferenceRoles {
  /**
   * Gives the Member the Preference Roles wanted by their Preferences and Alliance Rank (read from the Link when the
   * change runs), and takes off the other Preference Roles they hold. A Member not on the server is left alone.
   */
  apply(memberId: MemberId): Promise<void>;
  /**
   * Takes every Preference Role off the Member, deletes the thread of their open Preferences message (unless a Rank
   * Approval of theirs is pending) and deletes their Preferences, even when the server or the thread cannot be reached.
   */
  forget(memberId: MemberId): Promise<void>;
}

/** Builds the Preference Roles service. */
export function createPreferenceRoles(deps: PreferenceRolesDeps): PreferenceRoles {
  const queues = new Map<MemberId, Promise<void>>();
  return {
    apply: (memberId) => queueFor(deps, queues, memberId, () => applyTo(deps, memberId)),
    forget: (memberId) => queueFor(deps, queues, memberId, () => forgetOf(deps, memberId)),
  };
}

/**
 * Runs the work after the changes already queued for the Member. The returned promise never rejects, and a failed change
 * does not stop the ones queued after it.
 */
function queueFor(
  deps: PreferenceRolesDeps,
  queues: Map<MemberId, Promise<void>>,
  memberId: MemberId,
  work: () => Promise<void>,
): Promise<void> {
  const previous = queues.get(memberId) ?? Promise.resolve();
  const settled = previous
    .then(work)
    .catch((error: unknown) => {
      deps.logError(`Changing the Preference Roles of ${memberId} failed: ${reasonOf(error)}`);
    });
  queues.set(memberId, settled);
  void settled.then(() => {
    if (queues.get(memberId) === settled) queues.delete(memberId);
  });
  return settled;
}

async function applyTo(deps: PreferenceRolesDeps, memberId: MemberId): Promise<void> {
  try {
    const link = deps.links.linkFor(memberId);
    const rank = link === undefined ? undefined : allianceRankOf(link.allianceRank);
    if (rank === "R5") keepNapDiscussions(deps, memberId);
    const server = await deps.members.memberOf(memberId);
    if (server === undefined) return;
    const wanted = link === undefined ? [] : preferenceRolesFor(deps.preferences.get(memberId), rank);
    const held = heldNames(server.member);
    const unwanted = ALL_PREFERENCE_ROLE_NAMES.filter((name) => held.has(name) && !wanted.includes(name));
    const missing = wanted.filter((name) => !held.has(name));
    const taken = await changeEach(deps, memberId, server, unwanted, takeOffNamedRole);
    const given = await changeEach(deps, memberId, server, missing, giveNamedRole);
    if (taken.length + given.length > 0) deps.log(changesLogLine(memberId, given, taken));
  } catch (error) {
    deps.logError(`Changing the Preference Roles of ${memberId} failed: ${reasonOf(error)}`);
  }
}

/**
 * An R5 is given NaP discussions by rank. The choice is also stored as the Member's Interest, so that a Member demoted to
 * R4 keeps them: the stored Interest is what the R4 rule reads.
 */
function keepNapDiscussions(deps: PreferenceRolesDeps, memberId: MemberId): void {
  const interests = deps.preferences.get(memberId).interests;
  if (interests.has("nap")) return;
  const stored = new Set<InterestKey>([...interests, "nap"]);
  deps.preferences.setInterests(memberId, stored);
}

async function forgetOf(deps: PreferenceRolesDeps, memberId: MemberId): Promise<void> {
  try {
    const server = await deps.members.memberOf(memberId);
    if (server !== undefined) {
      const held = heldNames(server.member);
      const heldPreferenceRoles = ALL_PREFERENCE_ROLE_NAMES.filter((name) => held.has(name));
      await changeEach(deps, memberId, server, heldPreferenceRoles, takeOffNamedRole);
    }
  } catch (error) {
    deps.logError(`Taking the Preference Roles off ${memberId} failed: ${reasonOf(error)}`);
  }
  await deleteOpenPromptThread(deps, memberId);
  try {
    deps.preferences.forget(memberId);
  } catch (error) {
    deps.logError(`Deleting the Preferences of ${memberId} failed: ${reasonOf(error)}`);
  }
}

/**
 * Deletes the thread of the Member's open Preferences message, unless a Rank Approval of theirs is pending: that Rank
 * Approval deletes the thread when it ends. Never throws: a failure is logged.
 */
async function deleteOpenPromptThread(deps: PreferenceRolesDeps, memberId: MemberId): Promise<void> {
  try {
    const prompt = deps.preferences.prompt(memberId);
    if (prompt === undefined || deps.links.pendingFor(memberId) !== undefined) return;
    await deps.channels.deleteThread(prompt.threadId);
  } catch (error) {
    deps.logError(`Deleting the Preferences message of ${memberId} failed: ${reasonOf(error)}`);
  }
}

/** The change of one Preference Role of one Member: given or taken off, returning the skip when it was not made. */
type Change = (
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  officerRoleIds: readonly string[],
) => Promise<Skipped | undefined>;

/** Makes each change in turn, logs a skip with the Member and the role, and returns the names actually changed. */
async function changeEach(
  deps: PreferenceRolesDeps,
  memberId: MemberId,
  server: ServerMember,
  names: readonly string[],
  change: Change,
): Promise<string[]> {
  const changed: string[] = [];
  for (const name of names) {
    const skip = await change(server.guild, server.member, name, deps.officerRoleIds);
    if (skip === undefined) {
      changed.push(name);
    } else {
      deps.logError(`Changing the ${name} Preference Role of ${memberId} was skipped: ${skip.reason}`);
    }
  }
  return changed;
}

/** One line for the log channel: the Member, the roles given and the roles taken off. */
function changesLogLine(memberId: MemberId, given: readonly string[], taken: readonly string[]): string {
  const parts: string[] = [];
  if (given.length > 0) parts.push(`given ${given.join(", ")}`);
  if (taken.length > 0) parts.push(`taken off ${taken.join(", ")}`);
  return `Preference Roles of <@${memberId}>: ${parts.join("; ")}.`;
}

/** The names of the roles a Member holds. */
function heldNames(member: RolesMember): Set<string> {
  return new Set(member.roles.map((role) => role.name));
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
