import { z } from "zod";
import { isManagedRoleName, planApply, tagOfAllianceRole } from "../domain/managed-roles.js";
import { ALL_PREFERENCE_ROLE_NAMES } from "../domain/preferences.js";
import { DOCTOR_ROLE_NAME } from "../domain/doctor-role.js";
import { ONBOARDING_ROLE_NAME } from "../domain/onboarding-role.js";

/** Discord's code for a missing permission: a role above the bot's, or a change to the owner's nickname. */
const MISSING_PERMISSIONS = 50013;

/**
 * A role of the guild as the apply needs it: its id and exact name, whether an integration owns it, its permission bits
 * (0 when it grants none) and its position.
 */
export interface RoleLike {
  readonly id: string;
  readonly name: string;
  readonly managed: boolean;
  readonly permissions: { readonly bitfield: bigint };
  readonly position: number;
}

/** What a Managed Role is created with: no permissions, not shown apart, not mentionable. */
export interface NewRoleOptions {
  readonly name: string;
  readonly permissions: bigint;
  readonly hoist: boolean;
  readonly mentionable: boolean;
}

/** The part of a guild the apply uses; the discord.js adapter maps a real guild onto it. */
export interface RolesGuild {
  /** The guild's ID, which is also the ID of its @everyone role. */
  readonly id: string;
  readonly ownerId: string;
  /** The position of the bot's highest role: roles at or above it are out of the bot's reach. */
  readonly botTopRolePosition: number;
  readonly roles: readonly RoleLike[];
  createRole(options: NewRoleOptions): Promise<RoleLike>;
  /** Changes the name of the role, keeping its id, so the Members holding it keep it. */
  renameRole(role: RoleLike, name: string): Promise<void>;
}

/** The part of a guild member the apply uses. */
export interface RolesMember {
  readonly id: string;
  /** Whether the Member is a bot account, which Neil never gives a named role. */
  readonly bot: boolean;
  /** The server nickname; null or undefined when the Member has none. */
  readonly nickname?: string | null | undefined;
  readonly roles: readonly RoleLike[];
  addRole(role: RoleLike): Promise<void>;
  removeRole(role: RoleLike): Promise<void>;
  /** null takes the nickname off, so the Member's name is their username again. */
  setNickname(nickname: string | null): Promise<void>;
}

/**
 * What the Member should look like: the nickname (undefined when the Player Name is empty, untouched; null to clear it), the
 * Managed Roles wanted,
 * the Alliance tags Neil manages, and the IDs of the Officer roles, which Neil never gives or takes.
 */
export interface NameAndRolesWanted {
  readonly nickname: string | null | undefined;
  readonly roles: readonly string[];
  readonly managedTags: readonly string[];
  readonly officerRoleIds: readonly string[];
}

/**
 * Why a step was not done: the role grants permissions, the owner's nickname, a role out of reach, a name that is not a
 * Managed Role (an Officer role, @everyone or an integration's role), or Discord refused.
 */
export type SkipReason = "has-permissions" | "owner" | "hierarchy" | "not-managed" | "missing-permissions" | "error";

export interface Skipped {
  readonly what: string;
  readonly reason: SkipReason;
}

/** The outcome of an apply: what changed, what was created, and every step that was skipped. */
export interface ApplyReport {
  /** "untouched" when there was no nickname to set, or the nickname on the server already matches. */
  readonly nickname: "set" | "skipped" | "untouched";
  readonly added: string[];
  readonly removed: string[];
  readonly created: string[];
  readonly skipped: Skipped[];
}

const discordError = z.object({ code: z.number() });

/** Role creations in flight, by guild ID and then by name, so concurrent applies create a missing role once. */
const creationsByGuild = new Map<string, Map<string, Promise<RoleLike>>>();

/**
 * Makes the Member match the wanted nickname and Managed Roles (FR-011). Each step is independent: a step Discord or
 * the rules refuse becomes a skipped entry, and the others still run. Never throws.
 */
