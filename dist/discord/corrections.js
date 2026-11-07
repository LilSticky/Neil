import { randomUUID } from "node:crypto";
import { MessageFlags } from "discord.js";
import { mayCorrect } from "../domain/correction.js";
import { officerRank, rankOnLink } from "../domain/link.js";
import { parseUid } from "../domain/lookup-input.js";
import { isOfficer } from "../domain/officer.js";
import { linkByOfficer } from "../domain/onboarding-interview.js";
import { leaderPing, pendingApprovalFor, storeLinkIfStep } from "./interview.js";
import { keepsApprovalThread } from "./rank-approval.js";
import { officerLinkPreferencesMessage } from "./preferences-texts.js";
import { asApprovableRank, linkedMessage, officerLinkLogLine, rankSetLogLine, } from "./interview-texts.js";
import { answer } from "./lookup.js";
import { LINK_NOTE } from "./usage-texts.js";
import { linkCardEndedMessage, linkCardMessage, linkEndedReply, linkInputReply, linkLookupFailureReply, linkNotYoursReply, linkRefusedReply, memberGoneReply, noAllianceReply, notHandedOffReply, notLinkedReply, notOfficerButtonReply, notOfficerReply, ownLinkReply, parseLinkCustomId, rankInputReply, rankSetReply, selfLinkReply, uidLinkedElsewhereReply, unlinkedByOfficerReply, unlinkedSelfReply, } from "./corrections-texts.js";
/** How long the Confirm and Cancel buttons of an Officer Link stay usable. */
const CONFIRMATION_MS = 5 * 60_000;
/**
 * The Officer Links waiting for their Officer to press Confirm or Cancel. Kept in memory: they end with a restart. Each has
 * a random id, so a card from before a restart cannot reach a new confirmation.
 */
export class PendingLinkConfirmations {
    waiting = new Map();
    /** Keeps a confirmation until it expires; returns the id its buttons carry. */
    add(draft, now) {
        this.dropExpired(now);
        const id = randomUUID();
        this.waiting.set(id, { ...draft, expiresAt: new Date(now.getTime() + CONFIRMATION_MS) });
        return id;
    }
    /** The confirmation with this id, while it has not expired; undefined otherwise. */
    get(id, now) {
        const pending = this.waiting.get(id);
        return pending === undefined || pending.expiresAt.getTime() <= now.getTime() ? undefined : pending;
    }
    remove(id) {
        this.waiting.delete(id);
    }
    dropExpired(now) {
        for (const [id, pending] of this.waiting) {
            if (pending.expiresAt.getTime() <= now.getTime())
                this.waiting.delete(id);
        }
    }
}
/** The Officer roles of the server: the Moderator and the King. */
function officerRoleIdsOf(officerRoles) {
    return [officerRoles.moderatorRoleId, officerRoles.kingRoleId];
}
/** The caller of a command as a correction sees them: their id, and whether they hold an Officer role. */
function correctorOf(interaction, officerRoles) {
    return {
        memberId: interaction.callerId,
        isOfficer: isOfficer(interaction.memberRoleIds(), officerRoleIdsOf(officerRoles)),
    };
}
/** Writes a log line of a correction. A log channel that refuses it is logged, and the correction stands. */
async function logLine(logError, write) {
    await answer("the log line of a correction", { logError }, write);
}
/** Defers the reply privately, runs the command, and logs (never throws) what fails. */
function privately(command, interaction, logError, run) {
    return answer(command, { logError }, async () => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await run();
    });
}
/**
 * /unlink: a Member ends their own Link; an Officer ends the Link of the Member named. Every reply is private. Nothing
 * starts an Onboarding Interview.
 */
export function handleUnlink(interaction, deps) {
    return privately("/unlink", interaction, deps.logError, async () => {
        const caller = correctorOf(interaction, deps.officerRoles);
        const named = interaction.memberOption() ?? caller.memberId;
        if (!mayCorrect("unlink", caller, named).ok)
            return interaction.editReply(notOfficerReply());
        if (deps.links.linkFor(named) === undefined)
            return interaction.editReply(notLinkedReply(named));
        if (named === caller.memberId) {
            await deps.unlink.unlink({ id: named }, "self");
            return interaction.editReply(unlinkedSelfReply());
        }
        await deps.unlink.unlink({ id: named }, { kind: "officer", officerId: caller.memberId });
        return interaction.editReply(unlinkedByOfficerReply(named));
    });
}
/**
 * /rank: an Officer gives a Linked Member their Alliance Rank. The rank is stored as a Rank Approval by that Officer, a
 * pending Rank Approval of the Link is settled with it, and the name and roles are applied again.
 */
