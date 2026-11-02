import { z } from "zod";
import { isManagedRoleName, planApply } from "../domain/managed-roles.js";

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
}

/** The part of a guild member the apply uses. */
export interface RolesMember {
  readonly id: string;
  /** The server nickname; null or undefined when the Member has none. */
  readonly nickname?: string | null | undefined;
  readonly roles: readonly RoleLike[];
  addRole(role: RoleLike): Promise<void>;
  removeRole(role: RoleLike): Promise<void>;
  setNickname(nickname: string): Promise<void>;
}

/**
 * What the Member should look like: the nickname (undefined when the Player Name is empty), the Managed Roles wanted,
 * the Alliance tags Neil manages, and the IDs of the Officer roles, which Neil never gives or takes.
 */
export interface NameAndRolesWanted {
  readonly nickname: string | undefined;
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
  /** "untouched" when there was no nickname to set. */
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
  if (wanted.nickname !== undefined) {
    const nicknameSkip = await setNickname(guild, member, wanted.nickname);
    nickname = nicknameSkip === undefined ? "set" : "skipped";
    if (nicknameSkip !== undefined) skipped.push(nicknameSkip);
  }

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

/** Whether Neil may give or take the role: not @everyone, not an integration's, and not an Officer role. */
function isGivable(guild: RolesGuild, role: RoleLike, officerRoleIds: readonly string[]): boolean {
  return role.id !== guild.id && !role.managed && !officerRoleIds.includes(role.id);
}

async function setNickname(guild: RolesGuild, member: RolesMember, nickname: string): Promise<Skipped | undefined> {
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