export async function applyNameAndRoles(
  guild: RolesGuild,
  member: RolesMember,
  wanted: NameAndRolesWanted,
): Promise<ApplyReport> {
  const added: string[] = [];
  const removed: string[] = [];
  const created: string[] = [];
  const skipped: Skipped[] = [];

  let nickname: ApplyReport["nickname"] = "untouched";
  // A nickname that already matches is not set again: the Daily Sync would otherwise PATCH every Member every day.
  if (wanted.nickname !== undefined && (member.nickname ?? null) !== wanted.nickname) {
    const nicknameSkip = await setNickname(guild, member, wanted.nickname);
    nickname = nicknameSkip === undefined ? "set" : "skipped";
    if (nicknameSkip !== undefined) skipped.push(nicknameSkip);
  }

  await renamePlainAllianceRoles(guild, wanted, skipped);

  // Only roles Neil may hand out count as held: a role with permissions, an Officer role or an integration's is not one.
  const held = [
    ...new Set(
      member.roles
        .filter((role) => isGivable(guild, role, wanted.officerRoleIds) && role.permissions.bitfield === 0n)
        .map((role) => role.name)
        .filter((name) => isManagedRoleName(name, wanted.managedTags)),
    ),
  ];
  const plan = planApply(held, wanted.roles);

  for (const name of plan.remove) {
    const skip = await removeRoles(guild, member, name, wanted.officerRoleIds, removed);
    if (skip !== undefined) skipped.push(skip);
  }
  for (const name of plan.add) {
    const skip = await addRole(guild, member, name, wanted.officerRoleIds, { added, created });
    if (skip !== undefined) skipped.push(skip);
  }

  return { nickname, added, removed, created, skipped };
}

/**
 * Gives the Member the permission-free role of the name, creating it once when the guild has none. A role that grants
 * permissions, or one out of reach, is refused and returned as the skip. An Officer role of the name is never given.
 * Never throws.
 */
export async function giveNamedRole(
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  officerRoleIds: readonly string[],
): Promise<Skipped | undefined> {
  return addRole(guild, member, name, officerRoleIds, { added: [], created: [] });
}

/**
 * Takes the permission-free role of the name off the Member, when they hold it. A role out of reach is left and
 * returned as the skip; so is a held role of the name that grants permissions, which Neil never takes off. An Officer
 * role of the name is never taken off. Never throws.
 */
export async function takeOffNamedRole(
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  officerRoleIds: readonly string[],
): Promise<Skipped | undefined> {
  const skip = await removeRoles(guild, member, name, officerRoleIds, []);
  if (skip !== undefined) return skip;
  const keepsPermissions = member.roles.some(
    (role) => role.name === name && isGivable(guild, role, officerRoleIds) && role.permissions.bitfield !== 0n,
  );
  return keepsPermissions ? { what: name, reason: "has-permissions" } : undefined;
}

/**
 * Renames a plain Alliance role to its bracket name, for each wanted `[TAG]` the guild has no role of (research R5): the
 * role keeps its id, so the Members holding it keep it. Only a permission-free role Neil may give, below the bot's
 * highest role, is renamed. A failed rename is recorded as a skip and never thrown; the apply then creates the role.
 */
async function renamePlainAllianceRoles(guild: RolesGuild, wanted: NameAndRolesWanted, skipped: Skipped[]): Promise<void> {
  for (const bracketed of wanted.roles) {
    const tag = tagOfAllianceRole(bracketed);
    if (tag === undefined) continue;
    if (guild.roles.some((role) => role.name === bracketed)) continue;
    if (isNeilsFixedName(tag)) continue;
    const sameName = guild.roles.filter((role) => role.name === tag);
    if (sameName.length > 1) continue;
    const plain = sameName.find(
      (role) =>
        isGivable(guild, role, wanted.officerRoleIds) &&
        role.permissions.bitfield === 0n &&
        role.position < guild.botTopRolePosition,
    );
    if (plain === undefined) continue;
    try {
      await guild.renameRole(plain, bracketed);
    } catch (error) {
      skipped.push({ what: tag, reason: reasonOf(error) });
    }
  }
}

/**
 * Whether a plain name is one Neil keeps for itself, so a role of that name is never renamed: a Managed Role name such as
 * R5, T10 or #330, a Preference Role name, or the Onboarding or Doctor Role.
 */