export function handleRank(interaction, deps) {
    return privately("/rank", interaction, deps.logError, async () => {
        const caller = correctorOf(interaction, deps.officerRoles);
        const memberId = interaction.memberOption();
        const rank = asApprovableRank(interaction.rankOption() ?? "");
        // Without a Member named, only the Officer check can refuse, so the caller stands in for the target.
        const verdict = mayCorrect("rank-approval", caller, memberId ?? caller.memberId);
        if (!verdict.ok && verdict.reason === "not-officer")
            return interaction.editReply(notOfficerReply());
        if (memberId === undefined || rank === undefined)
            return interaction.editReply(rankInputReply());
        const link = deps.links.linkFor(memberId);
        if (link === undefined)
            return interaction.editReply(notLinkedReply(memberId));
        if (!verdict.ok)
            return interaction.editReply(ownLinkReply());
        const now = deps.now();
        const decision = officerRank(link, rank, caller.memberId, now);
        if (!decision.ok) {
            return interaction.editReply(decision.reason === "own-link" ? ownLinkReply() : noAllianceReply(memberId));
        }
        const settled = deps.links.rankByOfficer(memberId, { rank, approvedBy: caller.memberId }, now);
        await logLine(deps.logError, () => deps.channels.log(rankSetLogLine(caller.memberId, memberId, rank)));
        if (settled !== undefined) {
            const approval = { threadId: settled.threadId, linkedMemberId: memberId };
            if (!keepsApprovalThread(deps.preferences, approval)) {
                await deps.onboardingRole.takeOff(memberId);
                await answer("the deletion of an Interview thread", { logError: deps.logError }, () => deps.channels.deleteThread(approval.threadId));
            }
        }
        await interaction.editReply(rankSetReply(memberId, rank, decision.gameRank));
        await deps.nameAndRoles.onRankApproved(memberId);
    });
}
/**
 * /link: an Officer Links a Member whose Interview was handed off, to a uid. The Player the uid names is looked up once,
 * with the Interview's purpose, and shown with Confirm and Cancel; nothing is stored until the Officer confirms.
 */
export function handleLink(interaction, deps) {
    return privately("/link", interaction, deps.logError, async () => {
        const caller = correctorOf(interaction, deps.officerRoles);
        const memberId = interaction.memberOption();
        const uid = parseUid(interaction.uidOption() ?? "");
        // Without a Member named, only the Officer check can refuse, so the caller stands in for the target.
        const verdict = mayCorrect("officer-link", caller, memberId ?? caller.memberId);
        if (!verdict.ok && verdict.reason === "not-officer")
            return interaction.editReply(notOfficerReply());
        if (memberId === undefined || !uid.ok)
            return interaction.editReply(linkInputReply());
        if (!verdict.ok)
            return interaction.editReply(selfLinkReply());
        if (deps.interviews.latestFor(memberId)?.step !== "handed-off") {
            return interaction.editReply(notHandedOffReply(memberId));
        }
        const holder = deps.links.memberForUid(uid.value);
        if (holder !== undefined)
            return interaction.editReply(uidLinkedElsewhereReply(holder));
        if (!(await deps.isOnServer(memberId)))
            return interaction.editReply(memberGoneReply(memberId));
        const now = deps.now();
        const result = await deps.gameApi.getPlayer(uid.value, "onboarding-interview");
        if (result.kind !== "found")
            return interaction.editReply(linkLookupFailureReply(result, uid.value, now));
        const confirmationId = deps.confirmations.add({
            officerId: caller.memberId,
            officerRoleIds: officerRoleIdsOf(deps.officerRoles),
            memberId,
            uid: uid.value,
            player: result.value,
        }, now);
        return interaction.editReply(linkCardMessage(confirmationId, memberId, result.value));
    });
}
/**
 * An Officer Link card's button. Only the Officer who asked may press it, and only while the confirmation lasts. Cancel
 * ends the card. Confirm stores the Link and ends the handed-off Interview in one step, or refuses privately and stores
 * nothing when the state has moved on.
 */
