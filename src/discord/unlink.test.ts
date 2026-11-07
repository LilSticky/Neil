import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscordAPIError, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Link } from "../domain/link.js";
import { parseBootyWindow } from "../domain/booty.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import { approve, cancel, type Approver, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import { AppliedStore } from "../storage/applied-store.js";
import { BootyAlertsStore, type StoredBootyAlerts } from "../storage/booty-alerts-store.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { LinkStore } from "../storage/link-store.js";
import { FakeDoctorRole, type DoctorRoleCall } from "./__fakes__/doctor-role.js";
import { FakeOnboardingRole } from "./__fakes__/onboarding-role.js";
import { FakePreferenceRoles } from "./__fakes__/preference-roles.js";
import { FakeRolesGuild, type FakeRolesMember } from "./__fakes__/roles-guild.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import type { OfficerRoles } from "./interview-texts.js";
import type { RoleLike } from "./member-roles.js";
import { createUnlink } from "./unlink.js";
import { rankHandedToOfficersMessage, unlinkedLogLine, unlinkedPrivateMessage, type UnlinkReason } from "./unlink-texts.js";

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

/** The Officer who Unlinks a Member, and the owner of the guild (whose nickname Neil can never change). */
const OFFICER_ID: MemberId = "888888888888888888";
const OWNER_ID = "999999999999999999";
const BY_OFFICER: UnlinkReason = { kind: "officer", officerId: OFFICER_ID };

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
const THREAD_LEAVER = "800000000000000005";

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

/** The channels Unlink posts to: records every log line, thread post and thread deletion; a refused call rejects and records nothing. */
class FakeChannels {
  readonly logs: BaseMessageOptions[] = [];
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly deleted: string[] = [];
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

