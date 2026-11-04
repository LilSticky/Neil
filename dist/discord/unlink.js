import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { cancel } from "../domain/rank-approval.js";
import { applyNameAndRoles } from "./member-roles.js";
import { rankHandedToOfficersMessage, unlinkedByOfficerPrivateMessage, unlinkedLogLine, unlinkedPrivateMessage, } from "./unlink-texts.js";
export function createUnlink(deps) {
    return { unlink: (member, reason) => unlinkMember(deps, member.id, reason) };
}
/**
 * Ends a Member's Link. The Link and its applied state are removed first. For a Member on the server, Neil then takes off
 * the Managed Roles and the nickname it set, and cancels the Member's own pending Rank Approval. The Member is logged and
 * told privately (not when they Unlinked themselves), and the Rank Approvals waiting on them are handed on. Each step is
 * guarded, so a failure is logged and the next step still runs.
 */
async function unlinkMember(deps, memberId, reason) {
    const applied = attempt(deps, memberId, "reading the applied state", () => deps.applied.get(memberId));
    // The Link goes first, so an apply that is under way finds no Link and gives the Member nothing more.
    const removed = attempt(deps, memberId, "ending the Link", () => deps.links.unlink(memberId));
    // Every Unlink forgets the Preferences, also a Member already gone from the server: their rows must not outlive the Link.
    await attemptAsync(deps, memberId, "forgetting the Preferences", () => deps.preferenceRoles.forget(memberId));
    let notChanged = [];
    if (!removedByDiscord(reason)) {
        notChanged = await takeOffOnServer(deps, memberId, applied);
        await deps.onboardingRole.give(memberId);
        await cancelOwnApproval(deps, memberId);
    }
    if (removed !== undefined) {
        await attemptAsync(deps, memberId, "logging the Unlink", () => deps.channels.log(unlinkedLogLine(memberId, removed.uid, applied?.nickname, reason, notChanged)));
        await tellMember(deps, memberId, reason);
    }
    await handOnRankApprovals(deps, memberId);
}
/** A Member who left or was found missing is already off the server: Discord took their roles, so Neil changes nothing. */
function removedByDiscord(reason) {
    return reason === "left" || reason === "missing";
}
/**
 * Takes off the Managed Roles Neil applied, and clears the nickname only while it is still the one Neil set. A Member not
 * on the server is left alone. Resolves to the steps Discord did not let Neil take; never throws.
 */
async function takeOffOnServer(deps, memberId, applied) {
    try {
        const server = await deps.members.memberOf(memberId);
        if (server === undefined)
            return [];
        const report = await applyNameAndRoles(server.guild, server.member, {
            nickname: applied !== undefined && server.member.nickname === applied.nickname ? null : undefined,
            roles: [],
            managedTags: applied?.roles ?? [],
            officerRoleIds: [deps.officerRoles.moderatorRoleId, deps.officerRoles.kingRoleId],
        });
        return report.skipped.map((skip) => skip.what);
    }
    catch (error) {
        deps.logError(failureLine(memberId, "taking off the roles", error));
        return [];
    }
}
/** Cancels the Member's own pending Rank Approval and posts in its thread; a Member without one changes nothing else. */
async function cancelOwnApproval(deps, memberId) {
    const pending = attempt(deps, memberId, "reading the pending Rank Approval", () => deps.links.pendingFor(memberId));
    if (pending === undefined)
        return;
    const change = cancel(pending, deps.now());
    if (!change.ok)
        return;
    const cancelled = change.approval;
    const saved = attempt(deps, memberId, `cancelling Rank Approval ${pending.id.toString()}`, () => deps.links.saveIfPending(cancelled));
    if (saved !== true)
        return;
    await attemptAsync(deps, memberId, `deleting the thread of Rank Approval ${pending.id.toString()}`, () => deps.channels.deleteThread(pending.threadId));
}
/**
 * The private message to the Member: an Officer's Unlink tells them to run /interview, a leave or a missing Member gets
 * the leave message, and a Member who Unlinked themselves gets none (the reply carries the result).
 */
async function tellMember(deps, memberId, reason) {
    const message = privateMessageOf(reason);
    if (message === undefined)
        return;
    try {
        await deps.sendPrivateMessage(memberId, message);
    }
    catch (error) {
        if (isCannotBeMessaged(error))
            return;
        deps.logError(failureLine(memberId, "telling the Member", error));
    }
}
function privateMessageOf(reason) {
    if (reason === "self")
        return undefined;
    if (typeof reason === "object")
        return unlinkedByOfficerPrivateMessage();
    return unlinkedPrivateMessage();
}
/** Discord's refusal to send a private message to a user who cannot be messaged (no shared server, DMs closed). */
function isCannotBeMessaged(error) {
    return error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser;
}
/** Hands each pending Rank Approval the Member was to approve to the Officers, one at a time. */
async function handOnRankApprovals(deps, memberId) {
    const pending = attempt(deps, memberId, "listing the Rank Approvals waiting on the Member", () => deps.links.pendingApprovedBy(memberId));
    for (const approval of pending ?? []) {
        await handOn(deps, memberId, approval);
    }
}
/**
 * Hands the Rank Approval to the Officers, then posts in its thread; a thread that is gone is only logged. The post
 * follows only when this Unlink made the change: an Officer may have approved meanwhile, or another Unlink of the
 * Member may have handed it on already.
 */
async function handOn(deps, memberId, approval) {
    const handed = attempt(deps, memberId, `handing Rank Approval ${approval.id.toString()} to the Officers`, () => deps.links.handToOfficers(approval.id, memberId));
    if (handed !== true)
        return;
    await attemptAsync(deps, memberId, `posting in the thread of Rank Approval ${approval.id.toString()}`, () => deps.channels.post(approval.threadId, rankHandedToOfficersMessage(deps.officerRoles)));
}
/** Runs one synchronous step; a failure is logged and gives undefined, so the next step still runs. */
function attempt(deps, memberId, step, work) {
    try {
        return work();
    }
    catch (error) {
        deps.logError(failureLine(memberId, step, error));
        return undefined;
    }
}
/** Runs one asynchronous step; a failure is logged and the Unlink goes on. */
async function attemptAsync(deps, memberId, step, work) {
    try {
        await work();
    }
    catch (error) {
        deps.logError(failureLine(memberId, step, error));
    }
}
function failureLine(memberId, step, error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return `Unlink of ${memberId} failed while ${step}: ${reason}`;
}
//# sourceMappingURL=unlink.js.map