export async function handleLinkButton(button, deps) {
    await answer("/link button", { logError: deps.logError }, async () => {
        // Acknowledged first: the checks below make Game API and Discord calls that may outlast Discord's three seconds.
        await button.deferUpdate();
        const parsed = parseLinkCustomId(button.customId);
        if (parsed === undefined)
            return button.followUp(linkEndedReply());
        await pressLinkButton(button, parsed, deps);
    });
}
async function pressLinkButton(button, press, deps) {
    const pending = deps.confirmations.get(press.confirmationId, deps.now());
    if (pending === undefined)
        return button.followUp(linkEndedReply());
    if (pending.officerId !== button.user.id)
        return button.followUp(linkNotYoursReply());
    // The Officer who asked may have lost the role since: only an Officer may press, as when the Link was asked.
    if (!isOfficer(button.memberRoleIds(), pending.officerRoleIds))
        return button.followUp(notOfficerButtonReply());
    deps.confirmations.remove(press.confirmationId);
    if (press.action === "cancel") {
        return button.update(linkCardEndedMessage(pending.memberId, pending.player, "cancelled"));
    }
    return confirmLink(button, pending, deps);
}
/**
 * Stores the Officer Link: the Link, the Interview as linked, and a pending Rank Approval when the rank is unknown and the
 * Player is in the Home Kingdom (a Guest gets none), in one transaction. A Member who left, or a state that moved on, is
 * refused privately, and the card ends with nothing stored.
 */
async function confirmLink(button, pending, deps) {
    const now = deps.now();
    const { memberId, player } = pending;
    const refuse = async () => {
        await button.followUp(linkRefusedReply());
        await button.update(linkCardEndedMessage(memberId, player, "refused"));
    };
    if (!(await deps.isOnServer(memberId)))
        return refuse();
    const latest = deps.interviews.latestFor(memberId);
    if (latest === undefined)
        return refuse();
    const link = {
        memberId,
        uid: pending.uid,
        linkedAt: now,
        allianceRank: rankOnLink(player),
        madeBy: { kind: "officer-link", officerId: pending.officerId },
    };
    const leaderMemberId = await leaderPing(deps, player);
    const draft = pendingApprovalFor(link, player, deps.homeKingdom, { memberId, threadId: latest.threadId }, leaderMemberId, now);
    // The Interview is written only while it is still handed off; otherwise the whole transaction is rolled back.
    const linked = linkByOfficer(latest, pending.uid, pending.officerId, now);
    const outcome = storeLinkIfStep(deps, linked.interview, "handed-off", draft === undefined ? { link } : { link, rankApproval: draft });
    if (outcome?.kind !== "linked")
        return refuse();
    await button.update(linkCardEndedMessage(memberId, player, "linked"));
    await finishOfficerLink(deps, pending, latest.threadId, link, outcome.rankApproval);
}
/**
 * The Doctor Role is given, so the Member is never in neither role. The stored Officer Link is logged with its Officer, and
 * its name and roles applied. A pending Rank Approval is asked in the thread, which says the Link is stored; otherwise the
 * thread is deleted, and the Onboarding Role is taken off just before that. A failed name and roles step is logged; the
 * Link stands.
 */
async function finishOfficerLink(deps, pending, threadId, link, rankApproval) {
    const pendingApproval = rankApproval?.state === "pending" ? rankApproval : undefined;
    await deps.doctorRole.give(pending.memberId);
    if (pendingApproval !== undefined) {
        await deps.channels.post(threadId, linkedMessage(pending.memberId, pending.player));
    }
    await logLine(deps.logError, () => deps.channels.log(officerLinkLogLine(pending.memberId, pending.player, pending.officerId)));
    // A Guest is not offered Preferences, so the /channels note is not sent to them.
    if (pending.player.kingdom === deps.homeKingdom) {
        await answer("the /channels message after an Officer Link", { logError: deps.logError }, () => deps.sendPrivateMessage(pending.memberId, officerLinkPreferencesMessage()));
    }
    await answer("the Link note after an Officer Link", { logError: deps.logError }, () => deps.sendPrivateMessage(pending.memberId, { content: LINK_NOTE }));
    try {
        await deps.nameAndRoles.onLinked(pending.memberId, pending.player, link.allianceRank);
    }
    catch (error) {
        deps.logError(`Giving the name and roles after an Officer Link failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (pendingApproval !== undefined)
        return deps.rankApprovals.announce(pendingApproval, pending.player);
    await deps.onboardingRole.takeOff(pending.memberId);
    await deps.channels.deleteThread(threadId);
}
//# sourceMappingURL=corrections.js.map