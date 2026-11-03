import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscordAPIError, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import { approve, cancel, type Approver, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import { AppliedStore } from "../storage/applied-store.js";
import { openDatabase } from "../storage/database.js";
import { LinkStore } from "../storage/link-store.js";
import type { OfficerRoles } from "./interview-texts.js";
import { createUnlink } from "./unlink.js";
import { rankHandedToOfficersMessage, unlinkedLogLine, unlinkedPrivateMessage } from "./unlink-texts.js";

type PendingApproval = Extract<RankApproval, { readonly state: "pending" }>;

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

const NOW = new Date("2026-11-02T10:00:00Z");
const OFFICERS: OfficerRoles = { moderatorRoleId: "900000000000000001", kingRoleId: "900000000000000002" };

/** The Member who leaves: a Linked Member, and the approver of the Rank Approvals of the others. */
const LEAVER_ID: MemberId = "111111111111111111";
const LEAVER = { id: LEAVER_ID };
const ALICE: MemberId = "222222222222222222";
const BOB: MemberId = "333333333333333333";
const CAROL: MemberId = "444444444444444444";
const DAN: MemberId = "555555555555555555";
const STRANGER: MemberId = "666666666666666666";
const OTHER: MemberId = "777777777777777777";

const LEAVER_UID = uidOf("145563254785");
const ALICE_UID = uidOf("145563254786");
const BOB_UID = uidOf("145563254787");
const CAROL_UID = uidOf("145563254788");
const DAN_UID = uidOf("145563254789");

/** Discord's codes: 50007 for a private message to a Member who cannot be messaged, 50001 for missing access. */
const CANNOT_MESSAGE_USER = 50007;
const MISSING_ACCESS = 50001;

/** A refusal by Discord, as discord.js raises it: a DiscordAPIError carrying the given code. */
function discordRefusal(code: number): DiscordAPIError {
  return new DiscordAPIError({ code, message: `Discord refused with code ${code.toString()}` }, code, 403, "POST", "/users/@me/channels", {});
}

const THREAD_ALICE = "800000000000000001";
const THREAD_BOB = "800000000000000002";
const THREAD_CAROL = "800000000000000003";
const THREAD_DAN = "800000000000000004";

/** A promise the test resolves by hand. */
interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A post held back: `reached` resolves when Unlink asks to post, and the post lands only once `release` is called. */
interface HeldPost {
  readonly reached: Promise<void>;
  readonly release: () => void;
}

/** The channels Unlink posts to: records every log line and thread post; a refused call rejects and records nothing. */
class FakeChannels {
  readonly logs: BaseMessageOptions[] = [];
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  private logFailure: Error | undefined = undefined;
  private readonly postFailures = new Map<string, Error>();
  private readonly holds = new Map<string, { readonly reached: Deferred; readonly released: Deferred }>();

  refuseLog(error: Error): void {
    this.logFailure = error;
  }

  refusePostsTo(threadId: string, error: Error): void {
    this.postFailures.set(threadId, error);
  }

  /** Holds the next post to the thread until the test releases it. */
  holdNextPostTo(threadId: string): HeldPost {
    const hold = { reached: deferred(), released: deferred() };
    this.holds.set(threadId, hold);
    return { reached: hold.reached.promise, release: hold.released.resolve };
  }

  log(message: BaseMessageOptions): Promise<void> {
    if (this.logFailure !== undefined) return Promise.reject(this.logFailure);
    this.logs.push(message);
    return Promise.resolve();
  }

  post(threadId: string, message: BaseMessageOptions): Promise<string> {
    const failure = this.postFailures.get(threadId);
    if (failure !== undefined) return Promise.reject(failure);
    const hold = this.holds.get(threadId);
    if (hold === undefined) return Promise.resolve(this.record(threadId, message));
    this.holds.delete(threadId);
    hold.reached.resolve();
    return hold.released.promise.then(() => this.record(threadId, message));
  }

  private record(threadId: string, message: BaseMessageOptions): string {
    this.posts.push({ threadId, message });
    return `message-${this.posts.length.toString()}`;
  }
}

/** The private messages to Members: records every attempt, including the refused ones. */
class FakePrivateMessages {
  readonly attempts: { readonly memberId: MemberId; readonly message: BaseMessageOptions }[] = [];
  private failure: Error | undefined = undefined;

  refuseWith(error: Error): void {
    this.failure = error;
  }

  send(memberId: MemberId, message: BaseMessageOptions): Promise<void> {
    this.attempts.push({ memberId, message });
    return this.failure === undefined ? Promise.resolve() : Promise.reject(this.failure);
  }
}

interface Harness {
  readonly links: LinkStore;
  readonly applied: AppliedStore;
  readonly channels: FakeChannels;
  readonly privateMessages: FakePrivateMessages;
  readonly errors: string[];
  readonly service: ReturnType<typeof createUnlink>;
}

/** A Link with an unknown Alliance Rank, made when the test starts. */
function aLink(memberId: MemberId, uid: Uid): Link {
  return { memberId, uid, linkedAt: NOW, allianceRank: { source: "unknown" } };
}

/** Stores the Link of a Member, with no applied state yet. */
function linkMember(h: Harness, memberId: MemberId, uid: Uid): void {
  const outcome = h.links.confirm({ link: aLink(memberId, uid) }, () => undefined);
  if (outcome.kind !== "linked") throw new Error("the test Link was not stored");
}

/** Records the nickname Neil gave a Member, as the apply does. */
function applyNickname(h: Harness, memberId: MemberId, nickname: string): void {
  h.applied.record({
    memberId,
    nickname,
    roles: ["NML", "R4"],
    appliedAt: NOW,
    complete: true,
  });
}

/** A pending Rank Approval of a Linked Member (their Link is stored with it), approved by the given approver. */
function pendingApproval(h: Harness, memberId: MemberId, uid: Uid, threadId: string, approver: Approver): PendingApproval {
  const outcome = h.links.confirm(
    {
      link: aLink(memberId, uid),
      rankApproval: { state: "pending", linkedMemberId: memberId, threadId, approver, askedAt: NOW },
    },
    () => undefined,
  );
  const approval = outcome.kind === "linked" ? outcome.rankApproval : undefined;
  if (approval?.state !== "pending") throw new Error("the test Rank Approval was not stored");
  return approval;
}

/** Stores a pending Rank Approval as approved by an Officer, the way a press does. */
function storeApproved(h: Harness, approval: PendingApproval): void {
  const change = approve(approval, "R3", OTHER, NOW);
  if (!change.ok) throw new Error("the test Rank Approval could not be approved");
  h.links.save(change.approval);
}

/** Stores a pending Rank Approval as cancelled, the way a Member's leave does. */
function storeCancelled(h: Harness, approval: PendingApproval): void {
  const change = cancel(approval, NOW);
  if (!change.ok) throw new Error("the test Rank Approval could not be cancelled");
  h.links.save(change.approval);
}

/** The Rank Approvals of the leaver: two pending ones for other Members, one approved and one cancelled. */
interface LeaverApprovals {
  readonly alice: PendingApproval;
  readonly bob: PendingApproval;
  readonly carol: RankApproval;
  readonly dan: RankApproval;
}

function setUpLeaverApprovals(h: Harness): LeaverApprovals {
  const leaver: Approver = { kind: "member", memberId: LEAVER_ID };
  const alice = pendingApproval(h, ALICE, ALICE_UID, THREAD_ALICE, leaver);
  const bob = pendingApproval(h, BOB, BOB_UID, THREAD_BOB, leaver);
  const carol = pendingApproval(h, CAROL, CAROL_UID, THREAD_CAROL, leaver);
  storeApproved(h, carol);
  const dan = pendingApproval(h, DAN, DAN_UID, THREAD_DAN, leaver);
  storeCancelled(h, dan);
  const storedCarol = h.links.get(carol.id);
  const storedDan = h.links.get(dan.id);
  if (storedCarol === undefined || storedDan === undefined) throw new Error("the test Rank Approvals were not stored");
  return { alice, bob, carol: storedCarol, dan: storedDan };
}

describe("createUnlink", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let h: Harness;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-unlink-"));
    db = openDatabase(dataDir);
    const links = new LinkStore(db);
    const applied = new AppliedStore(db);
    const channels = new FakeChannels();
    const privateMessages = new FakePrivateMessages();
    const errors: string[] = [];
    const service = createUnlink({
      links,
      applied,
      channels,
      sendPrivateMessage: (memberId, message) => privateMessages.send(memberId, message),
      officerRoles: OFFICERS,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { links, applied, channels, privateMessages, errors, service };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("when a Linked Member leaves", () => {
    test("ends the Link and forgets the applied state Neil gave the Member", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");

      await h.service.unlink(LEAVER, "left");

      expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
      expect(h.applied.get(LEAVER_ID)).toBeUndefined();
    });

    test("frees the uid, so another Member can be Linked to the same Player", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);

      await h.service.unlink(LEAVER, "left");
      const outcome = h.links.confirm({ link: aLink(OTHER, LEAVER_UID) }, () => undefined);

      expect(outcome.kind).toBe("linked");
    });

    test("treats a Member found missing at startup or in the Daily Sync the same way", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");

      await h.service.unlink(LEAVER, "missing");

      expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
      expect(h.channels.logs).toEqual([unlinkedLogLine(LEAVER_ID, LEAVER_UID, "NML Rogue", "missing")]);
      expect(h.privateMessages.attempts).toHaveLength(1);
    });

    test("logs one line naming the Member, the uid and the nickname Neil had given them", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");

      await h.service.unlink(LEAVER, "left");

      expect(h.channels.logs).toHaveLength(1);
      const line = h.channels.logs[0]?.content ?? "";
      expect(line).toContain(`<@${LEAVER_ID}>`);
      expect(line).toContain(LEAVER_UID);
      expect(line).toContain("NML Rogue");
    });

    test("logs the line without a nickname when Neil gave none", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);

      await h.service.unlink(LEAVER, "left");

      expect(h.channels.logs).toHaveLength(1);
      const line = h.channels.logs[0]?.content ?? "";
      expect(line).toContain(`<@${LEAVER_ID}>`);
      expect(line).toContain(LEAVER_UID);
      expect(line).not.toContain("undefined");
    });

    test("sends the Member one private message", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);

      await h.service.unlink(LEAVER, "left");

      expect(h.privateMessages.attempts).toEqual([{ memberId: LEAVER_ID, message: unlinkedPrivateMessage() }]);
    });

    test("keeps the Unlink and logs no error when Discord refuses the private message because the Member cannot be messaged", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      h.privateMessages.refuseWith(discordRefusal(CANNOT_MESSAGE_USER));

      await expect(h.service.unlink(LEAVER, "left")).resolves.toBeUndefined();

      expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
      expect(h.channels.logs).toHaveLength(1);
      expect(h.errors).toEqual([]);
    });

    test.each([
      ["another Discord error code", discordRefusal(MISSING_ACCESS)],
      ["a failure that is not a Discord error", new Error("the network is down")],
    ])(
      "keeps the Unlink and logs one error when the private message fails with %s",
      async (_description, failure) => {
        linkMember(h, LEAVER_ID, LEAVER_UID);
        applyNickname(h, LEAVER_ID, "NML Rogue");
        h.privateMessages.refuseWith(failure);

        await expect(h.service.unlink(LEAVER, "left")).resolves.toBeUndefined();

        expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
        expect(h.channels.logs).toHaveLength(1);
        expect(h.errors).toHaveLength(1);
        expect(h.errors[0]).toContain(LEAVER_ID);
      },
    );
  });

  describe("when the leaving Member approved pending Rank Approvals", () => {
    test("hands each pending Rank Approval to the Officers and saves it", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      const approvals = setUpLeaverApprovals(h);

      await h.service.unlink(LEAVER, "left");

      expect(h.links.get(approvals.alice.id)).toMatchObject({ state: "pending", approver: { kind: "officers" } });
      expect(h.links.get(approvals.bob.id)).toMatchObject({ state: "pending", approver: { kind: "officers" } });
      expect(h.links.pendingApprovedBy(LEAVER_ID)).toEqual([]);
    });

    test("posts one message in each thread, mentioning the Officer roles", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      setUpLeaverApprovals(h);

      await h.service.unlink(LEAVER, "left");

      expect(h.channels.posts.map((post) => post.threadId)).toEqual(
        expect.arrayContaining([THREAD_ALICE, THREAD_BOB]),
      );
      expect(h.channels.posts).toHaveLength(2);
      for (const post of h.channels.posts) {
        expect(post.message).toEqual(rankHandedToOfficersMessage(OFFICERS));
      }
    });

    test("posts once in each thread when a second Unlink of the same Member runs while the first is posting", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      setUpLeaverApprovals(h);
      // The first Unlink hands on Alice's approval and waits in her thread; the second finds Bob's approval still pending.
      const alicePost = h.channels.holdNextPostTo(THREAD_ALICE);
      const first = h.service.unlink(LEAVER, "left");
      await alicePost.reached;

      await h.service.unlink(LEAVER, "left");
      alicePost.release();
      await first;

      expect(h.channels.posts.filter((post) => post.threadId === THREAD_ALICE)).toHaveLength(1);
      expect(h.channels.posts.filter((post) => post.threadId === THREAD_BOB)).toHaveLength(1);
      expect(h.channels.posts).toHaveLength(2);
    });

    test("leaves approved and cancelled Rank Approvals as they were", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      const approvals = setUpLeaverApprovals(h);

      await h.service.unlink(LEAVER, "left");

      expect(h.links.get(approvals.carol.id)).toEqual(approvals.carol);
      expect(h.links.get(approvals.dan.id)).toEqual(approvals.dan);
      const postedThreads = h.channels.posts.map((post) => post.threadId);
      expect(postedThreads).not.toContain(THREAD_CAROL);
      expect(postedThreads).not.toContain(THREAD_DAN);
    });
  });

  describe("edge cases", () => {
    test("keeps the Unlink and logs the error when the log channel refuses the line", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      h.channels.refuseLog(new Error("Missing Access"));

      await expect(h.service.unlink(LEAVER, "left")).resolves.toBeUndefined();

      expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
      expect(h.errors).toHaveLength(1);
    });

    test("keeps the Officers as approver when the Rank Approval thread is gone", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      const approvals = setUpLeaverApprovals(h);
      h.channels.refusePostsTo(THREAD_ALICE, new Error("Unknown Channel"));

      await expect(h.service.unlink(LEAVER, "left")).resolves.toBeUndefined();

      expect(h.links.get(approvals.alice.id)).toMatchObject({ state: "pending", approver: { kind: "officers" } });
    });

    test("does nothing for a Member without a Link: no log line and no private message", async () => {
      await expect(h.service.unlink({ id: STRANGER }, "left")).resolves.toBeUndefined();

      expect(h.channels.logs).toEqual([]);
      expect(h.privateMessages.attempts).toEqual([]);
    });

    test("still hands on a pending Rank Approval the Member without a Link was the approver of", async () => {
      const alice = pendingApproval(h, ALICE, ALICE_UID, THREAD_ALICE, { kind: "member", memberId: STRANGER });

      await h.service.unlink({ id: STRANGER }, "left");

      expect(h.links.get(alice.id)).toMatchObject({ state: "pending", approver: { kind: "officers" } });
      expect(h.channels.logs).toEqual([]);
      expect(h.privateMessages.attempts).toEqual([]);
    });
  });
});
