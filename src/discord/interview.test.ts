import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type APIModalInteractionResponseCallbackData, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import { memberLeft, timeOut } from "../domain/onboarding-interview.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Link } from "../domain/link.js";
import type { LookupResult, Player } from "../domain/player.js";
import type { MemberId, RankApproval } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { LinkStore } from "../storage/link-store.js";
import type { OnboardingChannels, ThreadMember } from "./onboarding-channels.js";
import type { RankApprovals, RankButtonLike } from "./rank-approval.js";
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
  interviewCustomId,
  interviewEndedReply,
  interviewOpenedReply,
  leftMessage,
  linkedMessage,
  linkLogLine,
  malformedUidMessage,
  notFoundMessage,
  quotaSpentMessage,
  rankCancelledLeftMessage,
  rankCancelledLogLine,
  refusedLogLine,
  rejectedMessage,
  uidModal,
  unavailableMessage,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";
import {
  createInterviews,
  type ButtonInteractionLike,
  type InterviewDeps,
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

const PLAYER: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  power: 15_902_728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: undefined },
  allianceRank: "R4",
};

const PLAYER_WITH_LEADER: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  power: 15_902_728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: LEADER_UID },
  allianceRank: "R4",
};

const PLAYER_WITH_LEADER_UNKNOWN_RANK: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  power: 15_902_728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: LEADER_UID },
  allianceRank: "unknown",
};

const PLAYER_WITHOUT_ALLIANCE: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  power: 15_902_728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