  deleteThread(threadId: string): Promise<void> {
    this.deleted.push(threadId);
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
  /** The members of the server; a Member is on it only once joined. */
  readonly members: FakeServerMembers;
  /** The guild the Members are in, with the Managed Roles [NML] and R4 defined. */
  readonly guild: FakeRolesGuild;
  /** The Onboarding Role service: records the Members Unlink gives the role back to. */
  readonly onboardingRole: FakeOnboardingRole;
  /** The Doctor Role service: records the Members Unlink takes the Doctor Role off. */
  readonly doctorRole: FakeDoctorRole;
  /** The Preference Roles: records every forget, the Preferences of the Member Unlink forgets. */
  readonly preferenceRoles: FakePreferenceRoles;
  /** The Booty Alerts of the Members: a real store on the test database, which Unlink forgets from. */
  readonly bootyAlerts: BootyAlertsStore;
  /** The Event Invitations Off of the Members: a real store on the test database, which Unlink forgets from. */
  readonly events: EventStore;
  readonly service: ReturnType<typeof createUnlink>;
}

/** A Link with an unknown Alliance Rank, made when the test starts. */
function aLink(memberId: MemberId, uid: Uid): Link {
  return { memberId, uid, linkedAt: NOW, allianceRank: { source: "unknown" }, madeBy: { kind: "in-game-proof" } };
}

/** Stores the Link of a Member, with no applied state yet. */
function linkMember(h: Harness, memberId: MemberId, uid: Uid): void {
  const outcome = h.links.confirm({ link: aLink(memberId, uid) }, () => undefined);
  if (outcome.kind !== "linked") throw new Error("the test Link was not stored");
}

/**
 * Puts the Member on the server holding the roles given, with the nickname given, and returns the member as Discord
 * holds it, so a test can read the roles and nickname after the Unlink.
 */
function joinServer(
  h: Harness,
  memberId: MemberId,
  roles: readonly (string | RoleLike)[],
  nickname: string | undefined,
): FakeRolesMember {
  const member = h.guild.member(memberId, roles);
  member.nickname = nickname;
  h.members.join(memberId, h.guild, member);
  return member;
}

/** Records the nickname Neil gave a Member, as the apply does. */
function applyNickname(h: Harness, memberId: MemberId, nickname: string): void {
  h.applied.record({
    memberId,
    nickname,
    roles: ["[NML]", "R4"],
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
    const members = new FakeServerMembers();
    const guild = new FakeRolesGuild(OWNER_ID);
    guild.defineRole("[NML]");
    guild.defineRole("R4");
    const onboardingRole = new FakeOnboardingRole();
    const doctorRole = new FakeDoctorRole();
    const preferenceRoles = new FakePreferenceRoles();
    const bootyAlerts = new BootyAlertsStore(db);
    const events = new EventStore(db);
    const service = createUnlink({
      links,
      applied,
      channels,
      members,
      onboardingRole,
      doctorRole,
      preferenceRoles,
      bootyAlerts,
      events,
      now: () => NOW,
      sendPrivateMessage: (memberId, message) => privateMessages.send(memberId, message),
      officerRoles: OFFICERS,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { links, applied, channels, privateMessages, errors, members, guild, onboardingRole, doctorRole, preferenceRoles, bootyAlerts, events, service };
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

  describe("when a Member on the server is Unlinked by an Officer or by themselves", () => {
    const CASES: [string, UnlinkReason][] = [
      ["an Officer", BY_OFFICER],
      ["the Member", "self"],
    ];

    test.each(CASES)("takes off the Managed Roles Neil applied when %s Unlinks, and keeps the other roles", async (_who, reason) => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      h.guild.defineRole("Friends");
      const member = joinServer(h, LEAVER_ID, ["[NML]", "R4", "Friends"], "NML Rogue");

      await h.service.unlink(LEAVER, reason);

      expect(member.roles.map((role) => role.name)).toEqual(["Friends"]);
    });

    test("takes off [NML] from a Member whose applied state still holds the old NML, when an Officer Unlinks them", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      h.applied.record({ memberId: LEAVER_ID, nickname: "NML Rogue", roles: ["NML", "R4"], appliedAt: NOW, complete: true });
      const member = joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");

      await h.service.unlink(LEAVER, BY_OFFICER);

      expect(member.roles.map((role) => role.name)).toEqual([]);
    });

    test.each(CASES)("clears the nickname Neil set when %s Unlinks", async (_who, reason) => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      const member = joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");

      await h.service.unlink(LEAVER, reason);

      expect(member.nickname ?? "").toBe("");
    });

    test.each(CASES)(
      "leaves a nickname the Member changed by hand, and still takes off the Managed Roles, when %s Unlinks",
      async (_who, reason) => {
        linkMember(h, LEAVER_ID, LEAVER_UID);
        applyNickname(h, LEAVER_ID, "NML Rogue");
        const member = joinServer(h, LEAVER_ID, ["[NML]", "R4"], "Changed by hand");

        await h.service.unlink(LEAVER, reason);

        expect(member.nickname).toBe("Changed by hand");
        expect(member.roles).toEqual([]);
      },
    );

    test.each(CASES)(
      "ends the Link before the roles are taken off, so an apply that reads the Link meanwhile finds none, when %s Unlinks",
      async (_who, reason) => {
        linkMember(h, LEAVER_ID, LEAVER_UID);
        applyNickname(h, LEAVER_ID, "NML Rogue");
        const member = joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");
        const linkedAtRemoval: boolean[] = [];
        const removeRole = member.removeRole.bind(member);
        vi.spyOn(member, "removeRole").mockImplementation(async (role) => {
          linkedAtRemoval.push(h.links.linkFor(LEAVER_ID) !== undefined);
          await removeRole(role);
        });

        await h.service.unlink(LEAVER, reason);

        expect(linkedAtRemoval).toEqual([false, false]);
        expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
        expect(h.applied.get(LEAVER_ID)).toBeUndefined();
      },
    );

    test.each(CASES)("gives the Onboarding Role back to the Member when %s Unlinks", async (_who, reason) => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");

      await h.service.unlink(LEAVER, reason);

      expect(h.onboardingRole.calls).toEqual([{ kind: "give", memberId: LEAVER_ID }]);
    });

    test.each(CASES)(
      "gives the Onboarding Role back only after the Managed Roles are taken off, when %s Unlinks",
      async (_who, reason) => {
        linkMember(h, LEAVER_ID, LEAVER_UID);
        applyNickname(h, LEAVER_ID, "NML Rogue");
        const member = joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");
        const rolesAtGive: string[][] = [];
        h.onboardingRole.onCall = () => {
          rolesAtGive.push(member.roles.map((role) => role.name));
        };

        await h.service.unlink(LEAVER, reason);

        expect(rolesAtGive).toEqual([[]]);
      },
    );

    test.each(CASES)("takes the Doctor Role off the Member when %s Unlinks", async (_who, reason) => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");

      await h.service.unlink(LEAVER, reason);

      expect(h.doctorRole.calls).toEqual([{ kind: "takeOff", memberId: LEAVER_ID }]);
    });

    test.each(CASES)(
      "takes the Doctor Role off before the Onboarding Role is given back, when %s Unlinks",
      async (_who, reason) => {
        linkMember(h, LEAVER_ID, LEAVER_UID);
        joinServer(h, LEAVER_ID, [], undefined);
        let doctorCallsAtGive: readonly DoctorRoleCall[] = [];
        h.onboardingRole.onCall = (call) => {
          if (call.kind === "give") doctorCallsAtGive = [...h.doctorRole.calls];
        };

        await h.service.unlink(LEAVER, reason);

        expect(doctorCallsAtGive).toEqual([{ kind: "takeOff", memberId: LEAVER_ID }]);
      },
    );

    test.each(CASES)(
      "cancels the pending Rank Approval on the Member's own Link and deletes its thread with no message in it, when %s Unlinks",
      async (_who, reason) => {
        const approval = pendingApproval(h, LEAVER_ID, LEAVER_UID, THREAD_LEAVER, { kind: "officers" });
        joinServer(h, LEAVER_ID, [], undefined);

        await h.service.unlink(LEAVER, reason);

        expect(h.links.get(approval.id)).toMatchObject({ state: "cancelled" });
        expect(h.channels.deleted).toEqual([THREAD_LEAVER]);
        expect(h.channels.posts.map((post) => post.threadId)).not.toContain(THREAD_LEAVER);
      },
    );

    test("logs one line naming the Officer who Unlinked the Member", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");

      await h.service.unlink(LEAVER, BY_OFFICER);

      expect(h.channels.logs).toHaveLength(1);
      expect(h.channels.logs[0]?.content ?? "").toContain(`<@${OFFICER_ID}>`);
    });

    test("logs one line saying the Member Unlinked themselves", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      joinServer(h, LEAVER_ID, ["[NML]", "R4"], "NML Rogue");

      await h.service.unlink(LEAVER, "self");

      expect(h.channels.logs).toHaveLength(1);
      expect(h.channels.logs[0]?.content ?? "").toContain("themselves");
    });

