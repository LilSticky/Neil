import { MessageFlags, type APIModalInteractionResponseCallbackData, type BaseMessageOptions } from "discord.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import {
  acceptRecommendation,
  confirm,
  declineRecommendation,
  giveUid,
  memberLeft,
  pickMatch,
  recommendationFound,
  reject,
  uidChecked,
  type AwaitingConfirmation,
  type AwaitingPick,
  type AwaitingRecommendation,
  type InterviewTransition,
  type OnboardingInterview,
  type OpenInterview,
  type RecommendationResult,
  type Recommending,
  type UidCheck,
} from "../domain/onboarding-interview.js";
import { needsRankApproval, rankOnLink, type Link } from "../domain/link.js";
import { parseUid, type KingdomNumber, type PlayerName, type Uid } from "../domain/lookup-input.js";
import { listedPlayerMatches, type LookupResult, type PickablePlayerMatch, type Player } from "../domain/player.js";
import { cleanDisplayName } from "../domain/recommended-player.js";
import { cancel, chooseApprover, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import type { CreateOutcome, InterviewStore } from "../storage/interview-store.js";
import type { ConfirmOutcome, LinkStore, PendingRankApprovalDraft } from "../storage/link-store.js";
import type { NameAndRoles } from "./name-and-roles.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { OnboardingRole } from "./onboarding-role.js";
import type { RankApprovals } from "./rank-approval.js";
import type { Unlink } from "./unlink.js";
import {
  abandonedLogLine,
  alreadyLinkedMessage,
  askUidMessage,
  askUidOfPlayerMessage,
  buttonOfSomeoneElseReply,
  checkingReply,
  foundCardMessage,
  handedOffLogLine,
  handedOffMessage,
  interviewAlreadyOpenReply,
  interviewEndedReply,
  interviewLinkedReply,
  interviewOpenedReply,
  linkedMessage,
  linkLogLine,
  malformedUidMessage,
  notFoundMessage,
  parseInterviewCustomId,
  pickListMessage,
  quotaSpentMessage,
  rankCancelledLogLine,
  recommendationMessage,
  refusedLogLine,
  rejectedMessage,
  somethingWentWrongReply,
  unavailableMessage,
  uidModal,
  type ButtonMessage,
  type Message,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";

/** A Member who joined the server, as the Interview needs them. */
export interface JoinedMember {
  readonly id: MemberId;
  readonly username: string;
  readonly displayName: string;
  readonly bot: boolean;
}

/** A Member whose Interview is opened: the thread is named after the username, the Recommended Player is looked up by the display name. */
interface OpeningMember {
  readonly id: MemberId;
  readonly username: string;
  readonly displayName: string;
}

/** A Member who left the server, as the Interview needs them. */
export interface LeftMember {
  readonly id: MemberId;
  readonly username: string;
}

/** The part of a discord.js chat-input command that /interview uses: who ran it, and the private reply to them. */
export interface CommandLike {
  readonly user: { readonly id: string; readonly username: string };
  /** The Member's server display name, cleaned into the Recommended Player's Player Name. */
  readonly displayName: string;
  /** Defers the answer, privately; Discord allows three seconds without it. */
  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<void>;
  /** The one answer to the deferred command. */
  editReply(message: PrivateReply): Promise<void>;
}

/** The part of a discord.js button press that an Interview button uses. */
export interface ButtonInteractionLike {
  readonly customId: string;
  readonly user: { readonly id: string };
  /** What a string select menu press picked, as the option values; absent for a button. */
  readonly values?: readonly string[] | undefined;
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

/** The part of the Game API client the Interview uses: one Player lookup per uid, one per Player Name. */
export interface InterviewGameApi {
  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>>;
  findPlayer(
    name: PlayerName,
    kingdom: KingdomNumber | undefined,
    purpose: RequestPurpose,
  ): Promise<LookupResult<Player>>;
}

/** Everything the Interview reads and writes, injected so that tests run without Discord or the Game API. */
export interface InterviewDeps {
  readonly interviews: InterviewStore;
  readonly links: LinkStore;
  readonly channels: OnboardingChannels;
  readonly rankApprovals: RankApprovals;
  readonly nameAndRoles: NameAndRoles;
  readonly unlink: Unlink;
  readonly onboardingRole: Pick<OnboardingRole, "give" | "takeOff">;
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
  /** After a restart: makes the Link of a chosen Player, as the Member's confirmation would. Rejects on a failure; the sweeper logs it. */
  readonly linkChosen: (interview: AwaitingConfirmation) => Promise<"done" | "ended" | "refused">;
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
    linkChosen: (interview) => linkConfirmed(deps, interview),
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
    values: button.values,
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

/** The name a pick is called by when its match has none; the same label the pick list shows. */
const UNNAMED_MATCH = "Unknown";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

async function joinMember(deps: InterviewDeps, member: JoinedMember): Promise<void> {
  if (member.bot) return;
  if (deps.links.linkFor(member.id) !== undefined) return;
  if (deps.interviews.openFor(member.id) !== undefined) return;
  await deps.onboardingRole.give(member.id);
  await openInterview(deps, { id: member.id, username: member.username, displayName: member.displayName });
}

/** /interview: a Linked Member is told their uid, a Member with an open Interview is pointed to its thread, others get a new one. */
async function startOnCommand(deps: InterviewDeps, command: CommandLike): Promise<void> {
  // Discord allows three seconds for a first answer; the thread work comes after this deferral, answered with editReply.
  await command.deferReply({ flags: MessageFlags.Ephemeral });
  let reply: PrivateReply;
  try {
    reply = await commandReply(deps, command);
  } catch (error) {
    deps.logError(`/interview failed: ${errorText(error)}`);
    reply = somethingWentWrongReply();
  }
  await command.editReply(reply);
}

/** The private answer to /interview: the Member's uid when Linked, the open thread when one is open, else the new thread. */
async function commandReply(deps: InterviewDeps, command: CommandLike): Promise<PrivateReply> {
  const memberId = command.user.id;
  const link = deps.links.linkFor(memberId);
  if (link !== undefined) return interviewLinkedReply(link.uid);
  const open = deps.interviews.openFor(memberId);
  if (open !== undefined) return interviewAlreadyOpenReply(open.threadId);
  const threadId = await openInterview(deps, {
    id: memberId,
    username: command.user.username,
    displayName: command.displayName,
  });
  if (threadId !== undefined) return interviewOpenedReply(threadId);
  // An Interview was opened for the Member meanwhile: the Member is pointed to it.
  const raced = deps.interviews.openFor(memberId);
  if (raced !== undefined) return interviewAlreadyOpenReply(raced.threadId);
  return somethingWentWrongReply();
}

/**
 * Opens a thread for the Member, saves the new Interview and asks for the uid in the thread. Returns the thread,
 * or undefined when the Member already had an open Interview: nothing is asked then.
 */
async function openInterview(deps: InterviewDeps, member: OpeningMember): Promise<string | undefined> {
  const threadId = await deps.channels.openThread({ id: member.id, username: member.username });
  const created = await createOrDiscard(deps, member.id, threadId);
  if (created.kind === "already-open") return undefined;
  await recommend(deps, created.interview, member.displayName);
  return threadId;
}

/**
 * Saves the new Interview, recommending a Player; when that fails or another Interview won the race, the thread just
 * opened is deleted.
 */
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

/**
 * The name lookup of the display name answered: the answer is saved, then shown in the thread. Nothing is shown when
 * the Interview moved on meanwhile, the Member having left for one.
 */
async function recommend(deps: InterviewDeps, interview: Recommending, displayName: string): Promise<void> {
  const result = await recommendationOf(deps, interview.memberId, displayName);
  const transition = recommendationFound(interview, result, deps.now());
  if (!deps.interviews.saveIfStep(transition.interview, "recommending")) return;
  const { event } = transition;
  switch (event.kind) {
    case "asked":
      await deps.channels.post(interview.threadId, askUidMessage(interview.id, interview.memberId));
      return;
    case "recommended":
      await deps.channels.post(interview.threadId, recommendationMessage(interview.id, interview.memberId, event.player));
      return;
    case "pick-list":
      await deps.channels.post(interview.threadId, pickListMessage(interview.id, interview.memberId, event.matches));
      return;
    default:
      return;
  }
}

/**
 * The Recommended Player for a display name: the cleaned name looked up once. No usable name, no match, a match Linked
 * to another Member, a failed or unavailable lookup: none, so the uid is asked for as usual.
 */
async function recommendationOf(deps: InterviewDeps, memberId: MemberId, displayName: string): Promise<RecommendationResult> {
  const name = cleanDisplayName(displayName);
  if (name === undefined) return { kind: "none" };
  try {
    const result = await deps.gameApi.findPlayer(name, undefined, "onboarding-interview");
    return recommendationFromResult(deps, memberId, result);
  } catch (error) {
    deps.logError(`Looking up the Recommended Player failed: ${errorText(error)}`);
    return { kind: "none" };
  }
}

function recommendationFromResult(
  deps: InterviewDeps,
  memberId: MemberId,
  result: LookupResult<Player>,
): RecommendationResult {
  switch (result.kind) {
    case "found": {
      const holder = deps.links.memberForUid(result.value.uid);
      if (holder !== undefined && holder !== memberId) return { kind: "none" };
      return { kind: "one", player: result.value };
    }
    case "ambiguous": {
      const { listed } = listedPlayerMatches(result.matches);
      const offered = listed.filter((match) => notLinkedToOther(deps, memberId, match));
      return offered.length === 0 ? { kind: "none" } : { kind: "several", matches: offered };
    }
    case "not-found":
    case "not-prepared":
    case "try-again":
    case "unavailable":
    case "quota-spent":
    case "reserve-kept":
      return { kind: "none" };
  }
}

/**
 * Whether a match may be offered to the Member: a match with a uid Linked to another Member is not. A match without a
 * valid uid is kept, so that a pick of it is answered as a failure.
 */
function notLinkedToOther(deps: InterviewDeps, memberId: MemberId, match: PickablePlayerMatch): boolean {
  const uid = parseUid(match.uid);
  if (!uid.ok) return true;
  const holder = deps.links.memberForUid(uid.value);
  return holder === undefined || holder === memberId;
}

/**
 * A Member who left: the open Interview is abandoned as left, the pending Rank Approval of their Link is cancelled, and
 * their Link is Unlinked as left. Each of the first two is guarded on its own, so a thread that is gone never keeps the
 * Link.
 */
async function leaveServer(deps: InterviewDeps, member: LeftMember): Promise<void> {
  const now = deps.now();
  const interview = deps.interviews.openFor(member.id);
  if (interview !== undefined) {
    await leaveStep(deps, `Abandoning the Interview of ${member.id}`, () =>
      abandonOnLeave(deps, interview, now),
    );
  }
  const approval = deps.links.pendingFor(member.id);
  if (approval !== undefined) {
    await leaveStep(deps, `Cancelling the Rank Approval of ${member.id}`, () =>
      cancelRankApproval(deps, approval, now),
    );
  }
  await deps.unlink.unlink({ id: member.id }, "left");
}

/** One step of a Member leaving; a failure is logged and the steps after it still run. */
async function leaveStep(deps: InterviewDeps, label: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    deps.logError(`${label} failed when the Member left: ${errorText(error)}`);
  }
}

async function abandonOnLeave(deps: InterviewDeps, interview: OpenInterview, now: Date): Promise<void> {
  const transition = memberLeft(interview, now);
  if (transition.event.kind !== "abandoned") return;
  deps.interviews.save(transition.interview);
  // The log comes first: a thread that is gone must not cost the line.
  await deps.channels.log(abandonedLogLine(interview.memberId, "left"));
  await deps.channels.deleteThread(interview.threadId);
}

async function cancelRankApproval(deps: InterviewDeps, approval: RankApproval, now: Date): Promise<void> {
  const change = cancel(approval, now);
  if (!change.ok) return;
  deps.links.save(change.approval);
  // The log comes first: a thread that is gone must not cost the line.
  await deps.channels.log(rankCancelledLogLine(approval.linkedMemberId));
  await deps.channels.deleteThread(approval.threadId);
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
    case "accept":
      return acceptPlayer(deps, button, parsed.interviewId);
    case "decline":
      return declineShown(deps, button, parsed.interviewId);
    case "pick":
      return pickPlayer(deps, button, parsed.interviewId);
    case "modal":
      return button.reply(interviewEndedReply());
  }
}

/** "That's me" on the Recommended Player: the card loses its buttons, and the uid of that Player is asked for. */
async function acceptPlayer(deps: InterviewDeps, button: ButtonInteractionLike, interviewId: number): Promise<void> {
  const ownership = ownershipOf(deps, interviewId, button.user.id);
  if (ownership.kind === "refused") return button.reply(ownership.reply);
  const { interview } = ownership;
  if (interview.step !== "awaiting-recommendation") return button.reply(interviewEndedReply());
  await button.update(withoutButtons(recommendationMessage(interview.id, interview.memberId, interview.recommended)));
  const transition = acceptRecommendation(interview, deps.now());
  if (!deps.interviews.saveIfStep(transition.interview, "awaiting-recommendation")) {
    return button.followUp(interviewEndedReply());
  }
  await deps.channels.post(interview.threadId, askUidOfPlayerMessage(interview.id, interview.recommended.name));
}

/** "That's not me" or "None of these": the card loses its buttons, and the uid is asked for; no attempt counts. */
async function declineShown(deps: InterviewDeps, button: ButtonInteractionLike, interviewId: number): Promise<void> {
  const ownership = ownershipOf(deps, interviewId, button.user.id);
  if (ownership.kind === "refused") return button.reply(ownership.reply);
  const { interview } = ownership;
  if (interview.step !== "awaiting-recommendation" && interview.step !== "awaiting-pick") {
    return button.reply(interviewEndedReply());
  }
  await button.update(withoutButtons(shownCard(interview)));
  const transition = declineRecommendation(interview, deps.now());
  if (!deps.interviews.saveIfStep(transition.interview, interview.step)) return button.followUp(interviewEndedReply());
  await deps.channels.post(interview.threadId, askUidMessage(interview.id, interview.memberId));
}

/** A pick from the pick list: the card loses its select menu, and the uid of the picked match is asked for. */
async function pickPlayer(deps: InterviewDeps, button: ButtonInteractionLike, interviewId: number): Promise<void> {
  const ownership = ownershipOf(deps, interviewId, button.user.id);
  if (ownership.kind === "refused") return button.reply(ownership.reply);
  const index = pickedIndexOf(button.values);
  if (index === undefined) return button.reply(somethingWentWrongReply());
  const { interview } = ownership;
  if (interview.step !== "awaiting-pick") return button.reply(interviewEndedReply());
  const picked = interview.matches[index];
  if (picked === undefined) return button.reply(interviewEndedReply());
  if (!parseUid(picked.uid).ok) return button.reply(somethingWentWrongReply());
  const transition = pickMatch(interview, index, deps.now());
  if (transition.event.kind !== "asked") return button.reply(interviewEndedReply());
  await button.update(withoutButtons(pickListMessage(interview.id, interview.memberId, interview.matches)));
  if (!deps.interviews.saveIfStep(transition.interview, "awaiting-pick")) return button.followUp(interviewEndedReply());
  await deps.channels.post(interview.threadId, askUidOfPlayerMessage(interview.id, picked.name ?? UNNAMED_MATCH));
}

/** The option value of a pick: the index of the match in the list, as text. Undefined for anything else. */
function pickedIndexOf(values: readonly string[] | undefined): number | undefined {
  const first = values?.[0];
  if (first === undefined || !/^\d+$/.test(first)) return undefined;
  const index = Number(first);
  return Number.isSafeInteger(index) ? index : undefined;
}

/** The card that shows the recommendation or the pick list, as it was posted. */
function shownCard(interview: AwaitingRecommendation | AwaitingPick): Message {
  if (interview.step === "awaiting-recommendation") {
    return recommendationMessage(interview.id, interview.memberId, interview.recommended);
  }
  return pickListMessage(interview.id, interview.memberId, interview.matches);
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
  if (transition.event.kind === "found" && transition.interview.step === "awaiting-confirmation") {
    // The uid of the chosen Player needs no check: the Member is linked at once.
    deps.interviews.save(transition.interview);
    await modal.deferUpdate();
    await confirmOrRefuse(deps, transition.interview);
    return;
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
  if ((await confirmOrRefuse(deps, interview)) === "ended") await button.followUp(interviewEndedReply());
}

/**
 * The Member confirmed the Player shown, or chose its uid: the Link is made, or the confirmation is refused, counted as a
 * failed attempt, when the uid is Linked meanwhile. "ended" when the Interview moved on or the Member already holds the
 * uid: nothing is said then but the ended note.
 */
async function confirmOrRefuse(deps: InterviewDeps, interview: AwaitingConfirmation): Promise<"done" | "ended"> {
  const outcome = await linkConfirmed(deps, interview);
  if (outcome === "refused") return refuseConfirmation(deps, interview, deps.now());
  return outcome;
}

/**
 * Makes the Link of the Player the Member confirmed or chose. "refused" when the uid is Linked to another Member meanwhile:
 * nothing is stored then, and the caller says so. "ended" when the Interview moved on or the Member already holds the uid.
 */
async function linkConfirmed(deps: InterviewDeps, interview: AwaitingConfirmation): Promise<"done" | "ended" | "refused"> {
  const now = deps.now();
  const leaderMemberId = await leaderPing(deps, interview.player);
  const linked = confirm(interview, { kind: "linked" }, now);
  const link = linkFor(interview, now);
  const draft = pendingApprovalFor(link, interview, leaderMemberId, now);
  const outcome = storeLink(deps, linked.interview, draft === undefined ? { link } : { link, rankApproval: draft });
  if (outcome === undefined) return "ended";
  if (outcome.kind === "already-linked") return "refused";
  // The Member already holds this uid: the Interview is done, so it is saved as linked when it still waits.
  if (outcome.kind === "held") {
    deps.interviews.saveIfStep(linked.interview, "awaiting-confirmation");
    return "ended";
  }
  await finishLink(deps, interview, leaderMemberId, link, outcome.rankApproval);
  return "done";
}

/**
 * Stores the Link and the Interview as linked, in one transaction. Undefined when the stored Interview is no longer on
 * expectedStep: then nothing is stored. Shared with /link, which expects a handed-off Interview.
 */
export function storeLinkIfStep(
  deps: Pick<InterviewDeps, "links" | "interviews">,
  linked: OnboardingInterview,
  expectedStep: OnboardingInterview["step"],
  input: { readonly link: Link; readonly rankApproval?: PendingRankApprovalDraft },
): ConfirmOutcome | undefined {
  try {
    return deps.links.confirm(input, () => {
      if (!deps.interviews.saveIfStep(linked, expectedStep)) throw new InterviewMovedOn();
    });
  } catch (error) {
    if (error instanceof InterviewMovedOn) return undefined;
    throw error;
  }
}

function storeLink(
  deps: InterviewDeps,
  linked: OnboardingInterview,
  input: { readonly link: Link; readonly rankApproval?: PendingRankApprovalDraft },
): ConfirmOutcome | undefined {
  return storeLinkIfStep(deps, linked, "awaiting-confirmation", input);
}

/** A Link with an unknown rank waits for a Rank Approval, asked of the leader's Member when present, else the Officers. */
export function pendingApprovalFor(
  link: Link,
  interview: Pick<AwaitingConfirmation, "memberId" | "threadId">,
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
  interview: AwaitingConfirmation,
  now: Date,
): Promise<"done" | "ended"> {
  const refused = confirm(interview, { kind: "already-linked" }, now);
  if (!deps.interviews.saveIfStep(refused.interview, "awaiting-confirmation")) return "ended";
  await announce(deps, refused, interview.player.uid);
  return "done";
}

/**
 * The Link is stored: the Onboarding Role is taken off and the log notes the Link with the leader's Member when present.
 * The Member's name and roles follow, without touching the Link. A pending Rank Approval is asked in the thread, which
 * says the Link is stored; otherwise the thread is deleted.
 */
async function finishLink(
  deps: InterviewDeps,
  interview: AwaitingConfirmation,
  leaderMemberId: MemberId | undefined,
  link: Link,
  rankApproval: RankApproval | undefined,
): Promise<void> {
  const pendingApproval = rankApproval?.state === "pending" ? rankApproval : undefined;
  await deps.onboardingRole.takeOff(interview.memberId);
  if (pendingApproval !== undefined) {
    await deps.channels.post(interview.threadId, linkedMessage(interview.memberId, interview.player));
  }
  await deps.channels.log(linkLogLine(interview.memberId, interview.player, leaderMemberId));
  await nameAndRolesAfterLink(deps, interview.memberId, interview.player, link);
  if (pendingApproval !== undefined) return deps.rankApprovals.announce(pendingApproval, interview.player);
  await deps.channels.deleteThread(interview.threadId);
}

/** Gives the Linked Member their name and roles; a failure is logged, never thrown, so the Link stands. */
async function nameAndRolesAfterLink(deps: InterviewDeps, memberId: MemberId, player: Player, link: Link): Promise<void> {
  try {
    await deps.nameAndRoles.onLinked(memberId, player, link.allianceRank);
  } catch (error) {
    deps.logError(`Giving the name and roles after a Link failed: ${errorText(error)}`);
  }
}

function linkFor(interview: AwaitingConfirmation, now: Date): Link {
  return {
    memberId: interview.memberId,
    uid: interview.player.uid,
    linkedAt: now,
    allianceRank: rankOnLink(interview.player),
    madeBy: { kind: "in-game-proof" },
  };
}

/** The Member of the Alliance's leader, when that Member is Linked and on the server; otherwise nobody is pinged. */
export async function leaderPing(
  deps: Pick<InterviewDeps, "links" | "isOnServer">,
  player: Player,
): Promise<MemberId | undefined> {
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
  // The uid of a pick, found, is the Player the Member chose: it is linked at once, like the Recommended Player.
  if (transition.interview.step === "awaiting-confirmation" && transition.interview.confirmedByChoice === true) {
    await confirmOrRefuse(deps, transition.interview);
    return;
  }
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
      // The log comes first: a thread that is gone must not cost the line.
      await deps.channels.log(handedOffLogLine(interview.memberId, interview.threadId));
      await deps.channels.post(interview.threadId, handedOffMessage(interview.memberId, deps.officerRoles));
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

/** The card without its buttons and select menus, once the Member has pressed one of them. */
function withoutButtons(card: Message): BaseMessageOptions {
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
    interview.step === "recommending" ||
    interview.step === "awaiting-recommendation" ||
    interview.step === "awaiting-pick" ||
    interview.step === "awaiting-uid" ||
    interview.step === "checking" ||
    interview.step === "awaiting-confirmation" ||
    interview.step === "paused-for-quota"
  );
}
