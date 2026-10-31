import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { APIModalInteractionResponseCallbackData, BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import { memberLeft } from "../domain/onboarding-interview.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Link } from "../domain/link.js";
import type { LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { LinkStore } from "../storage/link-store.js";
import type { OnboardingChannels, ThreadMember } from "./onboarding-channels.js";
import {
  askUidMessage,
  buttonOfSomeoneElseReply,
  checkingReply,
  foundCardMessage,
  interviewCustomId,
  interviewEndedReply,
  linkedMessage,
  linkLogLine,
  malformedUidMessage,
  uidModal,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";
import {
  createInterviews,
  type ButtonInteractionLike,
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

  answerWith(result: LookupResult<Player>): void {
    this.answer = Promise.resolve(result);
  }

  /** The next lookup waits until the returned function is called. */
  holdNextAnswer(): (result: LookupResult<Player>) => void {
    const held = deferred<LookupResult<Player>>();
    this.answer = held.promise;
    return held.resolve;
  }

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.lookups.push({ uid, purpose });
    return this.answer;
  }
}

/** The onboarding channels as the Interview uses them: records every thread and log call. */
class FakeChannels implements OnboardingChannels {
  readonly opened: ThreadMember[] = [];
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly archived: string[] = [];
  readonly logs: BaseMessageOptions[] = [];
  private posted = 0;

  openThread(member: ThreadMember): Promise<string> {
    this.opened.push(member);
    return Promise.resolve(THREAD);
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

  lockAndArchive(): Promise<void> {
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
class FakeButton implements ButtonInteractionLike {
  readonly replies: PrivateReply[] = [];
  readonly modals: APIModalInteractionResponseCallbackData[] = [];
  readonly updates: BaseMessageOptions[] = [];

  constructor(
    readonly customId: string,
    readonly user: { readonly id: string },
  ) {}

  reply(message: PrivateReply): Promise<void> {
    this.replies.push(message);
    return Promise.resolve();
  }

  showModal(modal: APIModalInteractionResponseCallbackData): Promise<void> {
    this.modals.push(modal);
    return Promise.resolve();
  }

  update(options: BaseMessageOptions): Promise<void> {
    this.updates.push(options);
    return Promise.resolve();
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

interface Harness {
  readonly interviews: InterviewStore;
  readonly links: LinkStore;
  readonly channels: FakeChannels;
  readonly gameApi: FakeGameApi;
  readonly onServer: Set<MemberId>;
  readonly errors: string[];
  readonly service: ReturnType<typeof createInterviews>;
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
    const onServer = new Set<MemberId>();
    const errors: string[] = [];
    const service = createInterviews({
      interviews,
      links,
      channels,
      gameApi,
      officerRoles: OFFICERS,
      isOnServer: (memberId: MemberId) => Promise.resolve(onServer.has(memberId)),
      now: () => NOW,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { interviews, links, channels, gameApi, onServer, errors, service };
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
  });
});
