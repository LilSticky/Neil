import { ALL_PREFERENCE_ROLE_NAMES, allianceRankOf, isKnownInHomeKingdom, preferenceRolesFor } from "../domain/preferences.js";
import { giveNamedRole, takeOffNamedRole } from "./member-roles.js";
/** Builds the Preference Roles service. */
export function createPreferenceRoles(deps) {
    const queues = new Map();
    return {
        apply: (memberId) => queueFor(deps, queues, memberId, () => applyTo(deps, memberId)),
        forget: (memberId) => queueFor(deps, queues, memberId, () => forgetOf(deps, memberId)),
    };
}
/**
 * Runs the work after the changes already queued for the Member. The returned promise never rejects, and a failed change
 * does not stop the ones queued after it.
 */
function queueFor(deps, queues, memberId, work) {
    const previous = queues.get(memberId) ?? Promise.resolve();
    const settled = previous
        .then(work)
        .catch((error) => {
        deps.logError(`Changing the Preference Roles of ${memberId} failed: ${reasonOf(error)}`);
    });
    queues.set(memberId, settled);
    void settled.then(() => {
        if (queues.get(memberId) === settled)
            queues.delete(memberId);
    });
    return settled;
}
async function applyTo(deps, memberId) {
    try {
        const link = deps.links.linkFor(memberId);
        const knownAtHome = isKnownInHomeKingdom(deps.applied.get(memberId)?.roles, deps.homeKingdom);
        const rank = link === undefined || !knownAtHome ? undefined : allianceRankOf(link.allianceRank);
        if (rank === "R5")
            keepNapDiscussions(deps, memberId);
        const server = await deps.members.memberOf(memberId);
        if (server === undefined)
            return;
        const wanted = link === undefined || !knownAtHome ? [] : preferenceRolesFor(deps.preferences.get(memberId), rank);
        const held = heldNames(server.member);
        const unwanted = ALL_PREFERENCE_ROLE_NAMES.filter((name) => held.has(name) && !wanted.includes(name));
        const missing = wanted.filter((name) => !held.has(name));
        const taken = await changeEach(deps, memberId, server, unwanted, takeOffNamedRole);
        const given = await changeEach(deps, memberId, server, missing, giveNamedRole);
        if (taken.length + given.length > 0)
            deps.log(changesLogLine(memberId, given, taken));
    }
    catch (error) {
        deps.logError(`Changing the Preference Roles of ${memberId} failed: ${reasonOf(error)}`);
    }
}
/**
 * An R5 is given NaP discussions by rank. The choice is also stored as the Member's Interest, so that a Member demoted to
 * R4 keeps them: the stored Interest is what the R4 rule reads.
 */
function keepNapDiscussions(deps, memberId) {
    const interests = deps.preferences.get(memberId).interests;
    if (interests.has("nap"))
        return;
    const stored = new Set([...interests, "nap"]);
    deps.preferences.setInterests(memberId, stored);
}
async function forgetOf(deps, memberId) {
    try {
        const server = await deps.members.memberOf(memberId);
        if (server !== undefined) {
            const held = heldNames(server.member);
            const heldPreferenceRoles = ALL_PREFERENCE_ROLE_NAMES.filter((name) => held.has(name));
            await changeEach(deps, memberId, server, heldPreferenceRoles, takeOffNamedRole);
        }
    }
    catch (error) {
        deps.logError(`Taking the Preference Roles off ${memberId} failed: ${reasonOf(error)}`);
    }
    await deleteOpenPromptThread(deps, memberId);
    try {
        deps.preferences.forget(memberId);
    }
    catch (error) {
        deps.logError(`Deleting the Preferences of ${memberId} failed: ${reasonOf(error)}`);
    }
}
/**
 * Deletes the thread of the Member's open Preferences message, unless a Rank Approval of theirs is pending: that Rank
 * Approval deletes the thread when it ends. Never throws: a failure is logged.
 */
async function deleteOpenPromptThread(deps, memberId) {
    try {
        const prompt = deps.preferences.prompt(memberId);
        if (prompt === undefined || deps.links.pendingFor(memberId) !== undefined)
            return;
        await deps.channels.deleteThread(prompt.threadId);
    }
    catch (error) {
        deps.logError(`Deleting the Preferences message of ${memberId} failed: ${reasonOf(error)}`);
    }
}
/** Makes each change in turn, logs a skip with the Member and the role, and returns the names actually changed. */
async function changeEach(deps, memberId, server, names, change) {
    const changed = [];
    for (const name of names) {
        const skip = await change(server.guild, server.member, name, deps.officerRoleIds);
        if (skip === undefined) {
            changed.push(name);
        }
        else {
            deps.logError(`Changing the ${name} Preference Role of ${memberId} was skipped: ${skip.reason}`);
        }
    }
    return changed;
}
/** One line for the log channel: the Member, the roles given and the roles taken off. */
function changesLogLine(memberId, given, taken) {
    const parts = [];
    if (given.length > 0)
        parts.push(`given ${given.join(", ")}`);
    if (taken.length > 0)
        parts.push(`taken off ${taken.join(", ")}`);
    return `Preference Roles of <@${memberId}>: ${parts.join("; ")}.`;
}
/** The names of the roles a Member holds. */
function heldNames(member) {
    return new Set(member.roles.map((role) => role.name));
}
function reasonOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=preferences.js.map