function isNeilsFixedName(name: string): boolean {
  return (
    isManagedRoleName(name, []) ||
    ALL_PREFERENCE_ROLE_NAMES.includes(name) ||
    name === ONBOARDING_ROLE_NAME ||
    name === DOCTOR_ROLE_NAME
  );
}

/** Whether Neil may give or take the role: not @everyone, not an integration's, and not an Officer role. */
function isGivable(guild: RolesGuild, role: RoleLike, officerRoleIds: readonly string[]): boolean {
  return role.id !== guild.id && !role.managed && !officerRoleIds.includes(role.id);
}

async function setNickname(guild: RolesGuild, member: RolesMember, nickname: string | null): Promise<Skipped | undefined> {
  if (member.id === guild.ownerId) return { what: "nickname", reason: "owner" };
  try {
    await member.setNickname(nickname);
    return undefined;
  } catch (error) {
    return { what: "nickname", reason: reasonOf(error) };
  }
}

/**
 * Takes off every held role of the name that Neil may give and that grants no permissions. A role out of reach is
 * left and the others are still removed; the first problem is the skip.
 */
async function removeRoles(
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  officerRoleIds: readonly string[],
  removed: string[],
): Promise<Skipped | undefined> {
  const held = member.roles.filter(
    (role) => role.name === name && isGivable(guild, role, officerRoleIds) && role.permissions.bitfield === 0n,
  );
  let skip: Skipped | undefined = undefined;
  let didRemove = false;
  for (const role of held) {
    if (role.position >= guild.botTopRolePosition) {
      skip ??= { what: name, reason: "hierarchy" };
      continue;
    }
    try {
      await member.removeRole(role);
      didRemove = true;
    } catch (error) {
      skip ??= { what: name, reason: reasonOf(error) };
    }
  }
  if (didRemove) removed.push(name);
  return skip;
}

/**
 * Gives the Member the Managed Role of the name: the permission-free role of that name, or a new one when the guild has
 * none. A name held only by Officer roles, @everyone or integration roles is never given, and a name whose roles all
 * grant permissions is skipped.
 */
async function addRole(
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  officerRoleIds: readonly string[],
  report: { readonly added: string[]; readonly created: string[] },
): Promise<Skipped | undefined> {
  try {
    const named = guild.roles.filter((role) => role.name === name);
    const givable = named.filter((role) => isGivable(guild, role, officerRoleIds));
    if (named.length > 0 && givable.length === 0) return { what: name, reason: "not-managed" };
    const free = givable.find((role) => role.permissions.bitfield === 0n);
    if (givable.length > 0 && free === undefined) return { what: name, reason: "has-permissions" };
    const found = free === undefined ? await createOnce(guild, name) : { role: free, wasCreated: false };
    if (found.wasCreated) report.created.push(name);
    if (found.role.position >= guild.botTopRolePosition) return { what: name, reason: "hierarchy" };
    await member.addRole(found.role);
    report.added.push(name);
    return undefined;
  } catch (error) {
    return { what: name, reason: reasonOf(error) };
  }
}

/** Creates the role, or joins the creation another apply has in flight for the same name in the same guild. */
async function createOnce(guild: RolesGuild, name: string): Promise<{ role: RoleLike; wasCreated: boolean }> {
  const inFlight = creationsOf(guild);
  const pending = inFlight.get(name);
  if (pending !== undefined) return { role: await pending, wasCreated: false };
  const creation = guild
    .createRole({ name, permissions: 0n, hoist: false, mentionable: false })
    .finally(() => inFlight.delete(name));
  inFlight.set(name, creation);
  return { role: await creation, wasCreated: true };
}

function creationsOf(guild: RolesGuild): Map<string, Promise<RoleLike>> {
  const existing = creationsByGuild.get(guild.id);
  if (existing !== undefined) return existing;
  const created = new Map<string, Promise<RoleLike>>();
  creationsByGuild.set(guild.id, created);
  return created;
}

/** The skip reason for an error Discord or the library gave; anything else is "error". */
function reasonOf(error: unknown): SkipReason {
  const parsed = discordError.safeParse(error);
  return parsed.success && parsed.data.code === MISSING_PERMISSIONS ? "missing-permissions" : "error";
}