    test("keeps the Unlink and names the role Discord would not let Neil remove in the log line", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      // An R4 above the bot's highest role: Neil cannot take it off.
      const outOfReach = h.guild.defineRole("R4", { position: 12 });
      const member = joinServer(h, LEAVER_ID, ["[NML]", outOfReach], "NML Rogue");

      await h.service.unlink(LEAVER, BY_OFFICER);

      expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
      expect(member.roles.map((role) => role.name)).toEqual(["R4"]);
      expect(h.channels.logs).toHaveLength(1);
      expect(h.channels.logs[0]?.content ?? "").toContain("R4");
    });

    test("tells the Member privately to run /interview when an Officer Unlinks them", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");

      await h.service.unlink(LEAVER, BY_OFFICER);

      expect(h.privateMessages.attempts).toHaveLength(1);
      expect(h.privateMessages.attempts[0]?.memberId).toBe(LEAVER_ID);
      expect(h.privateMessages.attempts[0]?.message.content ?? "").toContain("/interview");
    });

    test("sends no private message when the Member Unlinks themselves, the reply carries the result", async () => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");

      await h.service.unlink(LEAVER, "self");

      expect(h.privateMessages.attempts).toEqual([]);
    });
  });

  describe("when a Member is not on the server", () => {
    test.each<[string, UnlinkReason]>([
      ["left", "left"],
      ["missing", "missing"],
      ["an Officer", BY_OFFICER],
    ])("ends the Link without touching the roles or nickname on the server, for %s", async (_who, reason) => {
      linkMember(h, LEAVER_ID, LEAVER_UID);
      applyNickname(h, LEAVER_ID, "NML Rogue");
      // Held by the guild but not joined to the server: Neil cannot reach it, so it must not change.
      const member = h.guild.member(LEAVER_ID, ["[NML]", "R4"]);
      member.nickname = "NML Rogue";

      await h.service.unlink(LEAVER, reason);

      expect(h.links.linkFor(LEAVER_ID)).toBeUndefined();
      expect(member.roles.map((role) => role.name)).toEqual(["[NML]", "R4"]);
      expect(member.nickname).toBe("NML Rogue");
    });

    test.each<[string, UnlinkReason]>([
      ["left", "left"],
      ["missing", "missing"],
    ])("does not give the Onboarding Role back when the reason is %s", async (_who, reason) => {
      linkMember(h, LEAVER_ID, LEAVER_UID);

      await h.service.unlink(LEAVER, reason);

      expect(h.onboardingRole.calls).toEqual([]);
    });

    test.each<[string, UnlinkReason]>([
      ["left", "left"],
      ["missing", "missing"],
    ])("does not take the Doctor Role off when the reason is %s", async (_who, reason) => {
      linkMember(h, LEAVER_ID, LEAVER_UID);

      await h.service.unlink(LEAVER, reason);

      expect(h.doctorRole.calls).toEqual([]);
    });
  });
});

