import type { BaseMessageOptions } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import type { Player } from "../domain/player.js";
import { approve, mayApprove, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import type { LinkStore } from "../storage/link-store.js";
import type { PreferenceStore } from "../storage/preference-store.js";
import { answer } from "./lookup.js";
import type { NameAndRoles } from "./name-and-roles.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { OnboardingRole } from "./onboarding-role.js";
import {
  parseRankCustomId,
  rankAskedMessage,
  rankNotAllowedReply,
  rankSetLogLine,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";

/** A Rank Approval that is waiting for its rank. */
export type PendingRankApproval = Extract<RankApproval, { readonly state: "pending" }>;

/** The part of a discord.js button press that a rank button uses. */
export interface RankButtonLike {
  readonly customId: string;
  readonly user: { readonly id: string };
  reply(message: PrivateReply): Promise<void>;
  update(options: BaseMessageOptions): Promise<void>;
}

/** The Rank Approvals as the Interview and the Discord client use them. */
export interface RankApprovals {
  announce(approval: PendingRankApproval, player: Player): Promise<void>;
  onButton(button: RankButtonLike): Promise<void>;
}

/** Everything the Rank Approvals read and write, injected so that tests run without Discord. */
export interface RankApprovalDeps {
  readonly links: LinkStore;
  /** Read only: an open Preferences message in the approval's thread keeps the thread (FR-009). */
  readonly preferences: Pick<PreferenceStore, "prompt">;
  readonly channels: OnboardingChannels;
  readonly nameAndRoles: NameAndRoles;
  /** Taken off just before the approval's thread is deleted; an open Preferences message keeps the role. */
  readonly onboardingRole: Pick<OnboardingRole, "takeOff">;
  readonly officerRoles: OfficerRoles;
  /** The role ids of the Member who pressed a button, as the Discord client reads them. */
  readonly memberRoleIdsOf: (memberId: MemberId) => Promise<readonly string[]>;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

export function createRankApprovals(deps: RankApprovalDeps): RankApprovals {
  return {
    announce: (approval, player) => announce(deps, approval, player),
    onButton: (button) => pressRankButton(deps, button),
  };
}

/** Adds the leader's Member to the thread when they are the approver, then asks with the rank buttons. */
async function announce(deps: RankApprovalDeps, approval: PendingRankApproval, player: Player): Promise<void> {
  if (approval.approver.kind === "member") {
    await deps.channels.addToThread(approval.threadId, approval.approver.memberId);
  }
  await deps.channels.post(approval.threadId, rankAskedMessage(approval, player, deps.officerRoles));
}

/** A rank button press: approved when the Member may approve, otherwise a private refusal that changes nothing. */
async function pressRankButton(deps: RankApprovalDeps, button: RankButtonLike): Promise<void> {
  const parsed = parseRankCustomId(button.customId);
  if (parsed === undefined) return;
  const approval = deps.links.get(parsed.approvalId);
  if (approval === undefined) return button.reply(rankNotAllowedReply());
  const pressedBy = button.user.id;
  const officerRoleIds = [deps.officerRoles.moderatorRoleId, deps.officerRoles.kingRoleId];
  const pressedByOfficer = isOfficer(await deps.memberRoleIdsOf(pressedBy), officerRoleIds);
  if (!mayApprove(approval, pressedBy, pressedByOfficer)) return button.reply(rankNotAllowedReply());
  const change = approve(approval, parsed.rank, pressedBy, deps.now());
  if (!change.ok || change.approval.state !== "approved") return button.reply(rankNotAllowedReply());
  const approved = change.approval;
  // Another Officer may have approved in the meantime: then this press changes nothing and is refused privately.
  if (!deps.links.saveIfPending(approved)) return button.reply(rankNotAllowedReply());
  await button.update({ components: [] });
  await deps.channels.log(rankSetLogLine(pressedBy, approved.linkedMemberId, parsed.rank));
  // A thread that cannot be deleted is logged; the approval, the log line and the name and roles stand.
  await answer("the deletion of an Interview thread", { logError: deps.logError }, () =>
    deleteApprovalThread(deps, approved),
  );
  await nameAndRolesAfterApproval(deps, approved.linkedMemberId);
}

/**
 * Whether a thread of a Rank Approval stays: the Member's Preferences message is still open in it (Done or the sweeper
 * deletes it, FR-009). Shared by the approval buttons and /rank.
 */
export function keepsApprovalThread(
  preferences: Pick<PreferenceStore, "prompt">,
  approval: { readonly threadId: string; readonly linkedMemberId: MemberId },
): boolean {
  return preferences.prompt(approval.linkedMemberId)?.threadId === approval.threadId;
}

/**
 * Deletes the approval's thread, unless the Member's Preferences message is still open in it. The Onboarding Role is taken
 * off just before the deletion, since the thread closes the Interview.
 */
async function deleteApprovalThread(
  deps: RankApprovalDeps,
  approval: { readonly threadId: string; readonly linkedMemberId: MemberId },
): Promise<void> {
  if (keepsApprovalThread(deps.preferences, approval)) return;
  await deps.onboardingRole.takeOff(approval.linkedMemberId);
  await deps.channels.deleteThread(approval.threadId);
}

/** Gives the Member their name and roles with the approved rank; a failure is logged, the approval stands. */
async function nameAndRolesAfterApproval(deps: RankApprovalDeps, memberId: MemberId): Promise<void> {
  try {
    await deps.nameAndRoles.onRankApproved(memberId);
  } catch (error) {
    deps.logError(`Giving the name and roles after a Rank Approval failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
