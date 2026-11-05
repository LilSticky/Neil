import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type APIModalInteractionResponseCallbackData, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import type { LookupCaller } from "../game-api/allowance-keeper.js";
import { memberLeft, recommendationFound, timeOut } from "../domain/onboarding-interview.js";
import { parseKingdom, parseUid, type KingdomNumber, type PlayerName, type Uid } from "../domain/lookup-input.js";
import type { Link } from "../domain/link.js";
import type { LookupResult, PickablePlayerMatch, Player } from "../domain/player.js";
import type { MemberId, RankApproval } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { LinkStore } from "../storage/link-store.js";
import { createPreferenceStore } from "../storage/preference-store.js";
import type { OnboardingChannels, ThreadMember } from "./onboarding-channels.js";
import type { RankApprovals, RankButtonLike } from "./rank-approval.js";
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
  interviewCustomId,
  interviewEndedReply,
  interviewOpenedReply,
  linkedMessage,
  linkLogLine,
  malformedUidMessage,
  notFoundMessage,
  pickListMessage,
  quotaSpentMessage,
  rankCancelledLogLine,
  recommendationMessage,
  refusedLogLine,
  rejectedMessage,
  somethingWentWrongReply,
  uidModal,
  unavailableMessage,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";
import { createSweeper } from "./interview-sweeper.js";
import { FakeNameAndRoles } from "./__fakes__/name-and-roles.js";
import { FakeDoctorRole, type DoctorRoleCall } from "./__fakes__/doctor-role.js";
import { FakeOnboardingRole, type OnboardingRoleCall } from "./__fakes__/onboarding-role.js";
import { FakePreferencesAfterLink } from "./__fakes__/preferences-after-link.js";
import { FakePrivateMessages } from "./__fakes__/private-messages.js";
import { FakeUnlink } from "./__fakes__/unlink.js";
import {
  createInterviews,
  type ButtonInteractionLike,
  type CommandLike,
  type InterviewDeps,
  type JoinedMember,
  type ModalInteractionLike,
} from "./interview.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${number.toString()} is not a valid Kingdom`);
  return parsed.value;
}

const NOW = new Date("2026-10-31T10:00:00Z");
const TIMEOUT_MS = 1440 * 60 * 1000;
const OFFICERS: OfficerRoles = { moderatorRoleId: "333333333333333333", kingRoleId: "444444444444444444" };

const MEMBER: MemberId = "111111111111111111";
const OTHER: MemberId = "222222222222222222";
const LEADER: MemberId = "777777777777777777";
const THREAD = "666666666666666666";
const RACING_THREAD = "888888888888888888";
const UID_DIGITS = "145563254785";
const UID = uidOf(UID_DIGITS);
const LEADER_UID = uidOf("145563254700");
const OTHER_UID_DIGITS = "145563254786";
const OTHER_UID = uidOf(OTHER_UID_DIGITS);
/** The server display name of the Member in the spec's example: cleaned, it is the Player Name drlol. */
const DRLOL_DISPLAY_NAME = "[NML] drlol | #331";

const PLAYER: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  might: 15_902_728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: undefined },
  allianceRank: "R4",
};

const PLAYER_WITH_LEADER: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  might: 15_902_728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: LEADER_UID },
  allianceRank: "R4",
};

const PLAYER_WITH_LEADER_UNKNOWN_RANK: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  might: 15_902_728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: LEADER_UID },
  allianceRank: "unknown",
};

const PLAYER_WITHOUT_ALLIANCE: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  might: 15_902_728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

/** The Player that OTHER_UID belongs to: a different uid, the same Player Name. */
const PLAYER_OTHER_UID: Player = {
  uid: OTHER_UID,
  name: "Vex",
  kingdom: kingdomOf(12),
  might: 1_000,
  sanctuaryLevel: 3,
  alliance: undefined,
  allianceRank: undefined,
};

/** Two matches of the name Vex and Vexy; the pick list shows them by Kingdom, so Vex (Kingdom 12) comes first. */
const MATCH_VEX_KINGDOM_12: PickablePlayerMatch = { uid: OTHER_UID_DIGITS, name: "Vex", kingdom: 12 };
const MATCH_VEXY_KINGDOM_330: PickablePlayerMatch = { uid: UID_DIGITS, name: "Vexy", kingdom: 330 };
const PICK_LIST: readonly PickablePlayerMatch[] = [MATCH_VEX_KINGDOM_12, MATCH_VEXY_KINGDOM_330];

const LEADER_LINK: Link = {
  memberId: LEADER,
  uid: LEADER_UID,
  linkedAt: NOW,
  allianceRank: { source: "no-alliance" },
  madeBy: { kind: "in-game-proof" },
};

/** A promise whose resolve function the test calls later. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value: T) => {
      settle?.(value);
    },
  };
}

/** The Game API as the Interview uses it: records each lookup and answers with the next prepared result. */
class FakeGameApi {
  /** Uid lookups (getPlayer), the Interview's uid checks. */
  readonly lookups: { readonly uid: Uid; readonly purpose: RequestPurpose }[] = [];
  /** Player Name lookups (findPlayer), the Interview's Recommended Player. */
  readonly nameLookups: {
    readonly name: PlayerName;
    readonly kingdom: KingdomNumber | undefined;
    readonly purpose: RequestPurpose;
  }[] = [];
  private answer: Promise<LookupResult<Player>> = Promise.resolve({ kind: "not-found" });
  private nameAnswer: LookupResult<Player> = { kind: "not-found" };
  private failure: Error | undefined = undefined;
  private nameFailure: Error | undefined = undefined;

  answerWith(result: LookupResult<Player>): void {
    this.answer = Promise.resolve(result);
  }

  /** Every name lookup from now on answers with this result. */
  answerNameWith(result: LookupResult<Player>): void {
    this.nameAnswer = result;
  }

  /** Every lookup from now on fails with this error, as a dropped connection would. */
  failWith(error: Error): void {
    this.failure = error;
  }

  /** Every name lookup from now on fails with this error. */
  failNamesWith(error: Error): void {
    this.nameFailure = error;
  }

  /** The next lookup waits until the returned function is called. */
  holdNextAnswer(): (result: LookupResult<Player>) => void {
    const held = deferred<LookupResult<Player>>();
    this.answer = held.promise;
    return held.resolve;
  }

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.lookups.push({ uid, purpose });
    if (this.failure !== undefined) return Promise.reject(this.failure);
    return this.answer;
  }

  findPlayer(
    name: PlayerName,
    kingdom: KingdomNumber | undefined,
    purpose: RequestPurpose,
  ): Promise<LookupResult<Player>> {
    this.nameLookups.push({ name, kingdom, purpose });
    if (this.nameFailure !== undefined) return Promise.reject(this.nameFailure);
    return Promise.resolve(this.nameAnswer);
  }

  /** Each charged view asked for; the Interview never charges a Member, so the list must stay empty. */
  readonly charges: LookupCaller[] = [];

  chargedTo(caller: LookupCaller): never {
    this.charges.push(caller);
    throw new Error("the onboarding interview must not charge a Member");
  }
}

/** The onboarding channels as the Interview uses them: records every thread and log call. */
class FakeChannels implements OnboardingChannels {
  readonly opened: ThreadMember[] = [];
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly deleted: string[] = [];
  readonly logs: BaseMessageOptions[] = [];
  /** Runs when a thread is about to open: a test uses it to let a racing Interview land first. */
  beforeOpen: () => void = () => undefined;
  /** When set, Discord refuses to open a thread. */
  refuseOpen = false;
  /** When set, Discord refuses every message posted to a thread (the thread is gone, say). */
  refusePosts = false;
  /** When set, Discord refuses to delete a thread. */
  refuseDeletes = false;
  private posted = 0;

  openThread(member: ThreadMember): Promise<string> {
    this.beforeOpen();
    if (this.refuseOpen) return Promise.reject(new Error("Discord refused to open the thread"));
    this.opened.push(member);
    return Promise.resolve(THREAD);
  }

  deleteThread(threadId: string): Promise<void> {
    if (this.refuseDeletes) return Promise.reject(new Error(`Discord refused to delete ${threadId}`));
    this.deleted.push(threadId);
    return Promise.resolve();
  }

  post(threadId: string, message: BaseMessageOptions): Promise<string> {
    if (this.refusePosts) return Promise.reject(new Error(`Discord refused the post to ${threadId}`));
    this.posts.push({ threadId, message });
    this.posted += 1;
    return Promise.resolve(`message-${this.posted.toString()}`);
  }

  edit(): Promise<void> {
    return Promise.resolve();
  }

  addToThread(): Promise<void> {
    return Promise.resolve();
  }


  log(message: BaseMessageOptions): Promise<void> {
    this.logs.push(message);
    return Promise.resolve();
  }
}

/** A button press that records its private replies, modals and updates to the pressed message. */
/**
 * A button press that, like discord.js, accepts exactly one first answer (reply, showModal or update); afterwards only
 * followUp works. Private replies and follow-ups both land in `replies`.
 */
class FakeButton implements ButtonInteractionLike {
  readonly replies: PrivateReply[] = [];
  readonly modals: APIModalInteractionResponseCallbackData[] = [];
  readonly updates: BaseMessageOptions[] = [];
  protected answered = false;

  constructor(
    readonly customId: string,
    readonly user: { readonly id: string },
  ) {}

  reply(message: PrivateReply): Promise<void> {
    this.answerFirst();
    this.replies.push(message);
    return Promise.resolve();
  }

  followUp(message: PrivateReply): Promise<void> {
    if (!this.answered) throw new Error("followUp before the interaction was answered");
    this.replies.push(message);
    return Promise.resolve();
  }

  showModal(modal: APIModalInteractionResponseCallbackData): Promise<void> {
    this.answerFirst();
    this.modals.push(modal);
    return Promise.resolve();
  }

  update(options: BaseMessageOptions): Promise<void> {
    this.answerFirst();
    this.updates.push(options);
    return Promise.resolve();
  }

  protected answerFirst(): void {
    if (this.answered) throw new Error("The interaction has already been answered");
    this.answered = true;
  }
}