describe("createUnlink: the Preferences of the Member are forgotten", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let h: Harness;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-unlink-prefs-"));
    db = openDatabase(dataDir);
    const links = new LinkStore(db);
    const applied = new AppliedStore(db);
    const channels = new FakeChannels();
    const privateMessages = new FakePrivateMessages();
    const errors: string[] = [];
    const members = new FakeServerMembers();
    const guild = new FakeRolesGuild(OWNER_ID);
    guild.defineRole("[NML]");
    guild.defineRole("R4");
    const onboardingRole = new FakeOnboardingRole();
    const doctorRole = new FakeDoctorRole();
    const preferenceRoles = new FakePreferenceRoles();
    const bootyAlerts = new BootyAlertsStore(db);
    const events = new EventStore(db);
    const service = createUnlink({
      links,
      applied,
      channels,
      members,
      onboardingRole,
      doctorRole,
      preferenceRoles,
      bootyAlerts,
      events,
      now: () => NOW,
      sendPrivateMessage: (memberId, message) => privateMessages.send(memberId, message),
      officerRoles: OFFICERS,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { links, applied, channels, privateMessages, errors, members, guild, onboardingRole, doctorRole, preferenceRoles, bootyAlerts, events, service };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test.each<[string, UnlinkReason]>([
    ["the Member Unlinks themselves", "self"],
    ["an Officer Unlinks the Member", BY_OFFICER],
    ["the Member leaves the server", "left"],
    ["the Member is found missing", "missing"],
  ])("forgets the Preferences of the Member when %s", async (_case, reason) => {
    linkMember(h, LEAVER_ID, LEAVER_UID);

    await h.service.unlink(LEAVER, reason);

    expect(h.preferenceRoles.forgotten).toEqual([LEAVER_ID]);
  });

  test("forgets the Preferences of a Member whose Link has already ended meanwhile", async () => {
    await h.service.unlink(LEAVER, "missing");

    expect(h.preferenceRoles.forgotten).toEqual([LEAVER_ID]);
  });

  test("a failure to forget is logged, and the Unlink still ends the Link and logs it", async () => {
    linkMember(h, ALICE, ALICE_UID);
    joinServer(h, ALICE, ["[NML]"], undefined);
    h.preferenceRoles.failForgetWith(new Error("socket hang up"));

    await h.service.unlink({ id: ALICE }, BY_OFFICER);

    expect(h.preferenceRoles.forgotten).toEqual([ALICE]);
    expect(h.links.linkFor(ALICE)).toBeUndefined();
    expect(h.channels.logs).toHaveLength(1);
    expect(h.privateMessages.attempts).toHaveLength(1);
    expect(h.errors).toEqual([expect.stringContaining(ALICE)]);
  });
});

/** Booty Alerts for a test: the window given, read in Europe/Lisbon, for the mode given. */
function recordedBootyAlerts(): StoredBootyAlerts {
  const parsed = parseBootyWindow(480, 1380);
  if (!parsed.ok) throw new Error("the test Booty Alerts window must parse");
  return { mode: "always", window: parsed.value, timeZone: "Europe/Lisbon" };
}

describe("createUnlink: the Booty Alerts of the Member are forgotten", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let h: Harness;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-unlink-booty-"));
    db = openDatabase(dataDir);
    const links = new LinkStore(db);
    const applied = new AppliedStore(db);
    const channels = new FakeChannels();
    const privateMessages = new FakePrivateMessages();
    const errors: string[] = [];
    const members = new FakeServerMembers();
    const guild = new FakeRolesGuild(OWNER_ID);
    guild.defineRole("[NML]");
    guild.defineRole("R4");
    const onboardingRole = new FakeOnboardingRole();
    const doctorRole = new FakeDoctorRole();
    const preferenceRoles = new FakePreferenceRoles();
    const bootyAlerts = new BootyAlertsStore(db);
    const events = new EventStore(db);
    const service = createUnlink({
      links,
      applied,
      channels,
      members,
      onboardingRole,
      doctorRole,
      preferenceRoles,
      bootyAlerts,
      events,
      now: () => NOW,
      sendPrivateMessage: (memberId, message) => privateMessages.send(memberId, message),
      officerRoles: OFFICERS,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { links, applied, channels, privateMessages, errors, members, guild, onboardingRole, doctorRole, preferenceRoles, bootyAlerts, events, service };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test.each<[string, UnlinkReason]>([
    ["the Member Unlinks themselves", "self"],
    ["an Officer Unlinks the Member", BY_OFFICER],
    ["the Member leaves the server", "left"],
    ["the Member is found missing", "missing"],
  ])("forgets the Booty Alerts of the Member when %s", async (_case, reason) => {
    linkMember(h, LEAVER_ID, LEAVER_UID);
    h.bootyAlerts.save(LEAVER_ID, recordedBootyAlerts());

    await h.service.unlink(LEAVER, reason);

    expect(h.bootyAlerts.get(LEAVER_ID)).toBeUndefined();
  });

  test("forgets the Booty Alerts of a Member whose Link has already ended meanwhile", async () => {
    h.bootyAlerts.save(LEAVER_ID, recordedBootyAlerts());

    await h.service.unlink(LEAVER, "missing");

    expect(h.bootyAlerts.get(LEAVER_ID)).toBeUndefined();
  });

  test("leaves the Booty Alerts of the other Members as they are", async () => {
    linkMember(h, LEAVER_ID, LEAVER_UID);
    h.bootyAlerts.save(LEAVER_ID, recordedBootyAlerts());
    h.bootyAlerts.save(ALICE, recordedBootyAlerts());

    await h.service.unlink(LEAVER, "self");

    expect(h.bootyAlerts.get(ALICE)).toEqual(recordedBootyAlerts());
  });

  test("a failure to forget is logged, and the Unlink still ends the Link and logs it", async () => {
    linkMember(h, ALICE, ALICE_UID);
    joinServer(h, ALICE, ["[NML]"], undefined);
    h.bootyAlerts.save(ALICE, recordedBootyAlerts());
    vi.spyOn(h.bootyAlerts, "forget").mockImplementation(() => {
      throw new Error("database is locked");
    });

    await h.service.unlink({ id: ALICE }, BY_OFFICER);

    expect(h.links.linkFor(ALICE)).toBeUndefined();
    expect(h.channels.logs).toHaveLength(1);
    expect(h.privateMessages.attempts).toHaveLength(1);
    expect(h.errors).toEqual([expect.stringContaining(ALICE)]);
  });
});

describe("createUnlink: the Event Invitations Off of the Member are forgotten", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let h: Harness;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-unlink-event-invitations-"));
    db = openDatabase(dataDir);
    const links = new LinkStore(db);
    const applied = new AppliedStore(db);
    const channels = new FakeChannels();
    const privateMessages = new FakePrivateMessages();
    const errors: string[] = [];
    const members = new FakeServerMembers();
    const guild = new FakeRolesGuild(OWNER_ID);
    guild.defineRole("[NML]");
    guild.defineRole("R4");
    const onboardingRole = new FakeOnboardingRole();
    const doctorRole = new FakeDoctorRole();
    const preferenceRoles = new FakePreferenceRoles();
    const bootyAlerts = new BootyAlertsStore(db);
    const events = new EventStore(db);
    const service = createUnlink({
      links,
      applied,
      channels,
      members,
      onboardingRole,
      doctorRole,
      preferenceRoles,
      bootyAlerts,
      events,
      now: () => NOW,
      sendPrivateMessage: (memberId, message) => privateMessages.send(memberId, message),
      officerRoles: OFFICERS,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { links, applied, channels, privateMessages, errors, members, guild, onboardingRole, doctorRole, preferenceRoles, bootyAlerts, events, service };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test.each<[string, UnlinkReason]>([
    ["the Member Unlinks themselves", "self"],
    ["an Officer Unlinks the Member", BY_OFFICER],
    ["the Member leaves the server", "left"],
    ["the Member is found missing", "missing"],
  ])("forgets the Event Invitations Off of the Member when %s", async (_case, reason) => {
    linkMember(h, LEAVER_ID, LEAVER_UID);
    h.events.setInvitationsOff(LEAVER_ID);

    await h.service.unlink(LEAVER, reason);

    expect(h.events.hasInvitationsOff(LEAVER_ID)).toBe(false);
  });

  test("forgets the Event Invitations Off of a Member whose Link has already ended meanwhile", async () => {
    h.events.setInvitationsOff(LEAVER_ID);

    await h.service.unlink(LEAVER, "missing");

    expect(h.events.hasInvitationsOff(LEAVER_ID)).toBe(false);
  });

  test("leaves the Event Invitations Off of the other Members as they are", async () => {
    linkMember(h, LEAVER_ID, LEAVER_UID);
    h.events.setInvitationsOff(LEAVER_ID);
    h.events.setInvitationsOff(ALICE);

    await h.service.unlink(LEAVER, "self");

    expect(h.events.hasInvitationsOff(ALICE)).toBe(true);
  });

  test("a failure to forget is logged, and the Unlink still ends the Link and logs it", async () => {
    linkMember(h, ALICE, ALICE_UID);
    joinServer(h, ALICE, ["[NML]"], undefined);
    h.events.setInvitationsOff(ALICE);
    vi.spyOn(h.events, "forgetMember").mockImplementation(() => {
      throw new Error("database is locked");
    });

    await h.service.unlink({ id: ALICE }, BY_OFFICER);

    expect(h.links.linkFor(ALICE)).toBeUndefined();
    expect(h.channels.logs).toHaveLength(1);
    expect(h.privateMessages.attempts).toHaveLength(1);
    expect(h.errors).toEqual([expect.stringContaining(ALICE)]);
  });
});
