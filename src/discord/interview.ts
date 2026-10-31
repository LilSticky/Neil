import type { APIModalInteractionResponseCallbackData, BaseMessageOptions } from "discord.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import {
  confirm,
  giveUid,
  memberLeft,
  reject,
  uidChecked,
  type InterviewTransition,
  type AwaitingConfirmation,
  type OnboardingInterview,
  type OpenInterview,
  type UidCheck,
} from "../domain/onboarding-interview.js";
import { needsRankApproval, rankOnLink, type Link } from "../domain/link.js";
import type { Uid } from "../domain/lookup-input.js";
import type { LookupResult, Player } from "../domain/player.js";
import { cancel, chooseApprover, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import type { CreateOutcome, InterviewStore } from "../storage/interview-store.js";
import type { ConfirmOutcome, LinkStore, PendingRankApprovalDraft } from "../storage/link-store.js";
import type { OnboardingChannels, ThreadMember } from "./onboarding-channels.js";
import type { RankApprovals } from "./rank-approval.js";
import {
  abandonedLogLine,
  alreadyLinkedMessage,
  askUidMessage,
  buttonOfSomeoneElseReply,
  checkingReply,
  foundCardMessage,
  handedOffLogLine,
  handedOffMessage,
  interviewAlreadyOpenReply,
  interviewEndedReply,
  interviewLinkedReply,
  interviewOpenedReply,
  leftMessage,
  linkedMessage,
  linkLogLine,
  malformedUidMessage,
  notFoundMessage,
  parseInterviewCustomId,
  quotaSpentMessage,
  rankCancelledLeftMessage,
  rankCancelledLogLine,
  refusedLogLine,
  rejectedMessage,
  somethingWentWrongReply,
  unavailableMessage,
  uidModal,
  type ButtonMessage,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";

/** A Member who joined the server, as the Interview needs them. */
export interface JoinedMember {
  readonly id: MemberId;
  readonly username: string;
  readonly bot: boolean;
}

/** A Member who left the server, as the Interview needs them. */
export interface LeftMember {
  readonly id: MemberId;
  readonly username: string;
}

/** The part of a discord.js chat-input command that /interview uses: who ran it, and the private reply to them. */
export interface CommandLike {
  readonly user: { readonly id: string; readonly username: string };
  reply(message: PrivateReply): Promise<void>;
}

/** The part of a discord.js button press that an Interview button uses. */
export interface ButtonInteractionLike {
  readonly customId: string;
  readonly user: { readonly id: string };
  reply(message: PrivateReply): Promise<void>;
  showModal(modal: APIModalInteractionResponseCallbackData): Promise<void>;
  update(options: BaseMessageOptions): Promise<void>;
  /** A further private message, once the press was answered (by update); reply would fail then. */
  followUp(message: PrivateReply): Promise<void>;
}

/** The part of a discord.js modal submit that the uid modal uses. */
export interface ModalInteractionLike {
  readonly customId: string;
  readonly user: { readonly id: string };
  readonly fields: { getTextInputValue(id: string): string };
  reply(message: PrivateReply): Promise<void>;
  deferUpdate(): Promise<void>;
}

/** The part of the Game API client the Interview uses: one Player lookup per uid. */
export interface InterviewGameApi {
  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>>;
}

/** Everything the Interview reads and writes, injected so that tests run without Discord or the Game API. */
export interface InterviewDeps {
  readonly interviews: InterviewStore;
  readonly links: LinkStore;
  readonly channels: OnboardingChannels;
  readonly rankApprovals: RankApprovals;
  readonly gameApi: InterviewGameApi;
  readonly officerRoles: OfficerRoles;
  readonly isOnServer: (memberId: MemberId) => Promise<boolean>;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** The Interview entry points the Discord client routes to. Each one reports its own failures and never throws. */
export interface Interviews {
  onMemberJoined(member: JoinedMember): Promise<void>;
  onMemberLeft(member: LeftMember): Promise<void>;
  onCommand(command: CommandLike): Promise<void>;
  onButton(button: ButtonInteractionLike): Promise<void>;
  onModalSubmit(modal: ModalInteractionLike): Promise<void>;
}

/** Who may act on an Interview: its Member, while it is open. A refusal is the private reply to give instead. */
type Ownership =
  | { readonly kind: "owned"; readonly interview: OpenInterview }
  | { readonly kind: "refused"; readonly reply: PrivateReply };

export function createInterviews(deps: InterviewDeps): Interviews {
  return {
    onMemberJoined: (member) => guarded(deps, "joining Member", () => joinMember(deps, member)),
    onMemberLeft: (member) => guarded(deps, "leaving Member", () => leaveServer(deps, member)),
    onCommand: (command) => guarded(deps, "/interview", () => startOnCommand(deps, command)),
    onButton: (button) => {
      const ack: Acknowledgement = { acknowledged: false };
      return guardedPress(deps, "Interview button", button, ack, () => pressButton(deps, trackedButton(button, ack)));
    },
    onModalSubmit: (modal) => {
      const ack: Acknowledgement = { acknowledged: false };
      return guardedPress(deps, "Interview modal", modal, ack, () => submitModal(deps, trackedModal(modal, ack)));
    },
  };
}

/** Runs one entry point; a failure is logged, never thrown, so one Interview cannot crash the bot. */
async function guarded(deps: InterviewDeps, label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    deps.logError(`${label} failed: ${errorText(error)}`);
  }
}

/** Whether Discord has been answered for a press or submit: a reply, an update, a modal or a deferred update. */
interface Acknowledgement {
  acknowledged: boolean;
}

/** Runs one button press or modal submit; a failure is logged and, when Discord was not answered yet, told privately. */
async function guardedPress(
  deps: InterviewDeps,
  label: string,
  interaction: { reply(message: PrivateReply): Promise<void> },
  ack: Acknowledgement,
  work: () => Promise<void>,
): Promise<void> {
  try {
    await work();
  } catch (error) {
    deps.logError(`${label} failed: ${errorText(error)}`);
    if (ack.acknowledged) return;
    try {
      await interaction.reply(somethingWentWrongReply());
    } catch (replyError) {
      deps.logError(`${label} could not reply: ${errorText(replyError)}`);
    }
  }
}

/** The button, recording in ack every answer given to Discord. */
function trackedButton(button: ButtonInteractionLike, ack: Acknowledgement): ButtonInteractionLike {
  return {
    customId: button.customId,
    user: button.user,
    reply: (message) => {
      ack.acknowledged = true;
      return button.reply(message);
    },
    showModal: (modal) => {
      ack.acknowledged = true;
      return button.showModal(modal);
    },
    update: (options) => {
      ack.acknowledged = true;
      return button.update(options);
    },
    followUp: (message) => button.followUp(message),
  };
}

/** The modal submit, recording in ack every answer given to Discord. */
function trackedModal(modal: ModalInteractionLike, ack: Acknowledgement): ModalInteractionLike {
  return {
    customId: modal.customId,
    user: modal.user,
    fields: modal.fields,
    reply: (message) => {
      ack.acknowledged = true;
      return modal.reply(message);
    },
    deferUpdate: () => {
      ack.acknowledged = true;
      return modal.deferUpdate();
    },
  };
}

/** Raised inside the Link transaction when the Interview is no longer awaiting its confirmation: nothing is stored. */
class InterviewMovedOn extends Error {}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

async function joinMember(deps: InterviewDeps, member: JoinedMember): Promise<void> {
  if (member.bot) return;
  if (deps.links.linkFor(member.id) !== undefined) return;
  if (deps.interviews.openFor(member.id) !== undefined) return;
  await openInterview(deps, { id: member.id, username: member.username });
}

/** /interview: a Linked Member is told their uid, a Member with an open Interview is pointed to its thread, others get a new one. */
async function startOnCommand(deps: InterviewDeps, command: CommandLike): Promise<void> {
  const memberId = command.user.id;
  const link = deps.links.linkFor(memberId);
  if (link !== undefined) return command.reply(interviewLinkedReply(link.uid));
  const open = deps.interviews.openFor(memberId);
  if (open !== undefined) return command.reply(interviewAlreadyOpenReply(open.threadId));
  const threadId = await openInterview(deps, { id: memberId, username: command.user.username });
  if (threadId !== undefined) return command.reply(interviewOpenedReply(threadId));
  // An Interview was opened for the Member meanwhile: the Member is pointed to it.
  const raced = deps.interviews.openFor(memberId);
  if (raced !== undefined) return command.reply(interviewAlreadyOpenReply(raced.threadId));
}

/**
 * Opens a thread for the Member, saves the new Interview and asks for the uid in the thread. Returns the thread,
 * or undefined when the Member already had an open Interview: nothing is asked then.
 */
async function openInterview(deps: InterviewDeps, member: ThreadMember): Promise<string | undefined> {
  const threadId = await deps.channels.openThread(member);
  const created = await createOrDiscard(deps, member.id, threadId);
  if (created.kind === "already-open") return undefined;
  await deps.channels.post(threadId, askUidMessage(created.interview.id, member.id));
  return threadId;
}

/** Saves the new Interview; when that fails or another Interview won the race, the thread just opened is deleted. */
async function createOrDiscard(deps: InterviewDeps, memberId: MemberId, threadId: string): Promise<CreateOutcome> {
  let created: CreateOutcome;
  try {
    created = deps.interviews.create({ memberId, threadId }, deps.now());
  } catch (error) {
    await deps.channels.deleteThread(threadId);
    throw error;
  }
  if (created.kind === "already-open") await deps.channels.deleteThread(threadId);
  return created;
}

/** A Member who left: the open Interview is abandoned as left, and the pending Rank Approval of their Link is cancelled. */
async function leaveServer(deps: InterviewDeps, member: LeftMember): Promise<void> {
  const now = deps.now();
  const interview = deps.interviews.openFor(member.id);
  if (interview !== undefined) await abandonOnLeave(deps, interview, member.username, now);
  const approval = deps.links.pendingFor(member.id);
  if (approval !== undefined) await cancelRankApproval(deps, approval, member.username, now);
}

async function abandonOnLeave(deps: InterviewDeps, interview: OpenInterview, username: string, now: Date): Promise<void> {
  const transition = memberLeft(interview, now);
  if (transition.event.kind !== "abandoned") return;
  deps.interviews.save(transition.interview);
  await deps.channels.post(interview.threadId, leftMessage(username));
  await deps.channels.lockAndArchive(interview.threadId);
  await deps.channels.log(abandonedLogLine(interview.memberId, "left"));
}

async function cancelRankApproval(deps: InterviewDeps, approval: RankApproval, username: string, now: Date): Promise<void> {
  const change = cancel(approval, now);
  if (!change.ok) return;
  deps.links.save(change.approval);
  await deps.channels.post(approval.threadId, rankCancelledLeftMessage(username));
  await deps.channels.archive(approval.threadId);
  await deps.channels.log(rankCancelledLogLine(approval.linkedMemberId));
}

async function pressButton(deps: InterviewDeps, button: ButtonInteractionLike): Promise<void> {
  const parsed = parseInterviewCustomId(button.customId);
  if (parsed === undefined) return button.reply(interviewEndedReply());
  switch (parsed.action) {
    case "uid":
      return openUidModal(deps, button, parsed.interviewId);
    case "confirm":
      return confirmPlayer(deps, button, parsed.interviewId);
    case "reject":
      return rejectPlayer(deps, button, parsed.interviewId);
    case "modal":
      return button.reply(interviewEndedReply());
  }
}

async function openUidModal(deps: InterviewDeps, button: ButtonInteractionLike, interviewId: number): Promise<void> {
  const ownership = ownershipOf(deps, interviewId, button.user.id);
  if (ownership.kind === "refused") return button.reply(ownership.reply);
  await button.showModal(uidModal(interviewId));
}

async function submitModal(deps: InterviewDeps, modal: ModalInteractionLike): Promise<void> {
  const parsed = parseInterviewCustomId(modal.customId);
  if (parsed === undefined || parsed.action !== "modal") return modal.reply(interviewEndedReply());
  const ownership = ownershipOf(deps, parsed.interviewId, modal.user.id);
  if (ownership.kind === "refused") return modal.reply(ownership.reply);
  // The Interview is busy with a check: the Member is told privately, nothing is counted.
  if (ownership.interview.step === "checking") return modal.reply(checkingReply());
  if (ownership.interview.step !== "awaiting-uid") return modal.reply(interviewEndedReply());
  const transition = giveUid(ownership.interview, modal.fields.getTextInputValue("uid"), deps.now());
  if (transition.event.kind === "checking") {
    // Read and saved without an await in between, so no conditional save is needed here.
    deps.interviews.save(transition.interview);
    return checkUid(deps, modal, transition.interview, transition.event.uid);
  }
  // Every other submit is acknowledged once; a malformed uid is asked again in the thread.
  await modal.deferUpdate();
  if (transition.event.kind === "malformed") {
    await deps.channels.post(ownership.interview.threadId, malformedUidMessage(parsed.interviewId));
  }
}

async function confirmPlayer(deps: InterviewDeps, button: ButtonInteractionLike, interviewId: number): Promise<void> {
  const ownership = ownershipOf(deps, interviewId, button.user.id);
  if (ownership.kind === "refused") return button.reply(ownership.reply);
  const { interview } = ownership;
  if (interview.step !== "awaiting-confirmation") return button.reply(interviewEndedReply());
  await button.update(withoutButtons(foundCardMessage(interview.id, interview.player)));
  const now = deps.now();
  const leaderMemberId = await leaderPing(deps, interview.player);
  const linked = confirm(interview, { kind: "linked" }, now);
  const link = linkFor(interview, now);
  const draft = pendingApprovalFor(link, interview, leaderMemberId, now);
  const outcome = storeLink(deps, linked.interview, draft === undefined ? { link } : { link, rankApproval: draft });
  if (outcome === undefined) return button.followUp(interviewEndedReply());
  if (outcome.kind === "already-linked") return refuseConfirmation(deps, button, interview, now);
  // The Member already holds this uid: the Interview is done, so it is saved as linked when it still waits, and the press ends.
  if (outcome.kind === "held") {
    deps.interviews.saveIfStep(linked.interview, "awaiting-confirmation");
    return button.followUp(interviewEndedReply());
  }
  await finishLink(deps, interview, leaderMemberId, outcome.rankApproval);
}

/**
 * Stores the Link and the Interview as linked, in one transaction. Undefined when the Interview is no longer awaiting
 * its confirmation: then nothing is stored.
 */
function storeLink(
  deps: InterviewDeps,
  linked: OnboardingInterview,
  input: { readonly link: Link; readonly rankApproval?: PendingRankApprovalDraft },
): ConfirmOutcome | undefined {
  try {
    return deps.links.confirm(input, () => {
      if (!deps.interviews.saveIfStep(linked, "awaiting-confirmation")) throw new InterviewMovedOn();
    });
  } catch (error) {
    if (error instanceof InterviewMovedOn) return undefined;
    throw error;
  }
}

/** A Link with an unknown rank waits for a Rank Approval, asked of the leader's Member when present, else the Officers. */
function pendingApprovalFor(
  link: Link,
  interview: AwaitingConfirmation,
  leaderMemberId: MemberId | undefined,
  now: Date,
): PendingRankApprovalDraft | undefined {
  if (!needsRankApproval(link.allianceRank)) return undefined;
  return {
    state: "pending",
    linkedMemberId: interview.memberId,
    threadId: interview.threadId,
    approver: chooseApprover(leaderMemberId, interview.memberId),
    askedAt: now,
  };
}

/** The Member says the Player shown is not theirs: the attempt counts, the Member is asked for the uid again. */
async function rejectPlayer(deps: InterviewDeps, button: ButtonInteractionLike, interviewId: number): Promise<void> {
  const ownership = ownershipOf(deps, interviewId, button.user.id);
  if (ownership.kind === "refused") return button.reply(ownership.reply);
  const { interview } = ownership;
  if (interview.step !== "awaiting-confirmation") return button.reply(interviewEndedReply());
  await button.update(withoutButtons(foundCardMessage(interview.id, interview.player)));
  const transition = reject(interview, deps.now());
  if (!deps.interviews.saveIfStep(transition.interview, "awaiting-confirmation")) {
    return button.followUp(interviewEndedReply());
  }
  await announce(deps, transition, interview.player.uid);
}

/** The Player was linked to someone else meanwhile: the attempt fails, the Member is asked again. */
async function refuseConfirmation(
  deps: InterviewDeps,
  button: ButtonInteractionLike,
  interview: AwaitingConfirmation,
  now: Date,
): Promise<void> {
  const refused = confirm(interview, { kind: "already-linked" }, now);
  if (!deps.interviews.saveIfStep(refused.interview, "awaiting-confirmation")) return button.followUp(interviewEndedReply());
  await announce(deps, refused, interview.player.uid);
}

/**
 * The Link is stored: the thread says so, and the log notes it with the leader's Member when present. The thread
 * closes, unless a Rank Approval is asked in it: then the thread is archived when the approval ends.
 */
async function finishLink(
  deps: InterviewDeps,
  interview: AwaitingConfirmation,
  leaderMemberId: MemberId | undefined,
  rankApproval: RankApproval | undefined,
): Promise<void> {
  await deps.channels.post(interview.threadId, linkedMessage(interview.memberId, interview.player));
  await deps.channels.log(linkLogLine(interview.memberId, interview.player, leaderMemberId));
  if (rankApproval?.state === "pending") return deps.rankApprovals.announce(rankApproval, interview.player);
  await deps.channels.archive(interview.threadId);
}

function linkFor(interview: AwaitingConfirmation, now: Date): Link {
  return {
    memberId: interview.memberId,
    uid: interview.player.uid,
    linkedAt: now,
    allianceRank: rankOnLink(interview.player),
  };
}

/** The Member of the Alliance's leader, when that Member is Linked and on the server; otherwise nobody is pinged. */
async function leaderPing(deps: InterviewDeps, player: Player): Promise<MemberId | undefined> {
  const leaderUid = player.alliance?.leaderUid;
  if (leaderUid === undefined) return undefined;
  const leader = deps.links.memberForUid(leaderUid);
  if (leader === undefined) return undefined;
  return (await deps.isOnServer(leader)) ? leader : undefined;
}

/**
 * Acknowledges the modal, looks the uid up once, applies the check to the Interview and says what happened. A failure
 * on the way counts as an unavailable check: the Member is asked for the uid again.
 */
async function checkUid(deps: InterviewDeps, modal: ModalInteractionLike, interview: OnboardingInterview, uid: Uid): Promise<void> {
  const check = await checkOrUnavailable(deps, modal, interview.memberId, uid);
  const transition = uidChecked(interview, check, deps.now());
  // The Member may have left or the Interview may have been abandoned during the lookup: then nothing is said.
  if (!deps.interviews.saveIfStep(transition.interview, "checking")) return;
  await announce(deps, transition, uid);
}

async function checkOrUnavailable(
  deps: InterviewDeps,
  modal: ModalInteractionLike,
  memberId: MemberId,
  uid: Uid,
): Promise<UidCheck> {
  try {
    await modal.deferUpdate();
    return await uidCheckOf(deps, memberId, uid);
  } catch (error) {
    deps.logError(`Checking an Interview uid failed: ${errorText(error)}`);
    return { kind: "unavailable" };
  }
}

/** A uid another Member holds is refused without asking the Game API. */
async function uidCheckOf(deps: InterviewDeps, memberId: MemberId, uid: Uid): Promise<UidCheck> {
  const holder = deps.links.memberForUid(uid);
  if (holder !== undefined && holder !== memberId) return { kind: "already-linked" };
  return checkFromResult(deps, await deps.gameApi.getPlayer(uid, "onboarding-interview"));
}

/** The Game API's answer as the Interview needs it (research R7). */
function checkFromResult(deps: InterviewDeps, result: LookupResult<Player>): UidCheck {
  switch (result.kind) {
    case "found":
      return { kind: "found", player: result.value };
    case "not-found":
      return { kind: "not-found" };
    case "not-prepared":
      return { kind: "not-prepared" };
    case "quota-spent":
      return { kind: "quota-spent", resetsAt: result.resetsAt };
    case "try-again":
    case "unavailable":
      return { kind: "unavailable" };
    case "reserve-kept":
    case "ambiguous":
      deps.logError(`Game API answered ${result.kind} for an Interview uid, which it should not`);
      return { kind: "unavailable" };
  }
}

/** Says what a transition means in the thread and the log. */
async function announce(deps: InterviewDeps, transition: InterviewTransition, uid: Uid): Promise<void> {
  const { interview, event } = transition;
  switch (event.kind) {
    case "found":
      await deps.channels.post(interview.threadId, foundCardMessage(interview.id, event.player));
      return;
    case "failed":
      return announceFailure(deps, transition, event.reason, event.attemptsLeft, uid);
    case "handed-off":
      await deps.channels.post(interview.threadId, handedOffMessage(interview.memberId, deps.officerRoles));
      await deps.channels.log(handedOffLogLine(interview.memberId, interview.threadId));
      return;
    case "unavailable":
      await deps.channels.post(interview.threadId, unavailableMessage(interview.id));
      return;
    case "paused":
      await deps.channels.post(interview.threadId, quotaSpentMessage(event.resumesAt, deps.now()));
      return;
    default:
      return;
  }
}

async function announceFailure(
  deps: InterviewDeps,
  transition: InterviewTransition,
  reason: "not-found" | "not-prepared" | "already-linked" | "rejected",
  attemptsLeft: number,
  uid: Uid,
): Promise<void> {
  const { interview } = transition;
  const message = failureMessage(interview.id, reason, attemptsLeft, uid);
  if (reason === "already-linked") {
    await deps.channels.log(refusedLogLine(interview.memberId, uid));
  }
  await deps.channels.post(interview.threadId, message);
}

function failureMessage(
  interviewId: number,
  reason: "not-found" | "not-prepared" | "already-linked" | "rejected",
  attemptsLeft: number,
  uid: Uid,
): ButtonMessage {
  switch (reason) {
    case "not-found":
    case "not-prepared":
      return notFoundMessage(interviewId, uid, attemptsLeft);
    case "already-linked":
      return alreadyLinkedMessage(interviewId, attemptsLeft);
    case "rejected":
      return rejectedMessage(interviewId, attemptsLeft);
  }
}

/** The card without its buttons, once the Member has pressed one of them. */
function withoutButtons(card: ButtonMessage): BaseMessageOptions {
  return { content: card.content, allowedMentions: card.allowedMentions, components: [] };
}

/** Who may act on the Interview: its Member, while it is open; anyone else, or an ended Interview, gets a private refusal. */
function ownershipOf(deps: InterviewDeps, interviewId: number, memberId: MemberId): Ownership {
  const interview = deps.interviews.get(interviewId);
  if (interview === undefined) return { kind: "refused", reply: interviewEndedReply() };
  if (interview.memberId !== memberId) return { kind: "refused", reply: buttonOfSomeoneElseReply() };
  if (!isOpen(interview)) return { kind: "refused", reply: interviewEndedReply() };
  return { kind: "owned", interview };
}

function isOpen(interview: OnboardingInterview): interview is OpenInterview {
  return (
    interview.step === "awaiting-uid" ||
    interview.step === "checking" ||
    interview.step === "awaiting-confirmation" ||
    interview.step === "paused-for-quota"
  );
}