/** A string select menu press of the pick list: a button press that also carries the value the Member picked. */
class FakeSelect extends FakeButton {
  constructor(
    customId: string,
    user: { readonly id: string },
    readonly values: readonly string[],
  ) {
    super(customId, user);
  }
}

/** A button press whose update waits until the test releases it, so the press can be overtaken while in flight. */
class HeldButton extends FakeButton {
  private readonly gate = deferred<undefined>();

  release(): void {
    this.gate.resolve(undefined);
  }

  override update(options: BaseMessageOptions): Promise<void> {
    this.answerFirst();
    this.updates.push(options);
    return this.gate.promise;
  }
}

/** An Interview store whose reads fail, as an unreadable database would. */
class UnreadableInterviewStore extends InterviewStore {
  override get(): never {
    throw new Error("the database is unreadable");
  }
}

/** A modal submit with one uid text input. */
class FakeModal implements ModalInteractionLike {
  readonly replies: PrivateReply[] = [];
  deferUpdates = 0;
  readonly fields: { getTextInputValue(id: string): string };

  constructor(
    readonly customId: string,
    readonly user: { readonly id: string },
    typedUid: string,
  ) {
    this.fields = { getTextInputValue: (id: string) => (id === "uid" ? typedUid : "") };
  }

  reply(message: PrivateReply): Promise<void> {
    this.replies.push(message);
    return Promise.resolve();
  }

  deferUpdate(): Promise<void> {
    this.deferUpdates += 1;
    return Promise.resolve();
  }
}

/**
 * A /interview command as the Interview needs it: the Member who ran it. Like discord.js, it is deferred first, then
 * answered once with editReply. `calls` keeps the order of those answers; a test may add its own steps to it.
 */
class FakeCommand implements CommandLike {
  readonly replies: PrivateReply[] = [];
  readonly deferrals: { readonly flags: MessageFlags.Ephemeral }[] = [];
  readonly calls: string[] = [];

  constructor(
    readonly user: { readonly id: string; readonly username: string },
    readonly displayName: string = user.username,
  ) {}

  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<void> {
    this.calls.push("deferReply");
    this.deferrals.push(options);
    return Promise.resolve();
  }

  editReply(message: PrivateReply): Promise<void> {
    this.calls.push("editReply");
    this.replies.push(message);
    return Promise.resolve();
  }
}

/** The Rank Approvals as the Interview uses them: records every approval it asks about, with the Player shown. */
class FakeRankApprovals implements RankApprovals {
  readonly announced: { readonly approval: RankApproval; readonly player: Player }[] = [];
  readonly presses: RankButtonLike[] = [];

  announce(approval: Extract<RankApproval, { readonly state: "pending" }>, player: Player): Promise<void> {
    this.announced.push({ approval, player });
    return Promise.resolve();
  }

  onButton(button: RankButtonLike): Promise<void> {
    this.presses.push(button);
    return Promise.resolve();
  }
}

interface Harness {
  readonly interviews: InterviewStore;
  readonly links: LinkStore;
  readonly channels: FakeChannels;
  readonly gameApi: FakeGameApi;
  readonly rankApprovals: FakeRankApprovals;
  readonly nameAndRoles: FakeNameAndRoles;
  readonly unlink: FakeUnlink;
  readonly onboardingRole: FakeOnboardingRole;
  readonly doctorRole: FakeDoctorRole;
  readonly preferences: FakePreferencesAfterLink;
  readonly privateMessages: FakePrivateMessages;
  readonly onServer: Set<MemberId>;
  readonly errors: string[];
  readonly service: ReturnType<typeof createInterviews>;
  readonly deps: InterviewDeps;
}

/** The Interview id of a Member's open Interview, read from the real store. */
function openInterviewIdOf(h: Harness, memberId: MemberId): number {
  const open = h.interviews.openFor(memberId);
  if (open === undefined) throw new Error(`the test Member ${memberId} has no open Interview`);
  return open.id;
}

/** The Member joins: the Interview opens and asks for the uid. Returns the Interview id. */
async function joinedMember(h: Harness, memberId: MemberId = MEMBER, displayName = "vex_fan"): Promise<number> {
  await h.service.onMemberJoined({ id: memberId, username: "vex_fan", displayName, bot: false });
  return openInterviewIdOf(h, memberId);
}

/** The Member joins with a display name that cleans to the Player Name drlol, and the name lookup finds one Player. */
async function recommendedMemberJoined(h: Harness, player: Player): Promise<number> {
  h.gameApi.answerNameWith({ kind: "found", value: player, fetchedAt: NOW });
  return joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);
}

/** The Member has pressed "That's me" on the one Recommended Player; the uid is asked for. Returns the Interview id. */
async function recommendationAccepted(h: Harness, player: Player = PLAYER): Promise<number> {
  const interviewId = await recommendedMemberJoined(h, player);
  await h.service.onButton(new FakeButton(interviewCustomId("accept", interviewId), { id: MEMBER }));
  return interviewId;
}

/** The Member has picked the match at index 1 (Vexy, Kingdom 330) from the pick list. Returns the Interview id. */
async function matchPicked(h: Harness, index = "1"): Promise<number> {
  h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
  const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);
  await h.service.onButton(new FakeSelect(interviewCustomId("pick", interviewId), { id: MEMBER }, [index]));
  return interviewId;
}

/** The Member submits a uid in the modal of the Interview. */
async function submitUid(h: Harness, interviewId: number, typedUid: string, memberId: MemberId = MEMBER): Promise<void> {
  await h.service.onModalSubmit(new FakeModal(interviewCustomId("modal", interviewId), { id: memberId }, typedUid));
}

/** The Member submits the uid UID_DIGITS the given number of times, each time refused by the Game API. */
async function failUidTimes(h: Harness, interviewId: number, times: number): Promise<void> {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await submitUid(h, interviewId, UID_DIGITS);
  }
}

/** The Member's Interview is waiting for them to confirm the Player shown. Returns the Interview id. */
async function confirmationShown(h: Harness, player: Player): Promise<number> {
  const interviewId = await joinedMember(h);
  h.gameApi.answerWith({ kind: "found", value: player, fetchedAt: NOW });
  await submitUid(h, interviewId, UID_DIGITS);
  return interviewId;
}

function linkOfMember(h: Harness): Link | undefined {
  return h.links.linkFor(MEMBER);
}

/** The Member is Linked to a Player with an unknown rank and the Rank Approval for it is pending. Returns that approval. */
async function pendingRankApprovalOfMember(h: Harness): Promise<RankApproval> {
  h.links.confirm({ link: LEADER_LINK }, () => undefined);
  h.onServer.add(LEADER);
  const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER_UNKNOWN_RANK);
  await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));
  const approval = h.links.pendingFor(MEMBER);
  if (approval === undefined) throw new Error("the test Member has no pending Rank Approval");
  return approval;
}