const LEADER_LINK: Link = {
  memberId: LEADER,
  uid: LEADER_UID,
  linkedAt: NOW,
  allianceRank: { source: "no-alliance" },
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
  readonly lookups: { readonly uid: Uid; readonly purpose: RequestPurpose }[] = [];
  private answer: Promise<LookupResult<Player>> = Promise.resolve({ kind: "not-found" });
  private failure: Error | undefined = undefined;

  answerWith(result: LookupResult<Player>): void {
    this.answer = Promise.resolve(result);
  }

  /** Every lookup from now on fails with this error, as a dropped connection would. */
  failWith(error: Error): void {
    this.failure = error;
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
}

/** The onboarding channels as the Interview uses them: records every thread and log call. */
class FakeChannels implements OnboardingChannels {
  readonly opened: ThreadMember[] = [];
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly archived: string[] = [];
  readonly lockedAndArchived: string[] = [];
  readonly deleted: string[] = [];
  readonly logs: BaseMessageOptions[] = [];
  /** Runs when a thread is about to open: a test uses it to let a racing Interview land first. */
  beforeOpen: () => void = () => undefined;
  private posted = 0;

  openThread(member: ThreadMember): Promise<string> {
    this.beforeOpen();
    this.opened.push(member);
    return Promise.resolve(THREAD);
  }

  deleteThread(threadId: string): Promise<void> {
    this.deleted.push(threadId);
    return Promise.resolve();
  }

  post(threadId: string, message: BaseMessageOptions): Promise<string> {
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

  lockAndArchive(threadId: string): Promise<void> {
    this.lockedAndArchived.push(threadId);
    return Promise.resolve();
  }

  archive(threadId: string): Promise<void> {
    this.archived.push(threadId);
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

/** A /interview command as the Interview needs it: the Member who ran it, and the private replies given to them. */
class FakeCommand {
  readonly replies: PrivateReply[] = [];

  constructor(readonly user: { readonly id: string; readonly username: string }) {}

  reply(message: PrivateReply): Promise<void> {
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
async function joinedMember(h: Harness, memberId: MemberId = MEMBER): Promise<number> {
  await h.service.onMemberJoined({ id: memberId, username: "vex_fan", bot: false });
  return openInterviewIdOf(h, memberId);
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
    const onServer = new Set<MemberId>();
    const errors: string[] = [];
    const deps: InterviewDeps = {
      interviews,
      links,
      channels,
      gameApi,
      rankApprovals,
      officerRoles: OFFICERS,
      isOnServer: (memberId: MemberId) => Promise.resolve(onServer.has(memberId)),
      now: () => NOW,
      logError: (line: string) => {
        errors.push(line);
      },
    };
    const service = createInterviews(deps);
    h = { interviews, links, channels, gameApi, rankApprovals, onServer, errors, service, deps };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("when a Member joins", () => {
    test("ignores a bot account", async () => {
      await h.service.onMemberJoined({ id: MEMBER, username: "neil_bot", bot: true });

      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("ignores a Member who is already Linked", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" } } }, () => undefined);

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", bot: false });

      expect(h.channels.opened).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("ignores a Member who has an open Interview", async () => {
      h.interviews.create({ memberId: MEMBER, threadId: THREAD }, NOW);

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", bot: false });

      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
    });

    test("opens the Interview thread and asks for the uid in it", async () => {
      const interviewId = await joinedMember(h);

      expect(h.channels.opened).toEqual([{ id: MEMBER, username: "vex_fan" }]);
      expect(h.interviews.openFor(MEMBER)?.threadId).toBe(THREAD);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(interviewId, MEMBER) }]);
    });
  });

  describe("when the Member's Interview opens while their thread is being created", () => {
    test("deletes the thread just created, asks nothing in it, and keeps the Interview that won", async () => {
      h.channels.beforeOpen = () => {
        h.interviews.create({ memberId: MEMBER, threadId: RACING_THREAD }, NOW);
      };

      await h.service.onMemberJoined({ id: MEMBER, username: "vex_fan", bot: false });

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
      });
    });

    test("removes the buttons from the card", async () => {
      const interviewId = await confirmationShown(h, PLAYER);
      const button = new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER });

      await h.service.onButton(button);

      expect(button.updates).toHaveLength(1);
      expect(button.updates[0]?.components).toEqual([]);
    });

    test("says the Link in the thread and archives the thread", async () => {
      const interviewId = await confirmationShown(h, PLAYER);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: linkedMessage(MEMBER, PLAYER) });
      expect(h.channels.archived).toEqual([THREAD]);
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

    test("a Player with an unknown rank does not archive the thread until the rank is approved", async () => {
      h.links.confirm({ link: LEADER_LINK }, () => undefined);
      const interviewId = await confirmationShown(h, PLAYER_WITH_LEADER_UNKNOWN_RANK);

      await h.service.onButton(new FakeButton(interviewCustomId("confirm", interviewId), { id: MEMBER }));

      expect(h.channels.archived).toEqual([]);
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
      });
      expect(h.interviews.get(interviewId)).toMatchObject({ step: "linked" });
      expect(late.replies).toEqual([interviewEndedReply()]);
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: linkedMessage(MEMBER, PLAYER) });
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
      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: linkedMessage(MEMBER, PLAYER) });
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
      h.links.confirm({ link: { memberId: OTHER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" } } }, () => undefined);
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
      expect(h.channels.archived).toEqual([]);
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
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" } } }, () => undefined);
      const command = new FakeCommand({ id: MEMBER, username: "vex_fan" });

      await h.service.onCommand(command);

      expect(command.replies).toHaveLength(1);
      expect(command.replies[0]?.content).toContain(UID_DIGITS);
      expect(h.channels.opened).toEqual([]);
      expect(h.channels.posts).toEqual([]);
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("does not look the Player up in the Game API when the Member is Linked", async () => {
      h.links.confirm({ link: { memberId: MEMBER, uid: UID, linkedAt: NOW, allianceRank: { source: "no-alliance" } } }, () => undefined);

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

  describe("when a Member leaves the server", () => {
    test("abandons the open Interview as left", async () => {
      const interviewId = await joinedMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.interviews.get(interviewId)).toMatchObject({ step: "abandoned", reason: "left" });
      expect(h.interviews.openFor(MEMBER)).toBeUndefined();
    });

    test("says so in the thread, then locks and archives the thread", async () => {
      await joinedMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: leftMessage("vex_fan") });
      expect(h.channels.lockedAndArchived).toEqual([THREAD]);
    });

    test("logs the abandoned Interview as left", async () => {
      await joinedMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.logs).toEqual([abandonedLogLine(MEMBER, "left")]);
    });

    test("cancels the pending Rank Approval of the Member's Link", async () => {
      const approval = await pendingRankApprovalOfMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.links.pendingFor(MEMBER)).toBeUndefined();
      expect(h.links.get(approval.id)).toMatchObject({ state: "cancelled" });
    });

    test("says the Rank Approval is cancelled in its thread, archives the thread and logs it", async () => {
      await pendingRankApprovalOfMember(h);

      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.posts.at(-1)).toEqual({ threadId: THREAD, message: rankCancelledLeftMessage("vex_fan") });
      expect(h.channels.archived).toEqual([THREAD]);
      expect(h.channels.logs.at(-1)).toEqual(rankCancelledLogLine(MEMBER));
    });

    test("does nothing when the Member has no open Interview and no pending Rank Approval", async () => {
      await h.service.onMemberLeft({ id: MEMBER, username: "vex_fan" });

      expect(h.channels.posts).toEqual([]);
      expect(h.channels.logs).toEqual([]);
      expect(h.channels.archived).toEqual([]);
      expect(h.channels.lockedAndArchived).toEqual([]);
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
      expect(h.channels.lockedAndArchived).toEqual([]);
    });
  });
});
