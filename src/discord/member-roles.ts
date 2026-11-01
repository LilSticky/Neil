import { z } from "zod";
import { isManagedRoleName, planApply } from "../domain/managed-roles.js";

/** Discord's code for a missing permission: a role above the bot's, or a change to the owner's nickname. */
const MISSING_PERMISSIONS = 50013;

/** A role of the guild as the apply needs it: its exact name, its permission bits (0 when it grants none) and position. */
export interface RoleLike {
  readonly id: string;
  readonly name: string;
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
  readonly ownerId: string;
  /** The position of the bot's highest role: roles at or above it are out of the bot's reach. */
  readonly botTopRolePosition: number;
  readonly roles: readonly RoleLike[];
  createRole(options: NewRoleOptions): Promise<RoleLike>;
}

/** The part of a guild member the apply uses. */
export interface RolesMember {
  readonly id: string;
  readonly roles: readonly RoleLike[];
  addRole(role: RoleLike): Promise<void>;
  removeRole(role: RoleLike): Promise<void>;
  setNickname(nickname: string): Promise<void>;
}

/** What the Member should look like: the nickname (undefined when the Player Name is empty), the Managed Roles wanted, and the Alliance tags Neil manages. */
export interface NameAndRolesWanted {
  readonly nickname: string | undefined;
  readonly roles: readonly string[];
  readonly managedTags: readonly string[];
}

/** Why a step was not done: the role grants permissions, the owner's nickname, a role out of reach, or Discord refused. */
export type SkipReason = "has-permissions" | "owner" | "hierarchy" | "missing-permissions" | "error";

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

/** Creation of a role that is in flight, by guild and then by name, so concurrent applies create it once. */
const creationsByGuild = new WeakMap<RolesGuild, Map<string, Promise<RoleLike>>>();

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

  const held = member.roles.map((role) => role.name).filter((name) => isManagedRoleName(name, wanted.managedTags));
  const plan = planApply(held, wanted.roles);

  for (const name of plan.remove) {
    const skip = await removeRoles(guild, member, name, removed);
    if (skip !== undefined) skipped.push(skip);
  }
  for (const name of plan.add) {
    const skip = await addRole(guild, member, name, { added, created });
    if (skip !== undefined) skipped.push(skip);
  }

  return { nickname, added, removed, created, skipped };
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

async function removeRoles(
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  removed: string[],
): Promise<Skipped | undefined> {
  const held = member.roles.filter((role) => role.name === name);
  try {
    for (const role of held) {
      if (role.position >= guild.botTopRolePosition) return { what: name, reason: "hierarchy" };
      await member.removeRole(role);
    }
    removed.push(name);
    return undefined;
  } catch (error) {
    return { what: name, reason: reasonOf(error) };
  }
}

async function addRole(
  guild: RolesGuild,
  member: RolesMember,
  name: string,
  report: { readonly added: string[]; readonly created: string[] },
): Promise<Skipped | undefined> {
  try {
    const existing = guild.roles.find((role) => role.name === name);
    if (existing !== undefined && existing.permissions.bitfield !== 0n) return { what: name, reason: "has-permissions" };
    const found = existing === undefined ? await createOnce(guild, name) : { role: existing, wasCreated: false };
    if (found.wasCreated) report.created.push(name);
    if (found.role.position >= guild.botTopRolePosition) return { what: name, reason: "hierarchy" };
    await member.addRole(found.role);
    report.added.push(name);
    return undefined;
  } catch (error) {
    return { what: name, reason: reasonOf(error) };
  }
}

/** Creates the role, or joins the creation another apply has in flight for the same name. */
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
  const existing = creationsByGuild.get(guild);
  if (existing !== undefined) return existing;
  const created = new Map<string, Promise<RoleLike>>();
  creationsByGuild.set(guild, created);
  return created;
}

/** The skip reason for an error Discord or the library gave; anything else is "error". */
function reasonOf(error: unknown): SkipReason {
  const parsed = discordError.safeParse(error);
  return parsed.success && parsed.data.code === MISSING_PERMISSIONS ? "missing-permissions" : "error";
}