describe("createInterviews", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let h: Harness;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-interview-handler-"));
    db = openDatabase(dataDir);
    const interviews = new InterviewStore(db, TIMEOUT_MS);
    const links = new LinkStore(db);
    const channels = new FakeChannels();
    const gameApi = new FakeGameApi();
    const rankApprovals = new FakeRankApprovals();
    const trace: string[] = [];
    const nameAndRoles = new FakeNameAndRoles(trace);
    const unlink = new FakeUnlink(links);
    const onboardingRole = new FakeOnboardingRole();
    const doctorRole = new FakeDoctorRole();
    const preferences = new FakePreferencesAfterLink(trace);
    const privateMessages = new FakePrivateMessages();
    const onServer = new Set<MemberId>();
    const errors: string[] = [];
    const deps: InterviewDeps = {
      interviews,
      links,
      channels,
      gameApi,
      rankApprovals,
      nameAndRoles,
      unlink,
      onboardingRole,
      doctorRole,
      preferences,
      sendPrivateMessage: (memberId: MemberId, message: BaseMessageOptions) => privateMessages.send(memberId, message),
      officerRoles: OFFICERS,
      isOnServer: (memberId: MemberId) => Promise.resolve(onServer.has(memberId)),
      now: () => NOW,
      logError: (line: string) => {
        errors.push(line);
      },
    };
    const service = createInterviews(deps);
    h = {
      interviews,
      links,
      channels,
      gameApi,
      rankApprovals,
      nameAndRoles,
      unlink,
      onboardingRole,
      doctorRole,
      preferences,
      privateMessages,
      onServer,
      errors,
      service,
      deps,
    };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("when a Member joins", () => {
    test("ignores a bot account", async () => {
      await h.service.onMemberJoined({ id: MEMBER, username: "neil_bot", displayName: "neil_bot", bot: true });

      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("ignores a Member who is already Linked", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.channels.opened).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("gives the Doctor Role to a Member who rejoins with a stored Link, with no Onboarding Role and no Interview", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.doctorRole.calls).toEqual([{ kind: "give", memberId: MEMBER }]);
      expect(h.onboardingRole.calls).toEqual([]);
      expect(h.channels.opened).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("ignores a Member who has an open Interview", async () => {
      h.interviews.create({ memberId: MEMBER, threadId: THREAD }, NOW);

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
    });

    test("opens the Interview thread and asks for the uid in it", async () => {
      const interviewId = await joinedMember(h);

      expect(h.channels.opened).toEqual([{ id: MEMBER, username: "vex_fan" }]);
      expect(h.interviews.openFor(MEMBER)?.threadId).toBe(THREAD);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
    });

    test("gives the Onboarding Role to a Member without a Link before the thread opens", async () => {
      let givenWhenThreadOpens: readonly OnboardingRoleCall[] = [];
      h.channels.beforeOpen = () => {
        givenWhenThreadOpens = [...h.onboardingRole.calls];
      };

      await joinedMember(h);

      expect(givenWhenThreadOpens).toEqual([{ kind: "give", memberId: MEMBER }]);
    });

    test("gives nothing to a bot account", async () => {
      await h.service.onMemberJoined({ id: MEMBER, username: "neil_bot", displayName: "neil_bot", bot: true });

      expect(h.onboardingRole.calls).toEqual([]);
    });

    test("gives nothing to a Member who is already Linked", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.onboardingRole.calls).toEqual([]);
    });
  });

  describe("when a Member comes online (onMemberOnline)", () => {
    test("gives the Onboarding Role to an unlinked Member with no Interview, and opens their Interview", async () => {
      await h.service.onMemberOnline({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.onboardingRole.calls).toEqual([{ kind: "give", memberId: MEMBER }]);
      expect(h.channels.opened).toEqual([{ id: MEMBER, username: "vex_fan" }]);
      expect(h.interviews.openFor(MEMBER)?.threadId).toBe(THREAD);
      expect(h.channels.posts).toEqual([
        { threadId: THREAD, message: askUidMessage(openInterviewIdOf(h, MEMBER), MEMBER) },
      ]);
    });

    test("starts nothing for a bot account", async () => {
      await h.service.onMemberOnline({ id: MEMBER, username: "neil_bot", displayName: "neil_bot", bot: true });

      expect(h.onboardingRole.calls).toEqual([]);
      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("starts nothing for a Linked Member, and gives them no Doctor Role either", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);

      await h.service.onMemberOnline({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.onboardingRole.calls).toEqual([]);
      expect(h.doctorRole.calls).toEqual([]);
      expect(h.channels.opened).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("starts nothing for a Member who has an open Interview", async () => {
      h.interviews.create({ memberId: MEMBER, threadId: THREAD }, NOW);

      await h.service.onMemberOnline({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.onboardingRole.calls).toEqual([]);
      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
    });

    test("starts nothing for a Member whose latest Interview was handed off", async () => {
      const handedOffId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });
      await failUidTimes(h, handedOffId, 5);
      const threadsBefore = h.channels.opened.length;
      const postsBefore = h.channels.posts.length;
      const roleCallsBefore = h.onboardingRole.calls.length;

      await h.service.onMemberOnline({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.interviews.latestFor(MEMBER)).toMatchObject({ id: handedOffId, step: "handed-off" });
      expect(h.channels.opened).toHaveLength(threadsBefore);
      expect(h.channels.posts).toHaveLength(postsBefore);
      expect(h.onboardingRole.calls).toHaveLength(roleCallsBefore);
    });

    test("starts a new Interview for a Member whose latest Interview was abandoned, as left", async () => {
      const abandonedId = await joinedMember(h);
      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });
      expect(h.interviews.get(abandonedId)).toMatchObject({ step: "abandoned", reason: "left" });

      await h.service.onMemberOnline({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      const newId = openInterviewIdOf(h, MEMBER);
      expect(newId).not.toBe(abandonedId);
      expect(h.channels.opened).toHaveLength(2);
    });

    test("opens one thread when two calls for the same Member run at once", async () => {
      const member = { id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false };

      await Promise.all([h.service.onMemberOnline(member), h.service.onMemberOnline(member)]);

      expect(h.channels.opened).toHaveLength(1);
      expect(h.channels.deleted).toEqual([]);
      expect(h.channels.posts).toHaveLength(1);
      expect(h.interviews.openFor(MEMBER)?.threadId).toBe(THREAD);
    });

    test("logs a thread that cannot be opened, without throwing, and tries again on the next call", async () => {
      h.channels.refuseOpen = true;

      await expect(
        h.service.onMemberOnline({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false }),
      ).resolves.toBeUndefined();

      expect(h.errors).toEqual([expect.stringContaining("Discord refused to open the thread")]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();

      h.channels.refuseOpen = false;
      await h.service.onMemberOnline({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.interviews.openFor(MEMBER)?.threadId).toBe(THREAD);
    });
  });

  describe("when Neil starts with the Members it sees online (onlineAtStartup)", () => {
    const UNLINKED: JoinedMember = { id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false };
    const SECOND_UNLINKED: JoinedMember = { id: OTHER, username: "second_fan", displayName: "second_fan", bot: false };
    const BOT: JoinedMember = { id: "121212121212121212", username: "neil_bot", displayName: "neil_bot", bot: true };
    const LINKED: JoinedMember = { id: "555555555555555555", username: "linked_fan", displayName: "linked_fan", bot: false };
    const WITH_OPEN_INTERVIEW: JoinedMember = { id: "999999999999999999", username: "busy_fan", displayName: "busy_fan", bot: false };

    /** Unlinked Members, each with an id of their own: the first count of them. */
    function unlinkedMembers(count: number): JoinedMember[] {
      return Array.from({ length: count }, (_, index) => {
        const name = `fan_${index.toString()}`;
        return { id: `40000000000000${index.toString().padStart(4, "0")}`, username: name, displayName: name, bot: false };
      });
    }

    /** Holds every thread opening until release is called, and records the Members whose opening has started. */
    function holdThreadOpenings(): { readonly opening: string[]; release(): void } {
      const opening: string[] = [];
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = () => {
          resolve();
        };
      });
      const openThread = h.channels.openThread.bind(h.channels);
      h.channels.openThread = async (member) => {
        opening.push(member.id);
        await gate;
        return openThread(member);
      };
      return { opening, release: () => { release(); } };
    }

    test("opens the Interview of one Member only after the one before has been opened", async () => {
      const threads = holdThreadOpenings();

      const running = h.service.onlineAtStartup([UNLINKED, SECOND_UNLINKED]);
      await vi.waitFor(() => {
        expect(threads.opening).toEqual([MEMBER]);
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      expect(threads.opening).toEqual([MEMBER]);

      threads.release();
      await running;
      expect(threads.opening).toEqual([MEMBER, OTHER]);
      expect(h.channels.opened.map((member) => member.id)).toEqual([MEMBER, OTHER]);
    });

    test("skips a bot, a Linked Member and a Member with an open Interview, and starts the other Members", async () => {
      h.links.confirm({ link: { memberId: LINKED.id, uid: OTHER_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      h.interviews.create({ memberId: WITH_OPEN_INTERVIEW.id, threadId: "131313131313131313" }, NOW);

      await h.service.onlineAtStartup([BOT, LINKED, WITH_OPEN_INTERVIEW, UNLINKED]);

      expect(h.channels.opened.map((member) => member.id)).toEqual([MEMBER]);
      expect(h.onboardingRole.calls).toEqual([{ kind: "give", memberId: MEMBER }]);
      expect(h.channels.logs.map((line) => line.content)).toEqual(["Onboarding Interviews at startup: started 1, failed 0, left for later 0."]);
    });

    test("does not start the Interview of a Member whose latest Interview was handed off", async () => {
      const handedOffId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });
      await failUidTimes(h, handedOffId, 5);
      const threadsBefore = h.channels.opened.length;

      await h.service.onlineAtStartup([UNLINKED]);

      expect(h.interviews.latestFor(MEMBER)).toMatchObject({ id: handedOffId, step: "handed-off" });
      expect(h.channels.opened).toHaveLength(threadsBefore);
    });

    test("logs one line counting the Interviews started, when some were started", async () => {
      await h.service.onlineAtStartup([UNLINKED, SECOND_UNLINKED]);

      expect(h.channels.logs.map((line) => line.content)).toEqual(["Onboarding Interviews at startup: started 2, failed 0, left for later 0."]);
    });

    test("logs one line counting the failures, when none was started", async () => {
      h.channels.refuseOpen = true;

      await h.service.onlineAtStartup([UNLINKED]);

      expect(h.channels.logs.map((line) => line.content)).toEqual(["Onboarding Interviews at startup: started 0, failed 1, left for later 0."]);
    });

    test("logs a Member whose Interview fails, then starts the next Member's Interview", async () => {
      const openThread = h.channels.openThread.bind(h.channels);
      h.channels.openThread = (member) =>
        member.id === MEMBER ? Promise.reject(new Error("Discord refused to open the thread")) : openThread(member);

      await expect(h.service.onlineAtStartup([UNLINKED, SECOND_UNLINKED])).resolves.toBeUndefined();

      expect(h.errors).toEqual([expect.stringContaining("Discord refused to open the thread")]);
      expect(h.channels.opened.map((member) => member.id)).toEqual([OTHER]);
      expect(h.channels.logs.map((line) => line.content)).toEqual(["Onboarding Interviews at startup: started 1, failed 1, left for later 0."]);
    });

    test("logs nothing when no Interview was started or failed", async () => {
      await h.service.onlineAtStartup([BOT]);

      expect(h.channels.logs).toEqual([]);
      expect(h.errors).toEqual([]);
    });

    test("logs a refused log line as an error, and does not throw", async () => {
      h.channels.log = () => Promise.reject(new Error("Discord refused the log line"));

      await expect(h.service.onlineAtStartup([UNLINKED])).resolves.toBeUndefined();

      expect(h.errors).toEqual([expect.stringContaining("Discord refused the log line")]);
    });

    test("the error line for an Interview that fails at startup does not mention being online or startup", async () => {
      h.channels.refuseOpen = true;

      await h.service.onlineAtStartup([UNLINKED]);

      expect(h.errors).toEqual([expect.stringContaining("Discord refused to open the thread")]);
      expect(h.errors.join("\n")).not.toMatch(/online|startup/i);
    });

    test("a Member who joins while their Interview is being started at startup gets one thread", async () => {
      const threads = holdThreadOpenings();
      const running = h.service.onlineAtStartup([UNLINKED]);
      await vi.waitFor(() => {
        expect(threads.opening).toEqual([MEMBER]);
      });

      const joining = h.service.onMemberJoined(UNLINKED);
      threads.release();
      await Promise.all([running, joining]);

      expect(h.channels.opened).toHaveLength(1);
      expect(h.channels.deleted).toEqual([]);
    });

    test("a Member who runs /interview while their Interview is being started at startup gets one thread", async () => {
      const threads = holdThreadOpenings();
      const running = h.service.onlineAtStartup([UNLINKED]);
      await vi.waitFor(() => {
        expect(threads.opening).toEqual([MEMBER]);
      });

      const answering = h.service.onCommand(new FakeCommand({ id: MEMBER, username: "vex_fan" }));
      threads.release();
      await Promise.all([running, answering]);

      expect(h.channels.opened).toHaveLength(1);
      expect(h.channels.deleted).toEqual([]);
    });

    test("a Member whose Interview is being opened by a join is not started again by the startup check", async () => {
      const threads = holdThreadOpenings();
      const joining = h.service.onMemberJoined(UNLINKED);
      await vi.waitFor(() => {
        expect(threads.opening).toEqual([MEMBER]);
      });

      const running = h.service.onlineAtStartup([UNLINKED]);
      threads.release();
      await Promise.all([joining, running]);

      expect(h.channels.opened).toHaveLength(1);
      expect(h.channels.deleted).toEqual([]);
    });

    test("a Member whose Interview is being opened by /interview is not started again by the startup check", async () => {
      const threads = holdThreadOpenings();
      const answering = h.service.onCommand(new FakeCommand({ id: MEMBER, username: "vex_fan" }));
      await vi.waitFor(() => {
        expect(threads.opening).toEqual([MEMBER]);
      });

      const running = h.service.onlineAtStartup([UNLINKED]);
      threads.release();
      await Promise.all([answering, running]);

      expect(h.channels.opened).toHaveLength(1);
      expect(h.channels.deleted).toEqual([]);
    });

    test("starts at most 10 Interviews at startup, and leaves the Members after the tenth for later without starting them", async () => {
      const members = unlinkedMembers(12);

      await h.service.onlineAtStartup(members);

      expect(h.channels.opened.map((member) => member.id)).toEqual(members.slice(0, 10).map((member) => member.id));
      expect(h.onboardingRole.calls).toHaveLength(10);
      expect(h.channels.logs.map((line) => line.content)).toEqual([
        "Onboarding Interviews at startup: started 10, failed 0, left for later 2.",
      ]);
    });

    test("counts a failed start against the 10, so the Members after the tenth are left for later", async () => {
      const members = unlinkedMembers(12);
      const failing = members.slice(0, 2).map((member) => member.id);
      const openThread = h.channels.openThread.bind(h.channels);
      h.channels.openThread = (member) =>
        failing.includes(member.id) ? Promise.reject(new Error("Discord refused to open the thread")) : openThread(member);

      await h.service.onlineAtStartup(members);

      expect(h.channels.opened.map((member) => member.id)).toEqual(members.slice(2, 10).map((member) => member.id));
      expect(h.channels.logs.map((line) => line.content)).toEqual([
        "Onboarding Interviews at startup: started 8, failed 2, left for later 2.",
      ]);
    });

    test("counts as left for later only the Members who want an Interview by the same rule, not bots or Linked Members", async () => {
      h.links.confirm({ link: { memberId: LINKED.id, uid: OTHER_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      const firstTen = unlinkedMembers(10);
      const eleventh = unlinkedMembers(11).slice(10);

      await h.service.onlineAtStartup([...firstTen, BOT, LINKED, ...eleventh]);

      expect(h.channels.opened.map((member) => member.id)).toEqual(firstTen.map((member) => member.id));
      expect(h.channels.logs.map((line) => line.content)).toEqual([
        "Onboarding Interviews at startup: started 10, failed 0, left for later 1.",
      ]);
    });

    test("a Member who could not be read counts as failed, also past the 10", async () => {
      await h.service.onlineAtStartup([...unlinkedMembers(10), { id: LINKED.id, unreadable: true }]);

      expect(h.channels.logs.map((line) => line.content)).toEqual([
        "Onboarding Interviews at startup: started 10, failed 1, left for later 0.",
      ]);
    });

    test("stops before the next Member when the stop check says so, and starts no Interview after it", async () => {
      await h.service.onlineAtStartup(unlinkedMembers(3), () => h.channels.opened.length >= 1);

      expect(h.channels.opened).toHaveLength(1);
    });
  });

  describe("when the Member's Interview opens while their thread is being created", () => {
    test("deletes the thread just created, asks nothing in it, and keeps the Interview that won", async () => {
      h.channels.beforeOpen = () => {
        h.interviews.create({ memberId: MEMBER, threadId: RACING_THREAD }, NOW);
      };

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.channels.deleted).toEqual([THREAD]);
      expect(h.channels.posts).toEqual([]);
      expect(h.interviews.openFor(MEMBER)?.threadId).toBe(RACING_THREAD);
    });
  });

  describe("the Give my uid button", () => {
    test("opens the uid modal for the Interview", async () => {
      const interviewId = await joinedMember(h);
      const button = new FakeButton(interviewCustomId("uid", interviewId), { id: MEMBER });

      await h.service.onButton(button);

      expect(button.modals).toEqual([uidModal(interviewId)]);
    });

    test("tells someone else that the Interview belongs to another Member", async () => {
      const interviewId = await joinedMember(h);
      const before = h.interviews.get(interviewId);
      const button = new FakeButton(interviewCustomId("uid", interviewId), { id: OTHER });

      await h.service.onButton(button);

      expect(button.replies).toEqual([buttonOfSomeoneElseReply()]);
      expect(button.modals).toEqual([]);
      expect(h.interviews.get(interviewId)).toEqual(before);
      expect(h.gameApi.lookups).toEqual([]);
    });

    test("tells the Member that the Interview has ended", async () => {
      const interviewId = await joinedMember(h);
      const open = h.interviews.get(interviewId);
      if (open === undefined) throw new Error("the test Interview is missing");
      h.interviews.save(memberLeft(open, NOW).interview);
      const button = new FakeButton(interviewCustomId("uid", interviewId), { id: MEMBER });

      await h.service.onButton(button);

      expect(button.replies).toEqual([interviewEndedReply()]);
      expect(button.modals).toEqual([]);
    });
  });

  describe("the uid modal", () => {
    test("asks again without a lookup when the typed uid is malformed", async () => {
      const interviewId = await joinedMember(h);

      await submitUid(h, interviewId, "abc");

      expect(h.gameApi.lookups).toEqual([]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: malformedUidMessage(interviewId) });
    });

    test("looks the uid up once for the onboarding interview and posts the found card", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "found", value: PLAYER, fetchedAt: NOW });

      await submitUid(h, interviewId, UID_DIGITS);

      expect(h.gameApi.lookups).toEqual([{ uid: UID, purpose: "onboarding-interview" }]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: foundCardMessage(interviewId, PLAYER) });
    });

    test("looks the uid up uncharged, so no Member's Daily Allowance is used", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "found", value: PLAYER, fetchedAt: NOW });

      await submitUid(h, interviewId, UID_DIGITS);

      expect(h.gameApi.lookups).toEqual([{ uid: UID, purpose: "onboarding-interview" }]);
      expect(h.gameApi.charges).toEqual([]);
    });

    test("answers privately while a second submit is still being checked", async () => {
      const interviewId = await joinedMember(h);
      const answer = h.gameApi.holdNextAnswer();
      const first = submitUid(h, interviewId, UID_DIGITS);
      await vi.waitFor(() => {
        expect(h.gameApi.lookups).toHaveLength(1);
      });
      const second = new FakeModal(interviewCustomId("modal", interviewId), { id: MEMBER }, UID_DIGITS);

      await h.service.onModalSubmit(second);

      expect(second.replies).toEqual([checkingReply()]);
      expect(h.gameApi.lookups).toHaveLength(1);
      answer({ kind: "found", value: PLAYER, fetchedAt: NOW });
      await first;
    });
  });

  describe("That's me", () => {
    test("links the Member to the Player shown", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(linkOfMember(h)).toEqual({
        memberId: MEMBER,
        uid: UID,
        linkedAt: NOW,
        allianceRank: { source: "game-api", rank: "R4" },
        madeBy: { kind: "in-game-proof" },
      });
    });

    test("removes the buttons from the card", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const button = new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER });

      await h.service.onButton(button);

      expect(button.updates).toHaveLength(1);
      expect(button.updates[0]?.components).toEqual([]);
    });

    test("keeps the thread open for the Preferences message when no Rank Approval is pending", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.channels.posts).not.toContainEqual({ threadId: THREAD, message: linkedMessage(MEMBER, PLAYER) });
      expect(h.channels.deleted).toEqual([]);
    });

    test("takes the Onboarding Role off the Member once the Link is stored", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.onboardingRole.calls).toEqual([
        { kind: "give", memberId: MEMBER },
        { kind: "takeOff", memberId: MEMBER },
      ]);
    });

    test("takes the Onboarding Role off the Member with a pending Rank Approval too", async () => {
      await pendingRankApprovalOfMember(h);

      expect(h.onboardingRole.calls).toEqual([
        { kind: "give", memberId: MEMBER },
        { kind: "takeOff", memberId: MEMBER },
      ]);
    });

    test("gives the Doctor Role to the Member once the Link is stored", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.doctorRole.calls).toEqual([{ kind: "give", memberId: MEMBER }]);
    });

    test("gives the Doctor Role before the Onboarding Role is taken off, so the Member is never in neither role", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      let doctorCallsAtTakeOff: readonly DoctorRoleCall[] = [];
      h.onboardingRole.onCall = (call: OnboardingRoleCall) => {
        if (call.kind === "takeOff") doctorCallsAtTakeOff = [...h.doctorRole.calls];
      };

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(doctorCallsAtTakeOff).toEqual([{ kind: "give", memberId: MEMBER }]);
    });

    test("gives the Doctor Role before the Onboarding Role is taken off, also with a pending Rank Approval", async () => {
      let doctorCallsAtTakeOff: readonly DoctorRoleCall[] = [];
      h.onboardingRole.onCall = (call: OnboardingRoleCall) => {
        if (call.kind === "takeOff") doctorCallsAtTakeOff = [...h.doctorRole.calls];
      };

      await pendingRankApprovalOfMember(h);

      expect(doctorCallsAtTakeOff).toEqual([{ kind: "give", memberId: MEMBER }]);
    });

    test("logs the Link and pings the leader's Member when that Member is Linked and on the server", async () => {
      h.links.confirm({ link: LEADER_LINK }, () => undefined);
      h.onServer.add(LEADER);
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.channels.logs).toEqual([linkLogLine(MEMBER, PLAYER_WITH_LEADER, LEADER)]);
    });

    test("logs the Link without a ping when the leader's Member is Linked but not on the server", async () => {
      h.links.confirm({ link: LEADER_LINK }, () => undefined);
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.channels.logs).toEqual([linkLogLine(MEMBER, PLAYER_WITH_LEADER, undefined)]);
    });

    test("logs the Link without a ping when the leader has no Link", async () => {
      h.onServer.add(LEADER);
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.channels.logs).toEqual([linkLogLine(MEMBER, PLAYER_WITH_LEADER, undefined)]);
    });

    test("links a Player in no Alliance without a Rank Approval", async () => {
      const interviewId = await confirmationShown(h, PLAYER_WITHOUT_ALLIANCE);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(linkOfMember(h)?.allianceRank).toEqual({ source: "no-alliance" });
      expect(h.channels.logs).toEqual([linkLogLine(MEMBER, PLAYER_WITHOUT_ALLIANCE, undefined)]);
    });

    test("a Player with an unknown rank creates a pending Rank Approval for the Member and asks the leader's Member", async () => {
      h.links.confirm({ link: LEADER_LINK }, () => undefined);
      h.onServer.add(LEADER);
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER_UNKNOWN_RANK);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(linkOfMember(h)?.allianceRank).toEqual({ source: "unknown" });
      expect(h.links.pendingFor(MEMBER)).toMatchObject({
        state: "pending",
        linkedMemberId: MEMBER,
        threadId: THREAD,
        approver: { kind: "member", memberId: LEADER },
      });
      expect(h.rankApprovals.announced).toEqual([
        { approval: h.links.pendingFor(MEMBER), player: PLAYER_WITH_LEADER_UNKNOWN_RANK },
      ]);
    });

    test("a Player with an unknown rank asks the Officers when the leader's Member is not on the server", async () => {
      h.links.confirm({ link: LEADER_LINK }, () => undefined);
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER_UNKNOWN_RANK);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.links.pendingFor(MEMBER)).toMatchObject({ state: "pending", approver: { kind: "officers" } });
      expect(h.rankApprovals.announced).toEqual([
        { approval: h.links.pendingFor(MEMBER), player: PLAYER_WITH_LEADER_UNKNOWN_RANK },
      ]);
    });

    test("a Player with an unknown rank does not delete the thread until the rank is approved", async () => {
      h.links.confirm({ link: LEADER_LINK }, () => undefined);
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER_UNKNOWN_RANK);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.channels.deleted).toEqual([]);
    });

    test("two Members confirming the same uid: the second is refused and asked again", async () => {
      const first = await confirmationShown(h, PLAYER);
      const secondId = await joinedMember(h, OTHER);
      h.gameApi.answerWith({ kind: "found", value: PLAYER, fetchedAt: NOW });
      await submitUid(h, secondId, UID_DIGITS, OTHER);
      await h.service.onButton(new FakeButton(interviewCustomId("confirm", first), { id: MEMBER }));

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", secondId), { id: OTHER }));

      expect(h.links.linkFor(OTHER)).toBeUndefined();
      expect(h.interviews.get(secondId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 1 });
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: alreadyLinkedMessage(secondId, 4) });
      expect(h.channels.logs.at(-1)).toEqual(refusedLogLine(OTHER, UID));
    });
  });

  describe("two presses that race on one Interview", () => {
    test("That's me pressed twice: the press that finds the Interview already linked is refused privately, and the Link stays", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const late = new HeldButton(interviewCustomId("confirm", interviewId), { id: MEMBER });
      const latePress = h.service.onButton(late);
      expect(late.updates).toHaveLength(1);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));
      late.release();
      await latePress;

      expect(linkOfMember(h)).toEqual({
        memberId: MEMBER,
        uid: UID,
        linkedAt: NOW,
        allianceRank: { source: "game-api", rank: "R4" },
        madeBy: { kind: "in-game-proof" },
      });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "linked" });
      expect(late.replies).toEqual([interviewEndedReply()]);
      expect(h.channels.deleted).toEqual([]);
      expect(h.channels.logs).toEqual([linkLogLine(MEMBER, PLAYER, undefined)]);
    });

    test("That's me held while That's not me wins: no Link is stored and the late press is refused privately", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const late = new HeldButton(interviewCustomId("confirm", interviewId), { id: MEMBER });
      const latePress = h.service.onButton(late);

      await h.service.onButton(new FakeButton(interviewCustomId("reject", interviewId), { id: MEMBER }));
      late.release();
      await latePress;

      expect(linkOfMember(h)).toBeUndefined();
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 1 });
      expect(late.replies).toEqual([interviewEndedReply()]);
    });

    test("That's not me held while That's me wins: the Interview stays linked and the late press is refused privately", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const late = new HeldButton(interviewCustomId("reject", interviewId), { id: MEMBER });
      const latePress = h.service.onButton(late);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));
      late.release();
      await latePress;

      expect(linkOfMember(h)).toMatchObject({ memberId: MEMBER, uid: UID });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "linked" });
      expect(late.replies).toEqual([interviewEndedReply()]);
      expect(h.channels.deleted).toEqual([]);
    });
  });

  describe("a Game API lookup that throws", () => {
    test("sends the Interview back to asking for the uid and posts the unavailable message", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.failWith(new Error("the connection was reset"));

      await submitUid(h, interviewId, UID_DIGITS);

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: unavailableMessage(interviewId) });
    });
  });

  describe("a store that fails before the button is acknowledged", () => {
    test("gives the Member a private reply, so the interaction does not fail", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const broken = createInterviews({ ...h.deps, interviews: new UnreadableInterviewStore(db, TIMEOUT_MS) });
      const button = new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER });

      await broken.onButton(button);

      expect(button.replies).toHaveLength(1);
      expect(button.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
      expect(button.updates).toEqual([]);
    });
  });

  describe("a button that finds the Interview not awaiting its answer", () => {
    test.each([{ action: "confirm" }, { action: "reject" }] as const)(
      "tells the Member the Interview has ended when $action is pressed while the uid is awaited",
      async ({ action }) => {
        const interviewId = await joinedMember(h);
        const button = new FakeButton(interviewCustomId(action, interviewId), { id: MEMBER });

        await h.service.onButton(button);

        expect(button.replies).toEqual([interviewEndedReply()]);
        expect(button.updates).toEqual([]);
      },
    );

    test.each(["interview:confirm:abc", "interview:dance:1"])(
      "tells the Member the Interview has ended for the custom id %s, which is not a valid one",
      async (customId) => {
        const button = new FakeButton(customId, { id: MEMBER });

        await h.service.onButton(button);

        expect(button.replies).toEqual([interviewEndedReply()]);
      },
    );
  });

  describe("a uid that fails", () => {
    test("refuses a uid Linked to another Member, counts the attempt, logs it and tells nobody else", async () => {
      h.links.confirm({ link: { memberId: OTHER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      const interviewId = await joinedMember(h);

      await submitUid(h, interviewId, UID_DIGITS);

      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: alreadyLinkedMessage(interviewId, 4) });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 1 });
      expect(h.channels.logs).toEqual([refusedLogLine(MEMBER, UID)]);
      expect(JSON.stringify([h.channels.posts, h.channels.logs])).not.toContain(OTHER);
    });

    test.each([
      { label: "not-found", result: { kind: "not-found" } },
      { label: "not-prepared", result: { kind: "not-prepared" } },
    ] satisfies readonly { readonly label: string; readonly result: LookupResult<Player> }[])(
      "counts an attempt and asks again with help when the Game API answers $label",
      async ({ result }) => {
        const interviewId = await joinedMember(h);
        h.gameApi.answerWith(result);

        await submitUid(h, interviewId, UID_DIGITS);

        expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: notFoundMessage(interviewId, UID, 4) });
        expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 1 });
      },
    );

    test.each([
      { label: "try-again", result: { kind: "try-again" } },
      { label: "unavailable", result: { kind: "unavailable", reason: "unexpected" } },
    ] satisfies readonly { readonly label: string; readonly result: LookupResult<Player> }[])(
      "asks the Member to try again later, without counting an attempt, when the Game API answers $label",
      async ({ result }) => {
        const interviewId = await joinedMember(h);
        h.gameApi.answerWith(result);

        await submitUid(h, interviewId, UID_DIGITS);

        expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: unavailableMessage(interviewId) });
        expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
      },
    );

    test("tells the Member how many tries are left, down to one", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });

      await failUidTimes(h, interviewId, 4);

      expect(h.channels.posts.at(-1)?.message.content).toContain("1 try left.");
    });

    test("hands the Interview off on the fifth failed attempt: Officers are mentioned, the log notes it, the thread stays open", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });

      await failUidTimes(h, interviewId, 5);

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "handed-off", failedAttempts: 5 });
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: handedOffMessage(MEMBER, OFFICERS) });
      expect(h.channels.logs).toEqual([handedOffLogLine(MEMBER, THREAD)]);
      expect(h.channels.deleted).toEqual([]);
    });

    test("a hand-off does not take the Onboarding Role off the Member", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });

      await failUidTimes(h, interviewId, 5);

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "handed-off" });
      expect(h.onboardingRole.calls).not.toContainEqual({ kind: "takeOff", memberId: MEMBER });
    });
  });

  describe("That's not me", () => {
    test("counts a failed attempt and asks the Member for the uid again", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("reject", interviewId), { id: MEMBER }));

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 1 });
    });

    test("removes the buttons from the card", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const button = new FakeButton(interviewCustomId("reject", interviewId), { id: MEMBER });

      await h.service.onButton(button);

      expect(button.updates).toHaveLength(1);
      expect(button.updates[0]?.components).toEqual([]);
    });

    test("posts the rejected message with the attempts left and the uid help", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("reject", interviewId), { id: MEMBER }));

      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: rejectedMessage(interviewId, 4) });
    });

    test("hands the Interview off when the fifth attempt is rejected, and removes the buttons from the card", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });
      await failUidTimes(h, interviewId, 4);
      h.gameApi.answerWith({ kind: "found", value: PLAYER, fetchedAt: NOW });
      await submitUid(h, interviewId, UID_DIGITS);
      const button = new FakeButton(interviewCustomId("reject", interviewId), { id: MEMBER });

      await h.service.onButton(button);

      expect(button.updates[0]?.components).toEqual([]);
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "handed-off", failedAttempts: 5 });
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: handedOffMessage(MEMBER, OFFICERS) });
    });
  });

  describe("a uid check that finds the Daily Quota spent", () => {
    test("pauses the Interview with no failed attempt and posts the quota message with the reset time", async () => {
      const interviewId = await joinedMember(h);
      const resetsAt = new Date("2026-11-01T00:00:00Z");
      h.gameApi.answerWith({ kind: "quota-spent", resetsAt });

      await submitUid(h, interviewId, UID_DIGITS);

      expect(h.interviews.get(interviewId)).toMatchObject({
        step: "paused-for-quota",
        failedAttempts: 0,
        resumesAt: resetsAt,
      });
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: quotaSpentMessage(resetsAt, NOW) });
    });
  });

  describe("a modal submit in a step that takes no uid", () => {
    test("is acknowledged once while the found Player awaits confirmation", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const modal = new FakeModal(interviewCustomId("modal", interviewId), { id: MEMBER }, UID_DIGITS);

      await h.service.onModalSubmit(modal);

      expect(modal.replies.length + modal.deferUpdates).toBe(1);
    });

    test("is acknowledged once while the Interview is paused for the Daily Quota", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "quota-spent", resetsAt: new Date("2026-11-01T00:00:00Z") });
      await submitUid(h, interviewId, UID_DIGITS);
      const modal = new FakeModal(interviewCustomId("modal", interviewId), { id: MEMBER }, UID_DIGITS);

      await h.service.onModalSubmit(modal);

      expect(modal.replies.length + modal.deferUpdates).toBe(1);
    });

    test("tells the Member that the Interview has ended", async () => {
      const interviewId = await joinedMember(h);
      const open = h.interviews.get(interviewId);
      if (open === undefined) throw new Error("the test Interview is missing");
      h.interviews.save(memberLeft(open, NOW).interview);
      const modal = new FakeModal(interviewCustomId("modal", interviewId), { id: MEMBER }, UID_DIGITS);

      await h.service.onModalSubmit(modal);

      expect(modal.replies).toEqual([interviewEndedReply()]);
      expect(modal.deferUpdates).toBe(0);
    });
  });

  describe("/interview", () => {
    test("opens an Interview for a Member with no Link and no open Interview, and replies privately with its thread", async () => {
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });

      await h.service.onCommand(command);

      const interviewId = openInterviewIdOf(h, MEMBER);
      expect(h.channels.opened).toEqual([{ id: MEMBER, username: "vex_fan" }]);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
      expect(command.replies).toEqual([interviewOpenedReply(THREAD)]);
    });

    test("points to the open thread and opens nothing new when the Member has an open Interview", async () => {
      const interviewId = await joinedMember(h);
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });

      await h.service.onCommand(command);

      expect(h.interviews.openFor(MEMBER)?.id).toBe(interviewId);
      expect(h.channels.opened).toHaveLength(1);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
      expect(command.replies).toEqual([interviewAlreadyOpenReply(THREAD)]);
    });

    test("tells the Member privately that they are Linked and opens nothing when the Member has a Link", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });

      await h.service.onCommand(command);

      expect(command.replies).toHaveLength(1);
      expect(command.replies[0]?.content).toContain(UID_DIGITS);
      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("does not look the Player up in the Game API when the Member is Linked", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);

      await h.service.onCommand(new FakeCommand({ id: MEMBER, username: "vex_fan" }));

      expect(h.gameApi.lookups).toEqual([]);
    });

    test("opens a new Interview after the last one was handed off", async () => {
      const handedOffId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });
      await failUidTimes(h, handedOffId, 5);
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });

      await h.service.onCommand(command);

      const newId = openInterviewIdOf(h, MEMBER);
      expect(newId).not.toBe(handedOffId);
      expect(h.interviews.get(handedOffId)).toMatchObject({ step: "handed-off" });
      expect(h.channels.opened).toHaveLength(2);
      expect(command.replies).toEqual([interviewOpenedReply(THREAD)]);
    });

    test("opens a new Interview after the Member Unlinked themselves", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      await h.unlink.unlink({ id: MEMBER }, "self");
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });

      await h.service.onCommand(command);

      openInterviewIdOf(h, MEMBER);
      expect(h.channels.opened).toEqual([{ id: MEMBER, username: "vex_fan" }]);
      expect(command.replies).toEqual([interviewOpenedReply(THREAD)]);
    });

    test("opens a new Interview after the last one was abandoned by the timeout", async () => {
      const abandonedId = await joinedMember(h);
      const open = h.interviews.get(abandonedId);
      if (open === undefined) throw new Error("the test Interview is missing");
      h.interviews.save(timeOut(open, NOW).interview);
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });

      await h.service.onCommand(command);

      const newId = openInterviewIdOf(h, MEMBER);
      expect(newId).not.toBe(abandonedId);
      expect(h.interviews.get(abandonedId)).toMatchObject({ step: "abandoned", reason: "timed-out" });
      expect(h.channels.opened).toHaveLength(2);
      expect(command.replies).toEqual([interviewOpenedReply(THREAD)]);
    });
  });

  describe("/interview answered in time", () => {
    test("is deferred privately before the thread is opened, then answered once with the reply", async () => {
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });
      h.channels.beforeOpen = () => {
        command.calls.push("openThread");
      };

      await h.service.onCommand(command);

      expect(command.deferrals).toEqual([{ flags: MessageFlags.Ephemeral }]);
      expect(command.calls).toEqual(["deferReply", "openThread", "editReply"]);
      expect(command.replies).toEqual([interviewOpenedReply(THREAD)]);
    });

    test("tells the Member privately that something went wrong when the thread cannot be opened", async () => {
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });
      h.channels.refuseOpen = true;

      await h.service.onCommand(command);

      expect(command.calls).toEqual(["deferReply", "editReply"]);
      expect(command.replies).toEqual([somethingWentWrongReply()]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
      expect(h.errors).toHaveLength(1);
    });
  });

  describe("a press or submit by someone else than the Member of the Interview", () => {
    test.each([{ action: "confirm" }, { action: "reject" }] as const)(
      "tells someone else that the Interview belongs to another Member when $action is pressed, and changes nothing",
      async ({ action }) => {
        const interviewId = await confirmationShown(h, PLAYER);
        const before = h.interviews.get(interviewId);
        const lookupsBefore = h.gameApi.lookups.length;
        const postsBefore = h.channels.posts.length;
        const button = new FakeButton(interviewCustomId(action, interviewId), { id: OTHER });

        await h.service.onButton(button);

        expect(button.replies).toEqual([buttonOfSomeoneElseReply()]);
        expect(button.updates).toEqual([]);
        expect(h.interviews.get(interviewId)).toEqual(before);
        expect(linkOfMember(h)).toBeUndefined();
        expect(h.gameApi.lookups).toHaveLength(lookupsBefore);
        expect(h.channels.posts).toHaveLength(postsBefore);
      },
    );

    test("tells someone else that the Interview belongs to another Member when the uid is submitted, and changes nothing", async () => {
      const interviewId = await joinedMember(h);
      const before = h.interviews.get(interviewId);
      const modal = new FakeModal(interviewCustomId("modal", interviewId), { id: OTHER }, UID_DIGITS);

      await h.service.onModalSubmit(modal);

      expect(modal.replies).toEqual([buttonOfSomeoneElseReply()]);
      expect(modal.deferUpdates).toBe(0);
      expect(h.interviews.get(interviewId)).toEqual(before);
      expect(h.gameApi.lookups).toEqual([]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) });
    });
  });

  describe("an Interview kept across a restart, served by a new service on the same stores", () => {
    test("an Interview awaiting confirmation is still linked when the Member confirms on the new service", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const restarted = createInterviews(h.deps);

      await restarted.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(linkOfMember(h)).toMatchObject({ memberId: MEMBER, uid: UID });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "linked" });
      expect(h.channels.deleted).toEqual([]);
    });

    test("a paused Interview is resumed by the sweeper and takes the Member's uid on the new service", async () => {
      const interviewId = await joinedMember(h);
      const resetsAt = new Date("2026-11-01T00:00:00Z");
      const later = new Date(resetsAt.getTime() + 60_000);
      h.gameApi.answerWith({ kind: "quota-spent", resetsAt });
      await submitUid(h, interviewId, UID_DIGITS);
      const restarted = createInterviews({ ...h.deps, now: () => later });
      const sweeper = createSweeper({
        interviews: h.interviews,
        links: h.links,
        preferences: createPreferenceStore(db),
        channels: h.channels,
        timeoutMs: TIMEOUT_MS,
        now: () => later,
        logError: (line: string) => {
          h.errors.push(line);
        },
      });

      await sweeper.sweep();
      h.gameApi.answerWith({ kind: "found", value: PLAYER, fetchedAt: later });
      await restarted.onModalSubmit(new FakeModal(interviewCustomId("modal", interviewId), { id: MEMBER }, UID_DIGITS));

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-confirmation" });
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: foundCardMessage(interviewId, PLAYER) });
    });

    /** A restart: a new service on the same stores, after the sweeper's recovery as at start-up. */
    async function restarted(): Promise<ReturnType<typeof createInterviews>> {
      const service = createInterviews(h.deps);
      await createSweeper({
        interviews: h.interviews,
        links: h.links,
        preferences: createPreferenceStore(db),
        channels: h.channels,
        timeoutMs: TIMEOUT_MS,
        now: h.deps.now,
        logError: (line: string) => {
          h.errors.push(line);
        },
      }).recover();
      return service;
    }

    test("a shown Recommended Player still takes That's me after a restart, and asks for the uid of that Player", async () => {
      const interviewId = await recommendedMemberJoined(h, PLAYER);
      const service = await restarted();
      const accept = new FakeButton(interviewCustomId("accept", interviewId), { id: MEMBER });

      await service.onButton(accept);

      expect(accept.updates[0]?.components).toEqual([]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: askUidOfPlayerMessage(interviewId, "Vex") });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test("a shown pick list still takes a pick after a restart, and asks for the uid of the picked match", async () => {
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);
      const service = await restarted();
      const pick = new FakeSelect(interviewCustomId("pick", interviewId), { id: MEMBER }, ["1"]);

      await service.onButton(pick);

      expect(pick.updates[0]?.components).toEqual([]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: askUidOfPlayerMessage(interviewId, "Vexy") });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });
  });

  describe("when the Interview opens with the Member's display name (US6)", () => {
    test("looks the cleaned display name up as a Player Name, with no Kingdom, for the onboarding interview, and no uid", async () => {
      await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);

      expect(h.gameApi.nameLookups).toEqual([{ name: "drlol", kingdom: undefined, purpose: "onboarding-interview" }]);
      expect(h.gameApi.lookups).toEqual([]);
    });

    test("one free match: the thread greets the Member and shows that Player, with That's me and That's not me", async () => {
      const interviewId = await recommendedMemberJoined(h, PLAYER);

      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: recommendationMessage(interviewId, MEMBER, PLAYER) }]);
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-recommendation", failedAttempts: 0 });
    });

    test("one match already Linked to someone: asks for the uid as usual, with no failed attempt and no reason given", async () => {
      h.links.confirm({ link: { memberId: OTHER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      const interviewId = await recommendedMemberJoined(h, PLAYER);

      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test.each([
      { label: "matches no Player", result: { kind: "not-found" } },
      { label: "is not prepared", result: { kind: "not-prepared" } },
      { label: "is unavailable, to try again", result: { kind: "try-again" } },
      { label: "is unavailable", result: { kind: "unavailable", reason: "unexpected" } },
      { label: "finds the Daily Quota spent", result: { kind: "quota-spent", resetsAt: new Date("2026-11-01T00:00:00Z") } },
    ] satisfies readonly { readonly label: string; readonly result: LookupResult<Player> }[])(
      "asks for the uid as usual, with no failed attempt and no reason given, when the name lookup $label",
      async ({ result }) => {
        h.gameApi.answerNameWith(result);
        const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);

        expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
        expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
      },
    );

    test("a name lookup that throws asks for the uid as usual", async () => {
      h.gameApi.failNamesWith(new Error("the connection was reset"));
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);

      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test("a display name with no usable characters asks for the uid without any name lookup", async () => {
      const interviewId = await joinedMember(h, MEMBER, "[NML]");

      expect(h.gameApi.nameLookups).toEqual([]);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test("several matches: the thread lists them in a pick list, with no uid, and waits for a pick", async () => {
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);

      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: pickListMessage(interviewId, MEMBER, PICK_LIST) }]);
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-pick", failedAttempts: 0 });
    });

    test("a match Linked to another Member is left out of the pick list, the Member is not offered it", async () => {
      h.links.confirm({ link: { memberId: OTHER, uid: OTHER_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);

      expect(JSON.stringify(h.channels.posts)).toContain("Vexy");
      expect(JSON.stringify(h.channels.posts)).not.toContain("Kingdom #12");
    });

    test("when every match is Linked to another Member, the Member is asked for the uid as usual, with no failed attempt", async () => {
      const THIRD: MemberId = "999999999999999999";
      h.links.confirm({ link: { memberId: OTHER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      h.links.confirm({ link: { memberId: THIRD, uid: OTHER_UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);

      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test("/interview looks the display name of the Member who ran it up the same way", async () => {
      h.gameApi.answerNameWith({ kind: "found", value: PLAYER, fetchedAt: NOW });
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" }, DRLOL_DISPLAY_NAME);

      await h.service.onCommand(command);

      const interviewId = openInterviewIdOf(h, MEMBER);
      expect(h.gameApi.nameLookups).toEqual([{ name: "drlol", kingdom: undefined, purpose: "onboarding-interview" }]);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: recommendationMessage(interviewId, MEMBER, PLAYER) }]);
      expect(command.replies).toEqual([interviewOpenedReply(THREAD)]);
    });
  });

  describe("That's me on the Recommended Player (US6)", () => {
    test("asks for the uid of that Player, and removes the buttons from the recommendation", async () => {
      const interviewId = await recommendedMemberJoined(h, PLAYER);
      const button = new FakeButton(interviewCustomId("accept", interviewId), { id: MEMBER });

      await h.service.onButton(button);

      expect(button.updates[0]?.components).toEqual([]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: askUidOfPlayerMessage(interviewId, "Vex") });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test("does not Link the Member: the uid is still asked for", async () => {
      await recommendationAccepted(h, PLAYER);

      expect(linkOfMember(h)).toBeUndefined();
      expect(h.gameApi.lookups).toEqual([]);
    });

    test.each([{ action: "accept" }, { action: "decline" }] as const)(
      "tells someone else that the Interview belongs to another Member when $action is pressed, and changes nothing",
      async ({ action }) => {
        const interviewId = await recommendedMemberJoined(h, PLAYER);
        const before = h.interviews.get(interviewId);
        const button = new FakeButton(interviewCustomId(action, interviewId), { id: OTHER });

        await h.service.onButton(button);

        expect(button.replies).toEqual([buttonOfSomeoneElseReply()]);
        expect(button.updates).toEqual([]);
        expect(h.interviews.get(interviewId)).toEqual(before);
      },
    );
  });

  describe("That's not me and None of these on a recommendation (US6)", () => {
    test("That's not me asks for the uid as usual, with no failed attempt", async () => {
      const interviewId = await recommendedMemberJoined(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("decline", interviewId), { id: MEMBER }));

      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test("None of these asks for the uid as usual, with no failed attempt", async () => {
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);

      await h.service.onButton(new FakeButton(interviewCustomId("decline", interviewId), { id: MEMBER }));

      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });
  });

  describe("picking a match from the pick list (US6)", () => {
    test("asks for the uid of the picked match, and removes the pick list", async () => {
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);
      const pick = new FakeSelect(interviewCustomId("pick", interviewId), { id: MEMBER }, ["1"]);

      await h.service.onButton(pick);

      expect(pick.updates[0]?.components).toEqual([]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: askUidOfPlayerMessage(interviewId, "Vexy") });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    });

    test("a pick by someone else is refused, and changes nothing", async () => {
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);
      const before = h.interviews.get(interviewId);
      const pick = new FakeSelect(interviewCustomId("pick", interviewId), { id: OTHER }, ["1"]);

      await h.service.onButton(pick);

      expect(pick.replies).toEqual([buttonOfSomeoneElseReply()]);
      expect(pick.updates).toEqual([]);
      expect(h.interviews.get(interviewId)).toEqual(before);
    });

    test("None of these pressed by someone else is refused, and changes nothing", async () => {
      h.gameApi.answerNameWith({ kind: "ambiguous", matches: PICK_LIST });
      const interviewId = await joinedMember(h, MEMBER, DRLOL_DISPLAY_NAME);
      const before = h.interviews.get(interviewId);
      const decline = new FakeButton(interviewCustomId("decline", interviewId), { id: OTHER });

      await h.service.onButton(decline);

      expect(decline.replies).toEqual([buttonOfSomeoneElseReply()]);
      expect(decline.updates).toEqual([]);
      expect(h.interviews.get(interviewId)).toEqual(before);
    });

    test("a pick whose uid is not a valid uid is answered as something gone wrong, not as ended, and changes nothing", async () => {
      const outcome = h.interviews.create({ memberId: MEMBER, threadId: THREAD }, NOW);
      if (outcome.kind !== "created") throw new Error("the test Member already has an open Interview");
      const pickList = recommendationFound(
        outcome.interview,
        { kind: "several", matches: [{ uid: "not-a-uid", name: "Vex", kingdom: 12 }] },
        NOW,
      ).interview;
      h.interviews.save(pickList);
      const pick = new FakeSelect(interviewCustomId("pick", pickList.id), { id: MEMBER }, ["0"]);

      await h.service.onButton(pick);

      expect(pick.replies).toEqual([somethingWentWrongReply()]);
      expect(pick.updates).toEqual([]);
      expect(h.interviews.get(pickList.id)).toEqual(pickList);
    });
  });

  describe("the Recommended Player buttons on an Interview that awaits a uid (US6)", () => {
    test.each(["accept", "decline", "pick"] as const)(
      "tells the Member that the Interview has ended when $action is pressed while the uid is awaited",
      async (action) => {
        const interviewId = await joinedMember(h);
        const button = new FakeSelect(interviewCustomId(action, interviewId), { id: MEMBER }, ["0"]);

        await h.service.onButton(button);

        expect(button.replies).toEqual([interviewEndedReply()]);
        expect(button.updates).toEqual([]);
      },
    );
  });

  describe("the uid after That's me or a pick (US6)", () => {
    test("the uid of the recommended Player Links the Member at once, with no lookup and no second question", async () => {
      const interviewId = await recommendationAccepted(h, PLAYER);

      await submitUid(h, interviewId, UID_DIGITS);

      expect(h.gameApi.lookups).toEqual([]);
      expect(linkOfMember(h)).toEqual({
        memberId: MEMBER,
        uid: UID,
        linkedAt: NOW,
        allianceRank: { source: "game-api", rank: "R4" },
        madeBy: { kind: "in-game-proof" },
      });
      expect(h.channels.posts).not.toContainEqual({ threadId: THREAD, message: linkedMessage(MEMBER, PLAYER) });
      expect(h.channels.logs).toEqual([linkLogLine(MEMBER, PLAYER, undefined)]);
      expect(h.channels.deleted).toEqual([]);
    });

    test("the uid of the recommended Player is acknowledged once", async () => {
      const interviewId = await recommendationAccepted(h, PLAYER);
      const modal = new FakeModal(interviewCustomId("modal", interviewId), { id: MEMBER }, UID_DIGITS);

      await h.service.onModalSubmit(modal);

      expect(modal.replies.length + modal.deferUpdates).toBe(1);
    });

    test("the uid of the recommended Player, Linked to someone else since the choice, is refused as any taken uid", async () => {
      const interviewId = await recommendationAccepted(h, PLAYER);
      h.links.confirm({ link: { memberId: OTHER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);

      await submitUid(h, interviewId, UID_DIGITS);

      expect(linkOfMember(h)).toBeUndefined();
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-uid", failedAttempts: 1 });
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: alreadyLinkedMessage(interviewId, 4) });
      expect(h.channels.logs).toEqual([refusedLogLine(MEMBER, UID)]);
    });

    test("the uid of the picked match is looked up once, and links the Member at once", async () => {
      const interviewId = await matchPicked(h, "1");
      h.gameApi.answerWith({ kind: "found", value: PLAYER, fetchedAt: NOW });

      await submitUid(h, interviewId, UID_DIGITS);

      expect(h.gameApi.lookups).toEqual([{ uid: UID, purpose: "onboarding-interview" }]);
      expect(linkOfMember(h)).toEqual({
        memberId: MEMBER,
        uid: UID,
        linkedAt: NOW,
        allianceRank: { source: "game-api", rank: "R4" },
        madeBy: { kind: "in-game-proof" },
      });
      expect(h.channels.deleted).toEqual([]);
    });

    test("a different uid after That's me goes through the usual lookup and asks Is this you", async () => {
      const interviewId = await recommendationAccepted(h, PLAYER);
      h.gameApi.answerWith({ kind: "found", value: PLAYER_OTHER_UID, fetchedAt: NOW });

      await submitUid(h, interviewId, OTHER_UID_DIGITS);

      expect(h.gameApi.lookups).toEqual([{ uid: OTHER_UID, purpose: "onboarding-interview" }]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: foundCardMessage(interviewId, PLAYER_OTHER_UID) });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "awaiting-confirmation" });
      expect(linkOfMember(h)).toBeUndefined();
    });
  });

  describe("when a Member leaves the server", () => {
    test("abandons the open Interview as left", async () => {
      const interviewId = await joinedMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "abandoned", reason: "left" });
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("deletes the thread with no message in it", async () => {
      await joinedMember(h);
      const postsBefore = h.channels.posts.length;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.posts.slice(postsBefore)).toEqual([]);
      expect(h.channels.deleted).toEqual([THREAD]);
    });

    test("logs the abandoned Interview as left", async () => {
      await joinedMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.logs).toEqual([abandonedLogLine(MEMBER, "left")]);
    });

    test("still logs the abandoned Interview as left when the thread cannot be posted to", async () => {
      await joinedMember(h);
      h.channels.refusePosts = true;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.logs).toEqual([abandonedLogLine(MEMBER, "left")]);
    });

    test("still logs the abandoned Interview as left when the thread cannot be deleted", async () => {
      await joinedMember(h);
      h.channels.refuseDeletes = true;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.logs).toEqual([abandonedLogLine(MEMBER, "left")]);
    });

    test("cancels the pending Rank Approval of the Member's Link", async () => {
      const approval = await pendingRankApprovalOfMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.links.pendingFor(MEMBER)).toBeUndefined();
      expect(h.links.get(approval.id)).toMatchObject({ state: "cancelled" });
    });

    test("deletes the thread of the cancelled Rank Approval with no message in it, and logs the cancellation", async () => {
      await pendingRankApprovalOfMember(h);
      const postsBefore = h.channels.posts.length;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.posts.slice(postsBefore)).toEqual([]);
      expect(h.channels.deleted).toEqual([THREAD]);
      expect(h.channels.logs.at(-1)).toEqual(rankCancelledLogLine(MEMBER));
    });

    test("does nothing when the Member has no open Interview and no pending Rank Approval", async () => {
      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.posts).toEqual([]);
      expect(h.channels.logs).toEqual([]);
      expect(h.channels.deleted).toEqual([]);
      expect(h.errors).toEqual([]);
    });

    test("does not log an Interview that already ended as handed off", async () => {
      const interviewId = await joinedMember(h);
      h.gameApi.answerWith({ kind: "not-found" });
      await failUidTimes(h, interviewId, 5);
      const logsBefore = h.channels.logs.length;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "handed-off" });
      expect(h.channels.logs).toHaveLength(logsBefore);
      expect(h.channels.deleted).toEqual([]);
    });

    test("Unlinks a Linked Member as left, after their pending Rank Approval is cancelled", async () => {
      const approval = await pendingRankApprovalOfMember(h);
      let stateAtUnlink: string | undefined;
      h.unlink.onCall = () => {
        stateAtUnlink = h.links.get(approval.id)?.state;
      };

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.unlink.calls).toEqual([{ memberId: MEMBER, reason: "left" }]);
      expect(stateAtUnlink).toBe("cancelled");
    });

    test("Unlinks a Member with no Link as left too, after their open Interview is abandoned", async () => {
      const interviewId = await joinedMember(h);
      let stepAtUnlink: string | undefined;
      h.unlink.onCall = () => {
        stepAtUnlink = h.interviews.get(interviewId)?.step;
      };

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.unlink.calls).toEqual([{ memberId: MEMBER, reason: "left" }]);
      expect(stepAtUnlink).toBe("abandoned");
    });

    test("Unlinks a Linked Member as left when the thread of their open Interview cannot be posted to", async () => {
      await joinedMember(h);
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "unknown" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      h.channels.refusePosts = true;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.unlink.calls).toEqual([{ memberId: MEMBER, reason: "left" }]);
      expect(h.links.linkFor(MEMBER)).toBeUndefined();
    });

    test("Unlinks a Linked Member as left when the thread of their open Interview cannot be deleted", async () => {
      await joinedMember(h);
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "unknown" }, madeBy: { kind: "in-game-proof" } } }, () => undefined);
      h.channels.refuseDeletes = true;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.unlink.calls).toEqual([{ memberId: MEMBER, reason: "left" }]);
      expect(h.links.linkFor(MEMBER)).toBeUndefined();
    });

    test("Unlinks a Linked Member as left when the thread of their Rank Approval cannot be posted to", async () => {
      await pendingRankApprovalOfMember(h);
      h.channels.refusePosts = true;

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.unlink.calls).toEqual([{ memberId: MEMBER, reason: "left" }]);
      expect(h.links.linkFor(MEMBER)).toBeUndefined();
    });

    test("a Member who left and was Unlinked joins again and starts a new Onboarding Interview", async () => {
      h.links.confirm(
        { link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "unknown" }, madeBy: { kind: "in-game-proof" } } },
        () => undefined,
      );

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });
      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", displayName: "vex_fan", bot: false });

      expect(h.links.linkFor(MEMBER)).toBeUndefined();
      expect(h.interviews.openFor(MEMBER)).toBeDefined();
    });
  });

  describe("the Preferences message after a Link", () => {
    test("is posted for the Member in the thread, with the Player and the rank on the Link", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.preferences.posted).toEqual([
        { memberId: MEMBER, threadId: THREAD, player: PLAYER, rank: { source: "game-api", rank: "R4" } },
      ]);
    });

    test("is posted before the name and roles are given after a Link, so the language is stored when the Preference Roles are applied", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.nameAndRoles.trace).toEqual(["preferences.postAfterLink", "nameAndRoles.onLinked"]);
    });

    test("is posted too with a pending Rank Approval, and the thread stays open for the approval", async () => {
      await pendingRankApprovalOfMember(h);

      expect(h.preferences.posted).toEqual([
        { memberId: MEMBER, threadId: THREAD, player: PLAYER_WITH_LEADER_UNKNOWN_RANK, rank: { source: "unknown" } },
      ]);
      expect(h.channels.deleted).toEqual([]);
    });

    test("when it cannot be posted, the Link stands, the failure is logged, and the thread is deleted as before", async () => {
      h.preferences.failWith(new Error("Discord refused the post to the thread"));
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(linkOfMember(h)).toMatchObject({ memberId: MEMBER, uid: UID });
      expect(h.preferences.posted).toEqual([]);
      expect(h.errors).toHaveLength(1);
      expect(h.channels.deleted).toEqual([THREAD]);
    });

    test("when it cannot be posted with a pending Rank Approval, the approval is still asked and the thread stays open", async () => {
      h.preferences.failWith(new Error("Discord refused the post to the thread"));

      await pendingRankApprovalOfMember(h);

      expect(h.preferences.posted).toEqual([]);
      expect(h.errors).toHaveLength(1);
      expect(h.rankApprovals.announced).toHaveLength(1);
      expect(h.channels.deleted).toEqual([]);
    });
  });

  describe("the Link note after a Link", () => {
    test("is sent privately to the Member at an Interview Link, with the Link note exactly", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.privateMessages.attempts).toEqual([
        {
          memberId: MEMBER,
          message: {
            content:
              "You can look up Players and Alliances with /player and /alliance. Each Member has a Daily Allowance of Game API requests; cached answers are free. /usage shows yours.",
          },
        },
      ]);
    });

    test("when the Member cannot be messaged privately, the Link stands and the failure is logged", async () => {
      h.privateMessages.refuseWith(new Error("Cannot send messages to this user"));
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(linkOfMember(h)).toMatchObject({ memberId: MEMBER, uid: UID });
      expect(h.nameAndRoles.linked).toEqual([expect.objectContaining({ memberId: MEMBER })]);
      expect(h.errors).toEqual([expect.stringContaining("Link note")]);
    });
  });

  describe("the Member's name and roles after a Link", () => {
    test("a card the Member confirms gives the Player and the rank on the Link to the name and roles", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.nameAndRoles.linked).toEqual([{ memberId: MEMBER, player: PLAYER, rank: { source: "game-api", rank: "R4" } }]);
    });

    test("a Link with an unknown Alliance Rank gives the unknown rank to the name and roles", async () => {
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER_UNKNOWN_RANK);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.nameAndRoles.linked).toEqual([
        { memberId: MEMBER, player: PLAYER_WITH_LEADER_UNKNOWN_RANK, rank: { source: "unknown" } },
      ]);
    });

    test("a Player the Member chose with That's me is linked at once, and the name and roles get that Player", async () => {
      const interviewId = await recommendationAccepted(h, PLAYER);
      h.gameApi.answerWith({ kind: "found", value: PLAYER, fetchedAt: NOW });

      await submitUid(h, interviewId, UID_DIGITS);

      expect(linkOfMember(h)).toMatchObject({ memberId: MEMBER, uid: UID });
      expect(h.nameAndRoles.linked).toEqual([{ memberId: MEMBER, player: PLAYER, rank: { source: "game-api", rank: "R4" } }]);
    });

    test("a failing apply leaves the Link and the thread deletion as they are", async () => {
      h.nameAndRoles.failWith(new Error("Discord refused the role change"));
      const interviewId = await confirmationShown(h, PLAYER);

      await expect(
        h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER })),
      ).resolves.toBeUndefined();

      expect(h.nameAndRoles.linked).toHaveLength(1);
      expect(linkOfMember(h)).toEqual({ memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "game-api", rank: "R4" }, madeBy: { kind: "in-game-proof" } });
      expect(h.channels.deleted).toEqual([]);
      expect(h.channels.logs).toEqual([linkLogLine(MEMBER, PLAYER, undefined)]);
    });
  });
});
