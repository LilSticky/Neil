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
import type { InterviewStore } from "../storage/interview-store.js";
import type { LinkStore, PendingRankApprovalDraft } from "../storage/link-store.js";
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
    onButton: (button) => guarded(deps, "Interview button", () => pressButton(deps, button)),
    onModalSubmit: (modal) => guarded(deps, "Interview modal", () => submitModal(deps, modal)),
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
  const created = deps.interviews.create({ memberId: member.id, threadId }, deps.now());
  if (created.kind === "already-open") return undefined;
  await deps.channels.post(threadId, askUidMessage(created.interview.id, member.id));
  return threadId;
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
  if (parsed === undefined) return;
  if (parsed.action === "uid") return openUidModal(deps, button, parsed.interviewId);
  if (parsed.action === "confirm") return confirmPlayer(deps, button, parsed.interviewId);
  if (parsed.action === "reject") return rejectPlayer(deps, button, parsed.interviewId);
}

async function openUidModal(deps: InterviewDeps, button: ButtonInteractionLike, interviewId: number): Promise<void> {
  const ownership = ownershipOf(deps, interviewId, button.user.id);
  if (ownership.kind === "refused") return button.reply(ownership.reply);
  await button.showModal(uidModal(interviewId));
}

async function submitModal(deps: InterviewDeps, modal: ModalInteractionLike): Promise<void> {
  const parsed = parseInterviewCustomId(modal.customId);
  if (parsed === undefined || parsed.action !== "modal") return;
  const ownership = ownershipOf(deps, parsed.interviewId, modal.user.id);
  if (ownership.kind === "refused") return modal.reply(ownership.reply);
  // The Interview is busy with a check: the Member is told privately, nothing is counted.
  if (ownership.interview.step === "checking") return modal.reply(checkingReply());
  const transition = giveUid(ownership.interview, modal.fields.getTextInputValue("uid"), deps.now());
  if (transition.event.kind === "checking") {
    deps.interviews.save(transition.interview);
    await modal.deferUpdate();
    return checkUid(deps, transition.interview, transition.event.uid);
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
  if (interview.step !== "awaiting-confirmation") return;
  await button.update(withoutButtons(foundCardMessage(interview.id, interview.player)));
  const now = deps.now();
  const leaderMemberId = await leaderPing(deps, interview.player);
  const linked = confirm(interview, { kind: "linked" }, now);
  const link = linkFor(interview, now);
  const draft = pendingApprovalFor(link, interview, leaderMemberId, now);
  const outcome = deps.links.confirm(draft === undefined ? { link } : { link, rankApproval: draft }, () => {
    deps.interviews.save(linked.interview);
  });
  if (outcome.kind === "already-linked") {
    return refuseConfirmation(deps, interview, now);
  }
  await finishLink(deps, interview, leaderMemberId, outcome.rankApproval);
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
  if (interview.step !== "awaiting-confirmation") return;
  await button.update(withoutButtons(foundCardMessage(interview.id, interview.player)));
  const transition = reject(interview, deps.now());
  deps.interviews.save(transition.interview);
  await announce(deps, transition, interview.player.uid);
}

/** The Player was linked to someone else meanwhile: the attempt fails, the Member is asked again. */
async function refuseConfirmation(deps: InterviewDeps, interview: AwaitingConfirmation, now: Date): Promise<void> {
  const refused = confirm(interview, { kind: "already-linked" }, now);
  deps.interviews.save(refused.interview);
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

/** Looks the uid up once, applies the check to the Interview and says what happened. */
async function checkUid(deps: InterviewDeps, interview: OnboardingInterview, uid: Uid): Promise<void> {
  const check = await uidCheckOf(deps, interview.memberId, uid);
  const transition = uidChecked(interview, check, deps.now());
  deps.interviews.save(transition.interview);
  await announce(deps, transition, uid);
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
