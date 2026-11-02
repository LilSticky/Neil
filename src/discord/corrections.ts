import { MessageFlags } from "discord.js";
import { officerRank } from "../domain/link.js";
import { isOfficer } from "../domain/officer.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { LinkStore } from "../storage/link-store.js";
import type { NameAndRoles } from "./name-and-roles.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import { asApprovableRank, rankSetLogLine, type Message, type OfficerRoles } from "./interview-texts.js";
import { answer } from "./lookup.js";
import {
  notLinkedReply,
  notOfficerReply,
  noAllianceReply,
  ownLinkReply,
  rankInputReply,
  rankSetInThreadMessage,
  rankSetReply,
  unlinkedByOfficerReply,
  unlinkedSelfReply,
} from "./corrections-texts.js";
import type { Unlink } from "./unlink.js";

/**
 * The part of a discord.js chat-input command that the corrections use: the caller, their roles, the options given, and
 * the private reply, which is deferred first and then edited (Discord allows three seconds for the first answer).
 */
export interface CorrectionInteraction {
  readonly callerId: MemberId;
  memberRoleIds(): readonly string[];
  /** The Member named in the member option, or undefined when none was given. */
  memberOption(): MemberId | undefined;
  /** The rank named in the rank option, as typed, or undefined when none was given. */
  rankOption(): string | undefined;
  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<void>;
  editReply(message: Message): Promise<void>;
}

/** Everything /unlink reads and writes. */
export interface UnlinkCommandDeps {
  readonly links: Pick<LinkStore, "linkFor">;
  readonly unlink: Unlink;
  readonly officerRoles: OfficerRoles;
  readonly logError: (line: string) => void;
}

/** Everything /rank reads and writes. */
export interface RankCommandDeps {
  readonly links: LinkStore;
  readonly channels: Pick<OnboardingChannels, "log" | "post">;
  readonly nameAndRoles: Pick<NameAndRoles, "onRankApproved">;
  readonly officerRoles: OfficerRoles;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** Whether the caller holds an Officer role. */
function callerIsOfficer(interaction: CorrectionInteraction, officerRoles: OfficerRoles): boolean {
  return isOfficer(interaction.memberRoleIds(), [officerRoles.moderatorRoleId, officerRoles.kingRoleId]);
}

/** Defers the reply privately, runs the command, and logs (never throws) what fails. */
function privately(
  command: string,
  interaction: CorrectionInteraction,
  logError: (line: string) => void,
  run: () => Promise<void>,
): Promise<void> {
  return answer(command, { logError }, async () => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await run();
  });
}

/**
 * /unlink: a Member ends their own Link; an Officer ends the Link of the Member named. Every reply is private. Nothing
 * starts an Onboarding Interview.
 */
export function handleUnlink(interaction: CorrectionInteraction, deps: UnlinkCommandDeps): Promise<void> {
  return privately("/unlink", interaction, deps.logError, async () => {
    const callerId = interaction.callerId;
    const named = interaction.memberOption();
    if (named === undefined || named === callerId) {
      if (deps.links.linkFor(callerId) === undefined) return interaction.editReply(notLinkedReply(callerId));
      await deps.unlink.unlink({ id: callerId }, "self");
      return interaction.editReply(unlinkedSelfReply());
    }
    if (!callerIsOfficer(interaction, deps.officerRoles)) return interaction.editReply(notOfficerReply());
    if (deps.links.linkFor(named) === undefined) return interaction.editReply(notLinkedReply(named));
    await deps.unlink.unlink({ id: named }, { kind: "officer", officerId: callerId });
    return interaction.editReply(unlinkedByOfficerReply(named));
  });
}

/**
 * /rank: an Officer gives a Linked Member their Alliance Rank. The rank is stored as a Rank Approval by that Officer, a
 * pending Rank Approval of the Link is settled with it, and the name and roles are applied again.
 */
export function handleRank(interaction: CorrectionInteraction, deps: RankCommandDeps): Promise<void> {
  return privately("/rank", interaction, deps.logError, async () => {
    if (!callerIsOfficer(interaction, deps.officerRoles)) return interaction.editReply(notOfficerReply());
    const memberId = interaction.memberOption();
    const rank = asApprovableRank(interaction.rankOption() ?? "");
    if (memberId === undefined || rank === undefined) return interaction.editReply(rankInputReply());
    const link = deps.links.linkFor(memberId);
    if (link === undefined) return interaction.editReply(notLinkedReply(memberId));
    const now = deps.now();
    const decision = officerRank(link, rank, interaction.callerId, now);
    if (!decision.ok) {
      return interaction.editReply(decision.reason === "own-link" ? ownLinkReply() : noAllianceReply(memberId));
    }
    const settled = deps.links.rankByOfficer(memberId, { rank, approvedBy: interaction.callerId }, now);
    if (settled !== undefined) {
      await deps.channels.post(settled.threadId, rankSetInThreadMessage(interaction.callerId, memberId, rank));
    }
    await deps.channels.log(rankSetLogLine(interaction.callerId, memberId, rank));
    await interaction.editReply(rankSetReply(memberId, rank, decision.gameRank));
    await deps.nameAndRoles.onRankApproved(memberId);
  });
}
