import { isOfficer } from "../domain/officer.js";
import { approve, mayApprove } from "../domain/rank-approval.js";
import { answer } from "./lookup.js";
import { parseRankCustomId, rankAskedMessage, rankNotAllowedReply, rankSetLogLine, } from "./interview-texts.js";
export function createRankApprovals(deps) {
    return {
        announce: (approval, player) => announce(deps, approval, player),
        onButton: (button) => pressRankButton(deps, button),
    };
}
/** Adds the leader's Member to the thread when they are the approver, then asks with the rank buttons. */
async function announce(deps, approval, player) {
    if (approval.approver.kind === "member") {
        await deps.channels.addToThread(approval.threadId, approval.approver.memberId);
    }
    await deps.channels.post(approval.threadId, rankAskedMessage(approval, player, deps.officerRoles));
}
/** A rank button press: approved when the Member may approve, otherwise a private refusal that changes nothing. */
async function pressRankButton(deps, button) {
    const parsed = parseRankCustomId(button.customId);
    if (parsed === undefined)
        return;
    const approval = deps.links.get(parsed.approvalId);
    if (approval === undefined)
        return button.reply(rankNotAllowedReply());
    const pressedBy = button.user.id;
    const officerRoleIds = [deps.officerRoles.moderatorRoleId, deps.officerRoles.kingRoleId];
    const pressedByOfficer = isOfficer(await deps.memberRoleIdsOf(pressedBy), officerRoleIds);
    if (!mayApprove(approval, pressedBy, pressedByOfficer))
        return button.reply(rankNotAllowedReply());
    const change = approve(approval, parsed.rank, pressedBy, deps.now());
    if (!change.ok || change.approval.state !== "approved")
        return button.reply(rankNotAllowedReply());
    const approved = change.approval;
    // Another Officer may have approved in the meantime: then this press changes nothing and is refused privately.
    if (!deps.links.saveIfPending(approved))
        return button.reply(rankNotAllowedReply());
    await button.update({ components: [] });
    await deps.channels.log(rankSetLogLine(pressedBy, approved.linkedMemberId, parsed.rank));
    // A thread that cannot be deleted is logged; the approval, the log line and the name and roles stand.
    await answer("the deletion of an Interview thread", { logError: deps.logError }, () => deleteApprovalThread(deps, approved));
    await nameAndRolesAfterApproval(deps, approved.linkedMemberId);
}
/**
 * Whether a thread of a Rank Approval stays: the Member's Preferences message is still open in it (Done or the sweeper
 * deletes it, FR-009). Shared by the approval buttons and /rank.
 */
export function keepsApprovalThread(preferences, approval) {
    return preferences.prompt(approval.linkedMemberId)?.threadId === approval.threadId;
}
/** Deletes the approval's thread, unless the Member's Preferences message is still open in it. */
async function deleteApprovalThread(deps, approval) {
    if (keepsApprovalThread(deps.preferences, approval))
        return;
    await deps.channels.deleteThread(approval.threadId);
}
/** Gives the Member their name and roles with the approved rank; a failure is logged, the approval stands. */
async function nameAndRolesAfterApproval(deps, memberId) {
    try {
        await deps.nameAndRoles.onRankApproved(memberId);
    }
    catch (error) {
        deps.logError(`Giving the name and roles after a Rank Approval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=rank-approval.js.map