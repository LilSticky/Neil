import type { BaseMessageOptions } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import type { Player } from "../domain/player.js";
import { approve, mayApprove, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import type { LinkStore } from "../storage/link-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import {
  parseRankCustomId,
  rankApprovedMessage,
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
  readonly channels: OnboardingChannels;
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
  deps.links.save(approved);
  await button.update({ components: [] });
  await deps.channels.log(rankSetLogLine(pressedBy, approved.linkedMemberId, parsed.rank));
  await deps.channels.post(approved.threadId, rankApprovedMessage(approved));
  await deps.channels.archive(approved.threadId);
}
