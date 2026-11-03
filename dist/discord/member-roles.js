import { z } from "zod";
import { isManagedRoleName, planApply } from "../domain/managed-roles.js";
/** Discord's code for a missing permission: a role above the bot's, or a change to the owner's nickname. */
const MISSING_PERMISSIONS = 50013;
const discordError = z.object({ code: z.number() });
/** Role creations in flight, by guild ID and then by name, so concurrent applies create a missing role once. */
const creationsByGuild = new Map();
/**
 * Makes the Member match the wanted nickname and Managed Roles (FR-011). Each step is independent: a step Discord or
 * the rules refuse becomes a skipped entry, and the others still run. Never throws.
 */
export async function applyNameAndRoles(guild, member, wanted) {
    const added = [];
    const removed = [];
    const created = [];
    const skipped = [];
    let nickname = "untouched";
    if (wanted.nickname !== undefined) {
        const nicknameSkip = await setNickname(guild, member, wanted.nickname);
        nickname = nicknameSkip === undefined ? "set" : "skipped";
        if (nicknameSkip !== undefined)
            skipped.push(nicknameSkip);
    }
    // Only roles Neil may hand out count as held: a role with permissions, an Officer role or an integration's is not one.
    const held = [
        ...new Set(member.roles
            .filter((role) => isGivable(guild, role, wanted.officerRoleIds) && role.permissions.bitfield === 0n)
            .map((role) => role.name)
            .filter((name) => isManagedRoleName(name, wanted.managedTags))),
    ];
    const plan = planApply(held, wanted.roles);
    for (const name of plan.remove) {
        const skip = await removeRoles(guild, member, name, wanted.officerRoleIds, removed);
        if (skip !== undefined)
            skipped.push(skip);
    }
    for (const name of plan.add) {
        const skip = await addRole(guild, member, name, wanted.officerRoleIds, { added, created });
        if (skip !== undefined)
            skipped.push(skip);
    }
    return { nickname, added, removed, created, skipped };
}
/** Whether Neil may give or take the role: not @everyone, not an integration's, and not an Officer role. */
function isGivable(guild, role, officerRoleIds) {
    return role.id !== guild.id && !role.managed && !officerRoleIds.includes(role.id);
}
async function setNickname(guild, member, nickname) {
    if (member.id === guild.ownerId)
        return { what: "nickname", reason: "owner" };
    try {
        await member.setNickname(nickname);
        return undefined;
    }
    catch (error) {
        return { what: "nickname", reason: reasonOf(error) };
    }
}
/**
 * Takes off every held role of the name that Neil may give and that grants no permissions. A role out of reach is
 * left and the others are still removed; the first problem is the skip.
 */
async function removeRoles(guild, member, name, officerRoleIds, removed) {
    const held = member.roles.filter((role) => role.name === name && isGivable(guild, role, officerRoleIds) && role.permissions.bitfield === 0n);
    let skip = undefined;
    let didRemove = false;
    for (const role of held) {
        if (role.position >= guild.botTopRolePosition) {
            skip ??= { what: name, reason: "hierarchy" };
            continue;
        }
        try {
            await member.removeRole(role);
            didRemove = true;
        }
        catch (error) {
            skip ??= { what: name, reason: reasonOf(error) };
        }
    }
    if (didRemove)
        removed.push(name);
    return skip;
}
/**
 * Gives the Member the Managed Role of the name: the permission-free role of that name, or a new one when the guild has
 * none. A name held only by Officer roles, @everyone or integration roles is never given, and a name whose roles all
 * grant permissions is skipped.
 */
async function addRole(guild, member, name, officerRoleIds, report) {
    try {
        const named = guild.roles.filter((role) => role.name === name);
        const givable = named.filter((role) => isGivable(guild, role, officerRoleIds));
        if (named.length > 0 && givable.length === 0)
            return { what: name, reason: "not-managed" };
        const free = givable.find((role) => role.permissions.bitfield === 0n);
        if (givable.length > 0 && free === undefined)
            return { what: name, reason: "has-permissions" };
        const found = free === undefined ? await createOnce(guild, name) : { role: free, wasCreated: false };
        if (found.wasCreated)
            report.created.push(name);
        if (found.role.position >= guild.botTopRolePosition)
            return { what: name, reason: "hierarchy" };
        await member.addRole(found.role);
        report.added.push(name);
        return undefined;
    }
    catch (error) {
        return { what: name, reason: reasonOf(error) };
    }
}
/** Creates the role, or joins the creation another apply has in flight for the same name in the same guild. */
async function createOnce(guild, name) {
    const inFlight = creationsOf(guild);
    const pending = inFlight.get(name);
    if (pending !== undefined)
        return { role: await pending, wasCreated: false };
    const creation = guild
        .createRole({ name, permissions: 0n, hoist: false, mentionable: false })
        .finally(() => inFlight.delete(name));
    inFlight.set(name, creation);
    return { role: await creation, wasCreated: true };
}
function creationsOf(guild) {
    const existing = creationsByGuild.get(guild.id);
    if (existing !== undefined)
        return existing;
    const created = new Map();
    creationsByGuild.set(guild.id, created);
    return created;
}
/** The skip reason for an error Discord or the library gave; anything else is "error". */
function reasonOf(error) {
    const parsed = discordError.safeParse(error);
    return parsed.success && parsed.data.code === MISSING_PERMISSIONS ? "missing-permissions" : "error";
}
//# sourceMappingURL=member-roles.js.map