import type { APIModalInteractionResponseCallbackData, BaseMessageOptions } from "discord.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import {
  confirm,
  giveUid,
  reject,
  uidChecked,
  type InterviewTransition,
  type AwaitingConfirmation,
  type OnboardingInterview,
  type OpenInterview,
  type UidCheck,
} from "../domain/onboarding-interview.js";
import { rankOnLink, type Link } from "../domain/link.js";
import type { Uid } from "../domain/lookup-input.js";
import type { LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { InterviewStore } from "../storage/interview-store.js";
import type { LinkStore } from "../storage/link-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import {
  alreadyLinkedMessage,
  askUidMessage,
  buttonOfSomeoneElseReply,
  checkingReply,
  foundCardMessage,
  handedOffLogLine,
  handedOffMessage,
  interviewEndedReply,
  linkedMessage,
  linkLogLine,
  malformedUidMessage,
  notFoundMessage,
  parseInterviewCustomId,
  quotaSpentMessage,
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
  readonly gameApi: InterviewGameApi;
  readonly officerRoles: OfficerRoles;
  readonly isOnServer: (memberId: MemberId) => Promise<boolean>;
  readonly now: () => Date;
  readonly logError: (line: string) => void;
}

/** The Interview entry points the Discord client routes to. Each one reports its own failures and never throws. */
export interface Interviews {
  onMemberJoined(member: JoinedMember): Promise<void>;
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
  const threadId = await deps.channels.openThread({ id: member.id, username: member.username });
  const created = deps.interviews.create({ memberId: member.id, threadId }, deps.now());
  if (created.kind === "already-open") return;
  await deps.channels.post(threadId, askUidMessage(created.interview.id, member.id));
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
  const linked = confirm(interview, { kind: "linked" }, now);
  const outcome = deps.links.confirm(
    { link: linkFor(interview, now) },
    () => {
      deps.interviews.save(linked.interview);
    },
  );
  if (outcome.kind === "already-linked") {
    return refuseConfirmation(deps, interview, now);
  }
  await finishLink(deps, interview, await leaderPing(deps, interview.player));
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

/** The Link is stored: the thread says so and closes, and the log notes it with the leader's Member when present. */
async function finishLink(deps: InterviewDeps, interview: AwaitingConfirmation, leaderMemberId: MemberId | undefined): Promise<void> {
  await deps.channels.post(interview.threadId, linkedMessage(interview.memberId, interview.player));
  await deps.channels.archive(interview.threadId);
  await deps.channels.log(linkLogLine(interview.memberId, interview.player, leaderMemberId));
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
