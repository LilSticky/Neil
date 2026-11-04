import { randomUUID } from "node:crypto";
import { MessageFlags } from "discord.js";
import { mayCorrect, type Corrector } from "../domain/correction.js";
import { needsRankApproval, officerRank, rankOnLink, type Link } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import { isOfficer } from "../domain/officer.js";
import { linkByOfficer } from "../domain/onboarding-interview.js";
import type { Player } from "../domain/player.js";
import type { MemberId, RankApproval } from "../domain/rank-approval.js";
import type { InterviewStore } from "../storage/interview-store.js";
import type { LinkStore } from "../storage/link-store.js";
import { leaderPing, pendingApprovalFor, storeLinkIfStep, type InterviewGameApi } from "./interview.js";
import type { NameAndRoles } from "./name-and-roles.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { OnboardingRole } from "./onboarding-role.js";
import type { RankApprovals } from "./rank-approval.js";
import {
  asApprovableRank,
  linkedMessage,
  officerLinkLogLine,
  rankSetLogLine,
  type ButtonMessage,
  type Message,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";
import { answer } from "./lookup.js";
import {
  linkCardEndedMessage,
  linkCardMessage,
  linkEndedReply,
  linkInputReply,
  linkLookupFailureReply,
  linkNotYoursReply,
  linkRefusedReply,
  memberGoneReply,
  noAllianceReply,
  notHandedOffReply,
  notLinkedReply,
  notOfficerButtonReply,
  notOfficerReply,
  ownLinkReply,
  parseLinkCustomId,
  rankInputReply,
  rankSetInThreadMessage,
  rankSetReply,
  selfLinkReply,
  uidLinkedElsewhereReply,
  unlinkedByOfficerReply,
  unlinkedSelfReply,
  type LinkAction,
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

/** The part of a discord.js chat-input command that /link uses: the caller, their roles, the options given, and the reply. */
export interface LinkInteraction {
  readonly callerId: MemberId;
  memberRoleIds(): readonly string[];
  /** The Member named in the member option, or undefined when none was given. */
  memberOption(): MemberId | undefined;
  /** The uid given, as typed, or undefined when none was given. */
  uidOption(): string | undefined;
  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<void>;
  /** Edits the private reply; a message with buttons shows the Officer Link card. */
  editReply(message: Message | ButtonMessage): Promise<void>;
}

/**
 * A press of an Officer Link card's button, as the corrections read it. The press is acknowledged with deferUpdate before
 * any check, so every answer after it is a follow-up, and the card is replaced by an edit.
 */
export interface LinkButtonInteraction {
  readonly customId: string;
  readonly user: { readonly id: string };
  memberRoleIds(): readonly string[];
  deferUpdate(): Promise<void>;
  /** A private answer to the press, after its acknowledgement. */
  followUp(message: PrivateReply): Promise<void>;
  /** Replaces the card with a message that has no buttons. */
  update(message: Message): Promise<void>;
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

/** Everything /link reads: the handed-off Interview, the uid, the Member's presence, and the Game API for the Player. */
export interface LinkCommandDeps {
  readonly links: Pick<LinkStore, "memberForUid">;
  readonly interviews: Pick<InterviewStore, "latestFor">;
  readonly gameApi: Pick<InterviewGameApi, "getPlayer">;
  readonly isOnServer: (memberId: MemberId) => Promise<boolean>;
  readonly officerRoles: OfficerRoles;
  readonly confirmations: PendingLinkConfirmations;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** Everything an Officer Link's buttons read and write. */
export interface LinkButtonDeps {
  readonly links: LinkStore;
  readonly interviews: InterviewStore;
  readonly channels: Pick<OnboardingChannels, "post" | "log" | "archive">;
  readonly rankApprovals: Pick<RankApprovals, "announce">;
  readonly nameAndRoles: Pick<NameAndRoles, "onLinked">;
  readonly onboardingRole: Pick<OnboardingRole, "takeOff">;
  readonly isOnServer: (memberId: MemberId) => Promise<boolean>;
  readonly confirmations: PendingLinkConfirmations;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** How long the Confirm and Cancel buttons of an Officer Link stay usable. */
const CONFIRMATION_MS = 5 * 60_000;

/** An Officer Link the Officer has been shown and may confirm. */
export interface PendingLink {
  readonly officerId: MemberId;
  /** The Officer roles when the Officer Link was asked: a Confirm is refused from a Member who no longer holds one. */
  readonly officerRoleIds: readonly string[];
  readonly memberId: MemberId;
  readonly uid: Uid;
  readonly player: Player;
  readonly expiresAt: Date;
}

/**
 * The Officer Links waiting for their Officer to press Confirm or Cancel. Kept in memory: they end with a restart. Each has
 * a random id, so a card from before a restart cannot reach a new confirmation.
 */
export class PendingLinkConfirmations {
  private readonly waiting = new Map<string, PendingLink>();

  /** Keeps a confirmation until it expires; returns the id its buttons carry. */
  add(draft: Omit<PendingLink, "expiresAt">, now: Date): string {
    this.dropExpired(now);
    const id = randomUUID();
    this.waiting.set(id, { ...draft, expiresAt: new Date(now.getTime() + CONFIRMATION_MS) });
    return id;
  }

  /** The confirmation with this id, while it has not expired; undefined otherwise. */
  get(id: string, now: Date): PendingLink | undefined {
    const pending = this.waiting.get(id);
    return pending === undefined || pending.expiresAt.getTime() <= now.getTime() ? undefined : pending;
  }

  remove(id: string): void {
    this.waiting.delete(id);
  }

  private dropExpired(now: Date): void {
    for (const [id, pending] of this.waiting) {
      if (pending.expiresAt.getTime() <= now.getTime()) this.waiting.delete(id);
    }
  }
}

/** The Officer roles of the server: the Moderator and the King. */
function officerRoleIdsOf(officerRoles: OfficerRoles): readonly string[] {
  return [officerRoles.moderatorRoleId, officerRoles.kingRoleId];
}

/** The caller of a command as a correction sees them: their id, and whether they hold an Officer role. */
function correctorOf(
  interaction: { readonly callerId: MemberId; memberRoleIds(): readonly string[] },
  officerRoles: OfficerRoles,
): Corrector {
  return {
    memberId: interaction.callerId,
    isOfficer: isOfficer(interaction.memberRoleIds(), officerRoleIdsOf(officerRoles)),
  };
}

/** Writes a log line of a correction. A log channel that refuses it is logged, and the correction stands. */
async function logLine(logError: (line: string) => void, write: () => Promise<void>): Promise<void> {
  await answer("the log line of a correction", { logError }, write);
}

/** Defers the reply privately, runs the command, and logs (never throws) what fails. */
function privately(
  command: string,
  interaction: { deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<void> },
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
    const caller = correctorOf(interaction, deps.officerRoles);
    const named = interaction.memberOption() ?? caller.memberId;
    if (!mayCorrect("unlink", caller, named).ok) return interaction.editReply(notOfficerReply());
    if (deps.links.linkFor(named) === undefined) return interaction.editReply(notLinkedReply(named));
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
export function handleRank(interaction: CorrectionInteraction, deps: RankCommandDeps): Promise<void> {
  return privately("/rank", interaction, deps.logError, async () => {
    const caller = correctorOf(interaction, deps.officerRoles);
    const memberId = interaction.memberOption();
    const rank = asApprovableRank(interaction.rankOption() ?? "");
    // Without a Member named, only the Officer check can refuse, so the caller stands in for the target.
    const verdict = mayCorrect("rank-approval", caller, memberId ?? caller.memberId);
    if (!verdict.ok && verdict.reason === "not-officer") return interaction.editReply(notOfficerReply());
    if (memberId === undefined || rank === undefined) return interaction.editReply(rankInputReply());
    const link = deps.links.linkFor(memberId);
    if (link === undefined) return interaction.editReply(notLinkedReply(memberId));
    if (!verdict.ok) return interaction.editReply(ownLinkReply());
    const now = deps.now();
    const decision = officerRank(link, rank, caller.memberId, now);
    if (!decision.ok) {
      return interaction.editReply(decision.reason === "own-link" ? ownLinkReply() : noAllianceReply(memberId));
    }
    const settled = deps.links.rankByOfficer(memberId, { rank, approvedBy: caller.memberId }, now);
    if (settled !== undefined) {
      await deps.channels.post(settled.threadId, rankSetInThreadMessage(caller.memberId, memberId, rank));
    }
    await logLine(deps.logError, () => deps.channels.log(rankSetLogLine(caller.memberId, memberId, rank)));
    await interaction.editReply(rankSetReply(memberId, rank, decision.gameRank));
    await deps.nameAndRoles.onRankApproved(memberId);
  });
}

/**
 * /link: an Officer Links a Member whose Interview was handed off, to a uid. The Player the uid names is looked up once,
 * with the Interview's purpose, and shown with Confirm and Cancel; nothing is stored until the Officer confirms.
 */
export function handleLink(interaction: LinkInteraction, deps: LinkCommandDeps): Promise<void> {
  return privately("/link", interaction, deps.logError, async () => {
    const caller = correctorOf(interaction, deps.officerRoles);
    const memberId = interaction.memberOption();
    const uid = parseUid(interaction.uidOption() ?? "");
    // Without a Member named, only the Officer check can refuse, so the caller stands in for the target.
    const verdict = mayCorrect("officer-link", caller, memberId ?? caller.memberId);
    if (!verdict.ok && verdict.reason === "not-officer") return interaction.editReply(notOfficerReply());
    if (memberId === undefined || !uid.ok) return interaction.editReply(linkInputReply());
    if (!verdict.ok) return interaction.editReply(selfLinkReply());
    if (deps.interviews.latestFor(memberId)?.step !== "handed-off") {
      return interaction.editReply(notHandedOffReply(memberId));
    }
    const holder = deps.links.memberForUid(uid.value);
    if (holder !== undefined) return interaction.editReply(uidLinkedElsewhereReply(holder));
    if (!(await deps.isOnServer(memberId))) return interaction.editReply(memberGoneReply(memberId));
    const now = deps.now();
    const result = await deps.gameApi.getPlayer(uid.value, "onboarding-interview");
    if (result.kind !== "found") return interaction.editReply(linkLookupFailureReply(result, uid.value, now));
    const confirmationId = deps.confirmations.add(
      {
        officerId: caller.memberId,
        officerRoleIds: officerRoleIdsOf(deps.officerRoles),
        memberId,
        uid: uid.value,
        player: result.value,
      },
      now,
    );
    return interaction.editReply(linkCardMessage(confirmationId, memberId, result.value));
  });
}

/**
 * An Officer Link card's button. Only the Officer who asked may press it, and only while the confirmation lasts. Cancel
 * ends the card. Confirm stores the Link and ends the handed-off Interview in one step, or refuses privately and stores
 * nothing when the state has moved on.
 */
export async function handleLinkButton(button: LinkButtonInteraction, deps: LinkButtonDeps): Promise<void> {
  await answer("/link button", { logError: deps.logError }, async () => {
    // Acknowledged first: the checks below make Game API and Discord calls that may outlast Discord's three seconds.
    await button.deferUpdate();
    const parsed = parseLinkCustomId(button.customId);
    if (parsed === undefined) return button.followUp(linkEndedReply());
    await pressLinkButton(button, parsed, deps);
  });
}

async function pressLinkButton(
  button: LinkButtonInteraction,
  press: { readonly confirmationId: string; readonly action: LinkAction },
  deps: LinkButtonDeps,
): Promise<void> {
  const pending = deps.confirmations.get(press.confirmationId, deps.now());
  if (pending === undefined) return button.followUp(linkEndedReply());
  if (pending.officerId !== button.user.id) return button.followUp(linkNotYoursReply());
  // The Officer who asked may have lost the role since: only an Officer may press, as when the Link was asked.
  if (!isOfficer(button.memberRoleIds(), pending.officerRoleIds)) return button.followUp(notOfficerButtonReply());
  deps.confirmations.remove(press.confirmationId);
  if (press.action === "cancel") {
    return button.update(linkCardEndedMessage(pending.memberId, pending.player, "cancelled"));
  }
  return confirmLink(button, pending, deps);
}

/**
 * Stores the Officer Link: the Link, the Interview as linked, and a pending Rank Approval when the rank is unknown, in one
 * transaction. A Member who left, or a state that moved on, is refused privately, and the card ends with nothing stored.
 */
async function confirmLink(button: LinkButtonInteraction, pending: PendingLink, deps: LinkButtonDeps): Promise<void> {
  const now = deps.now();
  const { memberId, player } = pending;
  const refuse = async (): Promise<void> => {
    await button.followUp(linkRefusedReply());
    await button.update(linkCardEndedMessage(memberId, player, "refused"));
  };
  if (!(await deps.isOnServer(memberId))) return refuse();
  const latest = deps.interviews.latestFor(memberId);
  if (latest === undefined) return refuse();
  const link: Link = {
    memberId,
    uid: pending.uid,
    linkedAt: now,
    allianceRank: rankOnLink(player),
    madeBy: { kind: "officer-link", officerId: pending.officerId },
  };
  const leaderMemberId = await leaderPing(deps, player);
  const draft = needsRankApproval(link.allianceRank)
    ? pendingApprovalFor(link, { memberId, threadId: latest.threadId }, leaderMemberId, now)
    : undefined;
  // The Interview is written only while it is still handed off; otherwise the whole transaction is rolled back.
  const linked = linkByOfficer(latest, pending.uid, pending.officerId, now);
  const outcome = storeLinkIfStep(
    deps,
    linked.interview,
    "handed-off",
    draft === undefined ? { link } : { link, rankApproval: draft },
  );
  if (outcome?.kind !== "linked") return refuse();
  await button.update(linkCardEndedMessage(memberId, player, "linked"));
  await finishOfficerLink(deps, pending, latest.threadId, link, outcome.rankApproval);
}

/**
 * The Onboarding Role is taken off, the stored Officer Link is said in the Interview thread, logged with its Officer, and
 * its name and roles applied. A pending Rank Approval is asked in the thread; otherwise the thread is archived. A failed
 * name and roles step is logged; the Link stands.
 */
async function finishOfficerLink(
  deps: LinkButtonDeps,
  pending: PendingLink,
  threadId: string,
  link: Link,
  rankApproval: RankApproval | undefined,
): Promise<void> {
  await deps.onboardingRole.takeOff(pending.memberId);
  await deps.channels.post(threadId, linkedMessage(pending.memberId, pending.player));
  await logLine(deps.logError, () =>
    deps.channels.log(officerLinkLogLine(pending.memberId, pending.player, pending.officerId)),
  );
  try {
    await deps.nameAndRoles.onLinked(pending.memberId, pending.player, link.allianceRank);
  } catch (error) {
    deps.logError(
      `Giving the name and roles after an Officer Link failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (rankApproval?.state === "pending") return deps.rankApprovals.announce(rankApproval, pending.player);
  await deps.channels.archive(threadId);
}
