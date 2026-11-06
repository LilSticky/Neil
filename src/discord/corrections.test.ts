import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import type { Link, RankOnLink } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { HandedOff, Abandoned } from "../domain/onboarding-interview.js";
import { MAX_FAILED_ATTEMPTS } from "../domain/onboarding-interview.js";
import type { LookupResult, Player } from "../domain/player.js";
import type { MemberId } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { AppliedStore } from "../storage/applied-store.js";
import { InterviewStore } from "../storage/interview-store.js";
import { LinkStore } from "../storage/link-store.js";
import { FakeNameAndRoles } from "./__fakes__/name-and-roles.js";
import { officerLinkPreferencesMessage } from "./preferences-texts.js";
import { LINK_NOTE } from "./usage-texts.js";
import { FakeDoctorRole, type DoctorRoleCall } from "./__fakes__/doctor-role.js";
import { FakeOnboardingRole, type OnboardingRoleCall } from "./__fakes__/onboarding-role.js";
import { FakePreferenceRoles } from "./__fakes__/preference-roles.js";
import { FakePreferenceStore } from "./__fakes__/preference-store.js";
import { FakeRolesGuild } from "./__fakes__/roles-guild.js";
import { FakeServerMembers } from "./__fakes__/server-members.js";
import { FakeUnlink } from "./__fakes__/unlink.js";
import { createNameAndRoles } from "./name-and-roles.js";
import {
  handleLink,
  handleLinkButton,
  handleRank,
  handleUnlink,
  PendingLinkConfirmations,
  type CorrectionInteraction,
  type LinkButtonInteraction,
  type LinkInteraction,
} from "./corrections.js";
import type { ButtonMessage, Message, OfficerRoles, PrivateReply } from "./interview-texts.js";
import { rankSetLogLine } from "./interview-texts.js";
import { linkEndedReply } from "./corrections-texts.js";
import type { PendingRankApproval } from "./rank-approval.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

const NOW = new Date("2026-11-02T10:00:00Z");
const OFFICERS: OfficerRoles = { moderatorRoleId: "900000000000000001", kingRoleId: "900000000000000002" };
const MEMBER_ROLE_ID = "900000000000000003";
const OFFICER_ROLE_IDS = [OFFICERS.moderatorRoleId];
/** The owner of the guild: Neil never changes the owner's nickname. */
const OWNER_ID = "999999999999999999";

const OFFICER: MemberId = "888888888888888888";
const LINKED: MemberId = "111111111111111111";
const OTHER_LINKED: MemberId = "222222222222222222";
const UNLINKED: MemberId = "333333333333333333";
const NOT_OFFICER_LINKED: MemberId = "444444444444444444";
const LINKED_UID = uidOf("145563254785");
const OTHER_UID = uidOf("145563254786");
const OFFICER_UID = uidOf("145563254787");
const NOT_OFFICER_UID = uidOf("145563254788");
const THREAD = "800000000000000001";
const OTHER_THREAD = "800000000000000002";

const UNKNOWN_RANK: RankOnLink = { source: "unknown" };
const NO_ALLIANCE: RankOnLink = { source: "no-alliance" };
const GAME_R3: RankOnLink = { source: "game-api", rank: "R3" };
const GAME_R4: RankOnLink = { source: "game-api", rank: "R4" };

/** A private reply's content, or "" when the reply has none. */
function contentOf(message: BaseMessageOptions | undefined): string {
  return message?.content ?? "";
}

/**
 * The interaction of a slash command as the handlers read it: the caller, the caller's role IDs and the options given.
 * A handler defers its reply privately and then edits it; each edited reply is recorded in `replies` with the privacy
 * of the deferral, and an edit before the deferral is an error.
 */
class FakeCorrectionInteraction implements CorrectionInteraction {
  readonly deferrals: { readonly flags: MessageFlags.Ephemeral }[] = [];
  readonly replies: PrivateReply[] = [];

  constructor(
    readonly callerId: MemberId,
    private readonly roleIds: readonly string[],
    private readonly options: { readonly member?: MemberId; readonly rank?: string } = {},
  ) {}

  memberRoleIds(): readonly string[] {
    return this.roleIds;
  }

  memberOption(): MemberId | undefined {
    return this.options.member;
  }

  rankOption(): string | undefined {
    return this.options.rank;
  }

  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<void> {
    this.deferrals.push(options);
    return Promise.resolve();
  }

  editReply(message: Message): Promise<void> {
    const deferral = this.deferrals[0];
    if (deferral === undefined) return Promise.reject(new Error("editReply before deferReply"));
    this.replies.push({ ...message, flags: deferral.flags });
    return Promise.resolve();
  }
}

/** The channels a /rank, an Officer Link and their threads use: records every thread post, deletion and log line. */
class FakeChannels {
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly logs: BaseMessageOptions[] = [];
  readonly deleted: string[] = [];
  private logFailure: Error | undefined = undefined;
  private deleteFailure: Error | undefined = undefined;
  private readonly postFailures = new Map<string, Error>();

  /** Every log line is refused from now on: the log channel cannot be written to. */
  refuseLog(error: Error): void {
    this.logFailure = error;
  }

  /** Posts to this thread are refused from now on: the thread is gone. */
  refusePostsTo(threadId: string, error: Error): void {
    this.postFailures.set(threadId, error);
  }

  post(threadId: string, message: BaseMessageOptions): Promise<string> {
    const failure = this.postFailures.get(threadId);
    if (failure !== undefined) return Promise.reject(failure);
    this.posts.push({ threadId, message });
    return Promise.resolve(`message-${this.posts.length.toString()}`);
  }

  log(message: BaseMessageOptions): Promise<void> {
    if (this.logFailure !== undefined) return Promise.reject(this.logFailure);
    this.logs.push(message);
    return Promise.resolve();
  }

  /** Every thread deletion is refused from now on: the thread cannot be deleted. */
  refuseDeletes(error: Error): void {
    this.deleteFailure = error;
  }

  deleteThread(threadId: string): Promise<void> {
    if (this.deleteFailure !== undefined) return Promise.reject(this.deleteFailure);
    this.deleted.push(threadId);
    return Promise.resolve();
  }
}

interface Harness {
  readonly db: DatabaseSync;
  readonly links: LinkStore;
  readonly interviews: InterviewStore;
  readonly unlink: FakeUnlink;
  readonly channels: FakeChannels;
  readonly nameAndRoles: FakeNameAndRoles;
  readonly preferences: FakePreferenceStore;
  readonly errors: string[];
  readonly close: () => void;
}

/** The stores on a temporary database, and fakes at the Discord and Unlink ports. */
function makeHarness(): Harness {
  const dataDir = mkdtempSync(join(tmpdir(), "neil-corrections-"));
  const db: DatabaseSync = openDatabase(dataDir);
  const links = new LinkStore(db);
  const interviews = new InterviewStore(db, 60 * 60_000);
  const errors: string[] = [];
  return {
    db,
    links,
    interviews,
    unlink: new FakeUnlink(links),
    channels: new FakeChannels(),
    nameAndRoles: new FakeNameAndRoles(),
    preferences: new FakePreferenceStore(),
    errors,
    close: () => {
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Stores the Link of a Member with the rank given and no Rank Approval. */
function linkMember(h: Harness, memberId: MemberId, uid: Uid, allianceRank: RankOnLink): void {
  const link: Link = { memberId, uid, linkedAt: NOW, allianceRank, madeBy: { kind: "in-game-proof" } };
  const outcome = h.links.confirm({ link }, () => undefined);
  if (outcome.kind !== "linked") throw new Error("the test Link was not stored");
}

/** Stores a Link with its pending Rank Approval in one step: the approval is asked of the Officers in a thread. */
function linkWithPendingApproval(h: Harness, memberId: MemberId, uid: Uid, allianceRank: RankOnLink): void {
  const link: Link = { memberId, uid, linkedAt: NOW, allianceRank, madeBy: { kind: "in-game-proof" } };
  const outcome = h.links.confirm(
    {
      link,
      rankApproval: { state: "pending", linkedMemberId: memberId, threadId: THREAD, approver: { kind: "officers" }, askedAt: NOW },
    },
    () => undefined,
  );
  if (outcome.kind !== "linked") throw new Error("the test Link with its Rank Approval was not stored");
}

describe("handleUnlink without a member option: a Member Unlinks themselves", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  afterEach(() => {
    h.close();
  });

  test("ends the caller's own Link with the reason self, and no one else's", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    linkMember(h, OTHER_LINKED, OTHER_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(LINKED, [MEMBER_ROLE_ID]);

    await handleUnlink(interaction, { links: h.links, unlink: h.unlink, officerRoles: OFFICERS, logError: (line) => h.errors.push(line) });

    expect(h.unlink.calls).toEqual([{ memberId: LINKED, reason: "self" }]);
  });

  test("replies once, privately, and tells the Member they can run /interview", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(LINKED, [MEMBER_ROLE_ID]);

    await handleUnlink(interaction, { links: h.links, unlink: h.unlink, officerRoles: OFFICERS, logError: (line) => h.errors.push(line) });

    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("/interview");
    expect(interaction.deferrals).toEqual([{ flags: MessageFlags.Ephemeral }]);
  });

  test("tells a Member without a Link privately that they are not Linked, and ends nothing", async () => {
    const interaction = new FakeCorrectionInteraction(UNLINKED, [MEMBER_ROLE_ID]);

    await handleUnlink(interaction, { links: h.links, unlink: h.unlink, officerRoles: OFFICERS, logError: (line) => h.errors.push(line) });

    expect(h.unlink.calls).toEqual([]);
    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("not Linked");
  });
});

describe("handleUnlink with a member option: an Officer Unlinks another Member", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  afterEach(() => {
    h.close();
  });

  test("a Member who is not an Officer is refused privately, and the other Member's Link stays", async () => {
    linkMember(h, NOT_OFFICER_LINKED, NOT_OFFICER_UID, UNKNOWN_RANK);
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(NOT_OFFICER_LINKED, [MEMBER_ROLE_ID], { member: LINKED });

    await handleUnlink(interaction, { links: h.links, unlink: h.unlink, officerRoles: OFFICERS, logError: (line) => h.errors.push(line) });

    expect(h.unlink.calls).toEqual([]);
    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("Officer");
    expect(h.links.linkFor(LINKED)).toBeDefined();
  });

  test("an Officer Unlinks the named Member with the reason of the Officer who did it, and replies privately", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, [MEMBER_ROLE_ID, ...OFFICER_ROLE_IDS], { member: LINKED });

    await handleUnlink(interaction, { links: h.links, unlink: h.unlink, officerRoles: OFFICERS, logError: (line) => h.errors.push(line) });

    expect(h.unlink.calls).toEqual([{ memberId: LINKED, reason: { kind: "officer", officerId: OFFICER } }]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
  });

  test("an Officer naming a Member who is not Linked is told privately that they are not Linked, and nothing is unlinked", async () => {
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: UNLINKED });

    await handleUnlink(interaction, { links: h.links, unlink: h.unlink, officerRoles: OFFICERS, logError: (line) => h.errors.push(line) });

    expect(h.unlink.calls).toEqual([]);
    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("not Linked");
  });

  test("an Unlink, by an Officer or by the Member, starts no Onboarding Interview", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    linkMember(h, OTHER_LINKED, OTHER_UID, UNKNOWN_RANK);
    const deps = { links: h.links, unlink: h.unlink, officerRoles: OFFICERS, logError: (line: string) => h.errors.push(line) };

    await handleUnlink(new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED }), deps);
    await handleUnlink(new FakeCorrectionInteraction(OTHER_LINKED, [MEMBER_ROLE_ID]), deps);

    expect(h.unlink.calls).toHaveLength(2);
    expect(h.interviews.openFor(LINKED)).toBeUndefined();
    expect(h.interviews.latestFor(LINKED)).toBeUndefined();
    expect(h.interviews.openFor(OTHER_LINKED)).toBeUndefined();
    expect(h.interviews.latestFor(OTHER_LINKED)).toBeUndefined();
  });
});

describe("handleRank: an Officer gives a Linked Member's rank", () => {
  let h: Harness;
  let deps: Parameters<typeof handleRank>[1];

  beforeEach(() => {
    h = makeHarness();
    deps = {
      links: h.links,
      preferences: h.preferences,
      channels: h.channels,
      nameAndRoles: h.nameAndRoles,
      officerRoles: OFFICERS,
      now: () => NOW,
      logError: (line) => h.errors.push(line),
    };
  });

  afterEach(() => {
    h.close();
  });

  test("a Member who is not an Officer is refused privately, and the rank is not stored", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(NOT_OFFICER_LINKED, [MEMBER_ROLE_ID], { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual(UNKNOWN_RANK);
    expect(h.nameAndRoles.approved).toEqual([]);
    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("Officer");
  });

  test("an Officer naming their own Linked Member is refused privately, and the rank is not stored", async () => {
    linkMember(h, OFFICER, OFFICER_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: OFFICER, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.links.linkFor(OFFICER)?.allianceRank).toEqual(UNKNOWN_RANK);
    expect(h.nameAndRoles.approved).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
  });

  test("an Officer naming a Member who is not Linked is refused privately as not Linked", async () => {
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: UNLINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.nameAndRoles.approved).toEqual([]);
    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("not Linked");
  });

  test("an Officer naming a Linked Member with no Alliance is refused privately, and the rank is not stored", async () => {
    linkMember(h, LINKED, LINKED_UID, NO_ALLIANCE);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual(NO_ALLIANCE);
    expect(h.nameAndRoles.approved).toEqual([]);
    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("Alliance");
  });

  test("stores the rank on the Link as a Rank Approval by that Officer", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual({
      source: "rank-approval",
      rank: "R4",
      approvedBy: OFFICER,
      approvedAt: NOW,
    });
  });

  test("replaces an earlier approved rank with the one given", async () => {
    linkMember(h, LINKED, LINKED_UID, { source: "rank-approval", rank: "R2", approvedBy: OFFICER, approvedAt: NOW });
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual(expect.objectContaining({ source: "rank-approval", rank: "R4" }));
  });

  test("re-applies the name and roles of the Linked Member", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.nameAndRoles.approved).toEqual([LINKED]);
  });

  test("settles the pending Rank Approval of that Link, and deletes its thread with no message in it", async () => {
    linkWithPendingApproval(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.channels.posts).toEqual([]);
    expect(h.channels.deleted).toEqual([THREAD]);
  });

  test("keeps the thread while the Member's Preferences message is open in it, with no message in it", async () => {
    linkWithPendingApproval(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    h.preferences.openPrompt(LINKED, THREAD, NOW);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.channels.posts).toEqual([]);
    expect(h.channels.deleted).toEqual([]);
  });

  test("still deletes the thread when the Member's Preferences message is open in another thread", async () => {
    linkWithPendingApproval(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    h.preferences.openPrompt(LINKED, OTHER_THREAD, NOW);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.channels.deleted).toEqual([THREAD]);
  });

  test("posts in no thread and deletes none when the Link has no pending Rank Approval", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.channels.posts).toEqual([]);
    expect(h.channels.deleted).toEqual([]);
  });

  test("logs one line naming the Member, the rank and the Officer", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.channels.logs).toEqual([rankSetLogLine(OFFICER, LINKED, "R4")]);
  });

  test("replies privately that the rank is set, without a Daily Sync note when the game lists no rank", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(contentOf(interaction.replies[0])).not.toContain("Daily Sync");
  });

  test("tells the Officer privately, in the reply, that the game lists another rank which the next Daily Sync uses", async () => {
    linkMember(h, LINKED, LINKED_UID, GAME_R3);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R2" });

    await handleRank(interaction, deps);

    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(contentOf(interaction.replies[0])).toContain("R3");
    expect(contentOf(interaction.replies[0])).toContain("Daily Sync");
    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual(expect.objectContaining({ source: "rank-approval", rank: "R2" }));
  });

  test("does not tell the Officer about the Daily Sync when the game lists the same rank", async () => {
    linkMember(h, LINKED, LINKED_UID, GAME_R4);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(contentOf(interaction.replies[0])).not.toContain("Daily Sync");
  });

  test("still stores the rank, replies privately and re-applies the name and roles when the log channel refuses the line", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    h.channels.refuseLog(new Error("Missing Access"));
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual(expect.objectContaining({ source: "rank-approval", rank: "R4" }));
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(contentOf(interaction.replies[0])).toContain("R4");
    expect(h.nameAndRoles.approved).toEqual([LINKED]);
  });

  test("still stores the rank, logs it, replies privately and re-applies the name and roles when the thread cannot be deleted", async () => {
    linkWithPendingApproval(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    h.channels.refuseDeletes(new Error("Unknown Channel"));
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await expect(handleRank(interaction, deps)).resolves.toBeUndefined();

    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual(expect.objectContaining({ source: "rank-approval", rank: "R4" }));
    expect(h.channels.logs).toEqual([rankSetLogLine(OFFICER, LINKED, "R4")]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(contentOf(interaction.replies[0])).toContain("R4");
    expect(h.nameAndRoles.approved).toEqual([LINKED]);
    expect(h.errors).toEqual([expect.stringContaining("Unknown Channel")]);
  });
});

describe("handleRank: the name and roles it re-applies make one Game API lookup, with the lookup purpose", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
  });

  afterEach(() => {
    h.close();
  });

  test("looks the Linked Member's Player up exactly once, from the lookup share", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const members = new FakeServerMembers();
    const guild = new FakeRolesGuild(OWNER_ID);
    members.join(LINKED, guild, guild.member(LINKED, []));
    const nameAndRoles = createNameAndRoles({
      members,
      applied: new AppliedStore(h.db),
      links: h.links,
      gameApi: h.gameApi,
      unlink: h.unlink,
      preferenceRoles: new FakePreferenceRoles(),
      homeKingdom: KINGDOM,
      troopBracketLevels: [1, 3, 6, 10, 14, 17, 20, 24, 27, 30],
      officerRoleIds: OFFICER_ROLE_IDS,
      log: () => Promise.resolve(),
      now: () => NOW,
      logError: (line: string) => h.errors.push(line),
    });
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, {
      links: h.links,
      preferences: h.preferences,
      channels: h.channels,
      nameAndRoles,
      officerRoles: OFFICERS,
      now: () => NOW,
      logError: (line) => h.errors.push(line),
    });

    expect(h.gameApi.lookups).toEqual([{ uid: LINKED_UID, purpose: "lookup" }]);
  });

  test("a Linked Guest with no rank in the game gets /rank as any Link: the rank is stored and the name and roles are re-applied", async () => {
    h.gameApi.answer = { kind: "found", value: PLAYER_UNRANKED_OUTSIDE_HOME, fetchedAt: NOW };
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const members = new FakeServerMembers();
    const guild = new FakeRolesGuild(OWNER_ID);
    members.join(LINKED, guild, guild.member(LINKED, []));
    const nameAndRoles = createNameAndRoles({
      members,
      applied: new AppliedStore(h.db),
      links: h.links,
      gameApi: h.gameApi,
      unlink: h.unlink,
      preferenceRoles: new FakePreferenceRoles(),
      homeKingdom: KINGDOM,
      troopBracketLevels: [1, 3, 6, 10, 14, 17, 20, 24, 27, 30],
      officerRoleIds: OFFICER_ROLE_IDS,
      log: () => Promise.resolve(),
      now: () => NOW,
      logError: (line: string) => h.errors.push(line),
    });
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, {
      links: h.links,
      preferences: h.preferences,
      channels: h.channels,
      nameAndRoles,
      officerRoles: OFFICERS,
      now: () => NOW,
      logError: (line) => h.errors.push(line),
    });

    expect(h.links.linkFor(LINKED)?.allianceRank).toEqual(
      expect.objectContaining({ source: "rank-approval", rank: "R4" }),
    );
    expect(h.gameApi.lookups).toEqual([{ uid: LINKED_UID, purpose: "lookup" }]);
  });
});

/* Confirm of an Officer Link, pressed by the Officer who asked: the press is acknowledged first, and a refusal is answered
 * and ends the card. */

describe("handleLinkButton: the press is acknowledged first, and its refusal ends the card", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("Confirm is acknowledged with deferUpdate before the Member is checked on the server", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    const button = await press(h, confirm, OFFICER);

    expect(button.steps.slice(0, 2)).toEqual(["deferUpdate", "isOnServer"]);
  });

  test("a Confirm refused after the acknowledgement goes out as an ephemeral follow-up", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    h.onServer.delete(HANDED_OFF);

    const button = await press(h, confirm, OFFICER);

    expect(privateAnswersOf(button)).toEqual([expect.objectContaining({ method: "followUp", flags: MessageFlags.Ephemeral })]);
  });

  test("a refused Confirm updates the card to an ended state, so no live buttons stay under it", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    linkMember(h, OTHER_LINKED, FOUND_UID, UNKNOWN_RANK);

    const button = await press(h, confirm, OFFICER);

    const updates = button.answers.filter((answer) => answer.method === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.content).toContain("Vera");
  });

  test("Confirm pressed by the asking Officer who no longer holds an Officer role is refused privately, and stores nothing", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    const button = await press(h, confirm, OFFICER, [MEMBER_ROLE_ID]);

    expect(privateAnswersOf(button)).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("handed-off");
    expect(h.nameAndRoles.linked).toEqual([]);
  });

  test("a link: button whose custom id does not parse is answered privately that the link has ended", async () => {
    const button = await press(h, "link:not-a-confirmation", OFFICER);

    expect(privateAnswersOf(button)).toEqual([
      expect.objectContaining({ content: linkEndedReply().content, flags: MessageFlags.Ephemeral }),
    ]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
  });
});

describe("handleLinkButton: a failing channel does not stop the Officer Link", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("Confirm still stores the Officer Link when the Interview thread is gone", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    h.channels.refusePostsTo(`thread-of-${HANDED_OFF}`, new Error("Unknown Channel"));

    await press(h, confirm, OFFICER);

    expect(h.links.linkFor(HANDED_OFF)).toEqual(
      expect.objectContaining({ memberId: HANDED_OFF, uid: FOUND_UID, madeBy: { kind: "officer-link", officerId: OFFICER } }),
    );
    expect(h.interviews.latestFor(HANDED_OFF)).toMatchObject({ step: "linked", uid: FOUND_UID });
  });

  test("Confirm still applies the name and roles and deletes the thread when the log channel refuses the line", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    h.channels.refuseLog(new Error("Missing Access"));

    await press(h, confirm, OFFICER);

    expect(h.links.linkFor(HANDED_OFF)).toBeDefined();
    expect(h.nameAndRoles.linked).toEqual([expect.objectContaining({ memberId: HANDED_OFF })]);
    expect(h.channels.deleted).toEqual([`thread-of-${HANDED_OFF}`]);
  });
});

describe("handleLinkButton: an Officer Link tells the Member about /channels", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("sends the Member a private message pointing to /channels, once the Officer Link is stored", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.privateMessages.attempts.map((attempt) => attempt.memberId)).toEqual([HANDED_OFF, HANDED_OFF]);
    expect(h.privateMessages.attempts.map((attempt) => contentOf(attempt.message))).toEqual(
      expect.arrayContaining([expect.stringContaining("/channels")]),
    );
  });

  test("sends the Member the Link note privately, exactly, once the Officer Link is stored", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.privateMessages.attempts.map((attempt) => contentOf(attempt.message))).toContain(
      "You can look up Players and Alliances with /player and /alliance. Each Member has a Daily Allowance of Game API requests; cached answers are free. /usage shows yours.",
    );
  });

  test("a refused private message is ignored: the Officer Link stands and the name and roles are applied", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    h.privateMessages.refuseWith(new Error("Cannot send messages to this user"));

    await press(h, confirm, OFFICER);

    expect(h.privateMessages.attempts).toHaveLength(2);
    expect(h.errors).toContainEqual(expect.stringContaining("Link note"));
    expect(h.links.linkFor(HANDED_OFF)).toEqual(
      expect.objectContaining({ memberId: HANDED_OFF, uid: FOUND_UID, madeBy: { kind: "officer-link", officerId: OFFICER } }),
    );
    expect(h.nameAndRoles.linked).toEqual([expect.objectContaining({ memberId: HANDED_OFF })]);
    expect(h.channels.deleted).toEqual([`thread-of-${HANDED_OFF}`]);
  });
});

describe("handleLinkButton: an Officer Link's /channels note depends on the Player's Kingdom", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("to a Player outside the Home Kingdom, sends no /channels note but still sends the Link note", async () => {
    h.gameApi.answer = { kind: "found", value: PLAYER_OUTSIDE_HOME, fetchedAt: NOW };
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.links.linkFor(HANDED_OFF)).toMatchObject({ memberId: HANDED_OFF, uid: FOUND_UID });
    expect(h.privateMessages.attempts.map((attempt) => contentOf(attempt.message))).toEqual([LINK_NOTE]);
  });

  test("to a Home Kingdom Player, sends both the /channels note and the Link note", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.privateMessages.attempts.map((attempt) => contentOf(attempt.message))).toEqual([
      contentOf(officerLinkPreferencesMessage()),
      LINK_NOTE,
    ]);
  });
});

/* /link: an Officer Links a handed-off Member by hand, after confirming the Player shown. */

const HANDED_OFF: MemberId = "555555555555555555";
const RUNNING: MemberId = "666666666666666666";
const FOUND_UID = uidOf("145563254790");
const NOW_PLUS_30_MINUTES = new Date(NOW.getTime() + 30 * 60_000);

function kingdomOf(digits: number): KingdomNumber {
  const parsed = parseKingdom(digits);
  if (!parsed.ok) throw new Error(`the test kingdom ${digits.toString()} is not a valid kingdom`);
  return parsed.value;
}

const KINGDOM = kingdomOf(245);
/** A Player with a known Alliance Rank: the Link needs no Rank Approval. */
const PLAYER_RANKED: Player = {
  uid: FOUND_UID,
  name: "Vera",
  kingdom: KINGDOM,
  might: 15_000_000,
  sanctuaryLevel: 20,
  alliance: { tag: "NML", name: "NML Alliance", leaderUid: undefined },
  allianceRank: "R3",
};
/** A Player in an Alliance whose rank the Game API does not list: the Link needs a Rank Approval. */
const PLAYER_UNRANKED: Player = { ...PLAYER_RANKED, allianceRank: "unknown" };
/** A Player in Kingdom 12, outside the Home Kingdom (245): the Member Linked to them is a Guest. */
const PLAYER_OUTSIDE_HOME: Player = { ...PLAYER_RANKED, kingdom: kingdomOf(12) };
/** A Guest's Player, outside the Home Kingdom (245), whose rank the Game API does not list. */
const PLAYER_UNRANKED_OUTSIDE_HOME: Player = { ...PLAYER_UNRANKED, kingdom: kingdomOf(12) };

/** The Game API for a uid: records every lookup and answers with the result set. */
class FakeLinkGameApi {
  readonly lookups: { readonly uid: Uid; readonly purpose: RequestPurpose }[] = [];
  answer: LookupResult<Player> = { kind: "found", value: PLAYER_RANKED, fetchedAt: NOW };

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.lookups.push({ uid, purpose });
    return Promise.resolve(this.answer);
  }
}

/** The Rank Approvals as /link uses them: records every Rank Approval announced. */
class FakeRankApprovals {
  readonly announced: { readonly approval: PendingRankApproval; readonly player: Player }[] = [];

  announce(approval: PendingRankApproval, player: Player): Promise<void> {
    this.announced.push({ approval, player });
    return Promise.resolve();
  }
}

/**
 * The slash command as /link reads it, and the replies it gets: each edit is recorded with the custom ids of the buttons
 * under it, so a test presses the buttons the Officer was shown.
 */
class FakeLinkInteraction implements LinkInteraction {
  readonly deferrals: { readonly flags: MessageFlags.Ephemeral }[] = [];
  readonly replies: {
    readonly content: string;
    readonly flags: MessageFlags.Ephemeral;
    readonly buttonIds: readonly string[];
  }[] = [];

  constructor(
    readonly callerId: MemberId,
    private readonly roleIds: readonly string[],
    private readonly options: { readonly member?: MemberId; readonly uid?: string } = {},
  ) {}

  memberRoleIds(): readonly string[] {
    return this.roleIds;
  }

  memberOption(): MemberId | undefined {
    return this.options.member;
  }

  uidOption(): string | undefined {
    return this.options.uid;
  }

  deferReply(options: { readonly flags: MessageFlags.Ephemeral }): Promise<void> {
    this.deferrals.push(options);
    return Promise.resolve();
  }

  editReply(message: Message | ButtonMessage): Promise<void> {
    const deferral = this.deferrals[0];
    if (deferral === undefined) return Promise.reject(new Error("editReply before deferReply"));
    const buttonIds =
      "components" in message ? message.components.flatMap((row) => row.components.map((button) => button.custom_id)) : [];
    this.replies.push({ content: message.content, flags: deferral.flags, buttonIds });
    return Promise.resolve();
  }
}

/** A button press on the Officer Link card: records every answer, and an update of the card without privacy flags. */
class FakeLinkButton implements LinkButtonInteraction {
  readonly answers: { readonly method: "reply" | "update" | "followUp"; readonly content: string; readonly flags?: MessageFlags.Ephemeral }[] = [];
  /** The steps of the press in order: the acknowledgement, and each check that follows it. */
  readonly steps: string[] = [];

  constructor(
    readonly customId: string,
    readonly user: { readonly id: string },
    private readonly roleIds: readonly string[] = OFFICER_ROLE_IDS,
  ) {}

  memberRoleIds(): readonly string[] {
    return this.roleIds;
  }

  deferUpdate(): Promise<void> {
    this.steps.push("deferUpdate");
    return Promise.resolve();
  }

  reply(message: PrivateReply): Promise<void> {
    this.answers.push({ method: "reply", content: message.content, flags: message.flags });
    return Promise.resolve();
  }

  update(message: Message): Promise<void> {
    this.answers.push({ method: "update", content: message.content });
    return Promise.resolve();
  }

  followUp(message: PrivateReply): Promise<void> {
    this.answers.push({ method: "followUp", content: message.content, flags: message.flags });
    return Promise.resolve();
  }
}

/** The answers a button press gave privately: everything but the update of the card. */
function privateAnswersOf(button: FakeLinkButton): FakeLinkButton["answers"] {
  return button.answers.filter((answer) => answer.method !== "update");
}

/** The private messages an Officer Link sends the Member: records every attempt, a refused one included. */
class FakeLinkPrivateMessages {
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

interface LinkHarness extends Harness {
  readonly gameApi: FakeLinkGameApi;
  readonly rankApprovals: FakeRankApprovals;
  readonly onboardingRole: FakeOnboardingRole;
  readonly doctorRole: FakeDoctorRole;
  readonly privateMessages: FakeLinkPrivateMessages;
  /** The Members on the server; a Member not in it has left. */
  readonly onServer: Set<MemberId>;
  readonly confirmations: PendingLinkConfirmations;
  now: Date;
}

function makeLinkHarness(): LinkHarness {
  const base = makeHarness();
  return {
    ...base,
    gameApi: new FakeLinkGameApi(),
    rankApprovals: new FakeRankApprovals(),
    onboardingRole: new FakeOnboardingRole(),
    doctorRole: new FakeDoctorRole(),
    privateMessages: new FakeLinkPrivateMessages(),
    onServer: new Set([OFFICER, LINKED, OTHER_LINKED, UNLINKED, NOT_OFFICER_LINKED, HANDED_OFF, RUNNING]),
    confirmations: new PendingLinkConfirmations(),
    now: NOW,
  };
}

/** The dependencies of /link: the Interview, the Link, the Game API and the confirmations, at the harness's time. */
function linkDeps(h: LinkHarness) {
  return {
    links: h.links,
    interviews: h.interviews,
    gameApi: h.gameApi,
    isOnServer: (memberId: MemberId) => Promise.resolve(h.onServer.has(memberId)),
    officerRoles: OFFICERS,
    confirmations: h.confirmations,
    now: () => h.now,
    logError: (line: string) => h.errors.push(line),
  };
}

/** The dependencies of the Officer Link buttons: what a confirmed Link stores, says, applies and logs. */
function confirmDeps(h: LinkHarness) {
  return {
    links: h.links,
    interviews: h.interviews,
    channels: h.channels,
    rankApprovals: h.rankApprovals,
    nameAndRoles: h.nameAndRoles,
    isOnServer: (memberId: MemberId) => Promise.resolve(h.onServer.has(memberId)),
    confirmations: h.confirmations,
    onboardingRole: h.onboardingRole,
    doctorRole: h.doctorRole,
    homeKingdom: KINGDOM,
    sendPrivateMessage: (memberId: MemberId, message: BaseMessageOptions) => h.privateMessages.send(memberId, message),
    now: () => h.now,
    logError: (line: string) => h.errors.push(line),
  };
}

/** Stores an open Interview for the Member, as /interview would. */
function openInterviewFor(h: LinkHarness, memberId: MemberId): void {
  const created = h.interviews.create({ memberId, threadId: `thread-of-${memberId}` }, NOW);
  if (created.kind !== "created") throw new Error("the test Interview was not created");
}

/** Stores the Member's Interview as handed off, as after five failed attempts. */
function storeHandedOff(h: LinkHarness, memberId: MemberId): void {
  openInterviewFor(h, memberId);
  const open = h.interviews.openFor(memberId);
  if (open === undefined) throw new Error("the test Interview is not open");
  const handedOff: HandedOff = {
    step: "handed-off",
    id: open.id,
    memberId,
    threadId: open.threadId,
    failedAttempts: MAX_FAILED_ATTEMPTS,
    startedAt: open.startedAt,
    endedAt: NOW,
  };
  h.interviews.save(handedOff);
}

/** Runs /link as the caller and returns the custom ids of the Confirm and Cancel buttons the card shows. */
async function openCard(
  h: LinkHarness,
  officer: MemberId,
  member: MemberId,
  uid: string,
): Promise<{ readonly confirm: string; readonly cancel: string }> {
  const interaction = new FakeLinkInteraction(officer, OFFICER_ROLE_IDS, { member, uid });
  await handleLink(interaction, linkDeps(h));
  const [confirm, cancel] = interaction.replies[0]?.buttonIds ?? [];
  if (confirm === undefined || cancel === undefined) throw new Error("the card shows no Confirm and Cancel buttons");
  return { confirm, cancel };
}

/**
 * Presses a button of the Officer Link card as the given user, holding the roles given (an Officer's by default), and
 * returns the press with its answers and steps.
 */
async function press(
  h: LinkHarness,
  customId: string,
  byUser: MemberId,
  roleIds: readonly string[] = OFFICER_ROLE_IDS,
): Promise<FakeLinkButton> {
  const button = new FakeLinkButton(customId, { id: byUser }, roleIds);
  const deps = confirmDeps(h);
  await handleLinkButton(button, {
    ...deps,
    isOnServer: (memberId: MemberId) => {
      button.steps.push("isOnServer");
      return deps.isOnServer(memberId);
    },
  });
  return button;
}

describe("handleLink refusals: nothing is looked up or stored", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("a Member who is not an Officer is refused privately, and no Player is looked up", async () => {
    const interaction = new FakeLinkInteraction(NOT_OFFICER_LINKED, [MEMBER_ROLE_ID], { member: HANDED_OFF, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(h.gameApi.lookups).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(contentOf(interaction.replies[0])).toContain("Officer");
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
  });

  test("an Officer naming themselves is refused privately, and no Player is looked up", async () => {
    storeHandedOff(h, OFFICER);
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: OFFICER, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(h.gameApi.lookups).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(h.links.linkFor(OFFICER)).toBeUndefined();
  });

  test("a Member whose latest Interview is still running is refused privately, as not handed off", async () => {
    openInterviewFor(h, RUNNING);
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: RUNNING, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(h.gameApi.lookups).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(h.links.linkFor(RUNNING)).toBeUndefined();
    expect(h.interviews.latestFor(RUNNING)?.step).toBe("recommending");
  });

  test("a Member with no Interview at all is refused privately, as not handed off", async () => {
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: UNLINKED, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(h.gameApi.lookups).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(h.links.linkFor(UNLINKED)).toBeUndefined();
  });

  test("a uid that is not only digits is refused privately, before any lookup", async () => {
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: HANDED_OFF, uid: "12ab" });

    await handleLink(interaction, linkDeps(h));

    expect(h.gameApi.lookups).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
  });

  test("a uid already Linked to another Member is refused privately, naming that Member, before any lookup", async () => {
    linkMember(h, OTHER_LINKED, FOUND_UID, UNKNOWN_RANK);
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: HANDED_OFF, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(h.gameApi.lookups).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(contentOf(interaction.replies[0])).toContain(`<@${OTHER_LINKED}>`);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
  });

  test("a Member who is not on the server is refused privately, before any lookup", async () => {
    h.onServer.delete(HANDED_OFF);
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: HANDED_OFF, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(h.gameApi.lookups).toEqual([]);
    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
  });

  test("a uid no Player has is refused privately, and nothing is stored", async () => {
    h.gameApi.answer = { kind: "not-found" };
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: HANDED_OFF, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("handed-off");
  });

  test("an unreachable Game API is refused privately, and nothing is stored", async () => {
    h.gameApi.answer = { kind: "unavailable", reason: "unexpected" };
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: HANDED_OFF, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
  });

  test("a spent Daily Quota is refused privately, and nothing is stored", async () => {
    h.gameApi.answer = { kind: "quota-spent", resetsAt: NOW_PLUS_30_MINUTES };
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: HANDED_OFF, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(interaction.replies).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral, buttonIds: [] })]);
    expect(contentOf(interaction.replies[0])).toContain("look players up");
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
  });
});

describe("handleLink: the Player is shown for confirmation", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("looks the uid up once, with the Interview purpose, from the Quota Reserve", async () => {
    await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    expect(h.gameApi.lookups).toEqual([{ uid: FOUND_UID, purpose: "onboarding-interview" }]);
  });

  test("shows the Player privately, with name and uid, and a Confirm and a Cancel button whose custom ids start with link:", async () => {
    const interaction = new FakeLinkInteraction(OFFICER, OFFICER_ROLE_IDS, { member: HANDED_OFF, uid: FOUND_UID });

    await handleLink(interaction, linkDeps(h));

    expect(interaction.replies).toHaveLength(1);
    expect(interaction.replies[0]?.flags).toBe(MessageFlags.Ephemeral);
    expect(contentOf(interaction.replies[0])).toContain("Vera");
    expect(contentOf(interaction.replies[0])).toContain(FOUND_UID);
    expect(interaction.replies[0]?.buttonIds).toHaveLength(2);
    expect(interaction.replies[0]?.buttonIds.every((id) => id.startsWith("link:"))).toBe(true);
  });

  test("stores nothing before the Officer confirms", async () => {
    await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("handed-off");
    expect(h.channels.logs).toEqual([]);
  });
});

describe("handleLinkButton: Confirm makes the Officer Link", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("Confirm by the same Officer stores the Link as an Officer Link made by that Officer", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.links.linkFor(HANDED_OFF)).toEqual(
      expect.objectContaining({ memberId: HANDED_OFF, uid: FOUND_UID, madeBy: { kind: "officer-link", officerId: OFFICER } }),
    );
  });

  test("Confirm ends the handed-off Interview as linked to the uid", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.interviews.latestFor(HANDED_OFF)).toMatchObject({ step: "linked", uid: FOUND_UID });
  });

  test("Confirm deletes the Interview thread with no message in it when the rank is known", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.channels.posts).toEqual([]);
    expect(h.channels.deleted).toEqual([`thread-of-${HANDED_OFF}`]);
    expect(h.rankApprovals.announced).toEqual([]);
  });

  test("Confirm applies the name and roles of the Player, as for any Link", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.nameAndRoles.linked).toEqual([
      { memberId: HANDED_OFF, player: PLAYER_RANKED, rank: { source: "game-api", rank: "R3" } },
    ]);
  });

  test("Confirm takes the Onboarding Role off the Member it Links", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.onboardingRole.calls).toEqual([{ kind: "takeOff", memberId: HANDED_OFF }]);
  });

  test("Confirm takes the Onboarding Role off the Member too when a Rank Approval is pending", async () => {
    h.gameApi.answer = { kind: "found", value: PLAYER_UNRANKED, fetchedAt: NOW };
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.rankApprovals.announced).toHaveLength(1);
    expect(h.onboardingRole.calls).toEqual([{ kind: "takeOff", memberId: HANDED_OFF }]);
  });

  test("Confirm gives the Doctor Role to the Member it Links", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.doctorRole.calls).toEqual([{ kind: "give", memberId: HANDED_OFF }]);
  });

  test("Confirm gives the Doctor Role before the Onboarding Role is taken off", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    let doctorCallsAtTakeOff: readonly DoctorRoleCall[] = [];
    h.onboardingRole.onCall = (call: OnboardingRoleCall) => {
      if (call.kind === "takeOff") doctorCallsAtTakeOff = [...h.doctorRole.calls];
    };

    await press(h, confirm, OFFICER);

    expect(doctorCallsAtTakeOff).toEqual([{ kind: "give", memberId: HANDED_OFF }]);
  });

  test("Confirm gives the Doctor Role before the Onboarding Role is taken off, also when a Rank Approval is pending", async () => {
    h.gameApi.answer = { kind: "found", value: PLAYER_UNRANKED, fetchedAt: NOW };
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    let doctorCallsAtTakeOff: readonly DoctorRoleCall[] = [];
    h.onboardingRole.onCall = (call: OnboardingRoleCall) => {
      if (call.kind === "takeOff") doctorCallsAtTakeOff = [...h.doctorRole.calls];
    };

    await press(h, confirm, OFFICER);

    expect(h.rankApprovals.announced).toHaveLength(1);
    expect(doctorCallsAtTakeOff).toEqual([{ kind: "give", memberId: HANDED_OFF }]);
  });

  test("Confirm of a Player whose rank is unknown announces a Rank Approval for the thread, and leaves the thread open", async () => {
    h.gameApi.answer = { kind: "found", value: PLAYER_UNRANKED, fetchedAt: NOW };
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.rankApprovals.announced).toHaveLength(1);
    const announced = h.rankApprovals.announced[0];
    expect(announced?.approval.linkedMemberId).toBe(HANDED_OFF);
    expect(announced?.approval.threadId).toBe(`thread-of-${HANDED_OFF}`);
    expect(announced?.approval.state).toBe("pending");
    expect(announced?.player).toEqual(PLAYER_UNRANKED);
    expect(h.channels.deleted).toEqual([]);
  });

  test("Confirm logs exactly one line naming the Member, the uid, the Player and the Officer", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.channels.logs).toHaveLength(1);
    const line = contentOf(h.channels.logs[0]);
    expect(line).toContain(`<@${HANDED_OFF}>`);
    expect(line).toContain(FOUND_UID);
    expect(line).toContain("Vera");
    expect(line).toContain(`<@${OFFICER}>`);
    expect(h.errors).toEqual([]);
  });
});

describe("handleLinkButton: an Officer Link of a Guest with no rank in the game opens no Rank Approval", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("Confirm stores the Officer Link, stores no Rank Approval, and deletes the Interview thread", async () => {
    h.gameApi.answer = { kind: "found", value: PLAYER_UNRANKED_OUTSIDE_HOME, fetchedAt: NOW };
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, confirm, OFFICER);

    expect(h.links.linkFor(HANDED_OFF)).toMatchObject({ memberId: HANDED_OFF, uid: FOUND_UID });
    expect(h.links.pendingFor(HANDED_OFF)).toBeUndefined();
    expect(h.rankApprovals.announced).toEqual([]);
    expect(h.channels.posts).toEqual([]);
    expect(h.channels.deleted).toEqual([`thread-of-${HANDED_OFF}`]);
  });
});

describe("handleLinkButton: Confirm refuses and stores nothing when the state moved on", () => {
  let h: LinkHarness;

  beforeEach(() => {
    h = makeLinkHarness();
    storeHandedOff(h, HANDED_OFF);
  });

  afterEach(() => {
    h.close();
  });

  test("Confirm after the uid was Linked to another Member meanwhile is refused privately, and stores nothing", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    linkMember(h, OTHER_LINKED, FOUND_UID, UNKNOWN_RANK);

    const button = await press(h, confirm, OFFICER);

    expect(privateAnswersOf(button)).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("handed-off");
    expect(h.channels.logs).toEqual([]);
    expect(h.nameAndRoles.linked).toEqual([]);
  });

  test("Confirm after the Interview is no longer handed off is refused privately, and stores nothing", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    const handedOff = h.interviews.latestFor(HANDED_OFF);
    if (handedOff?.step !== "handed-off") throw new Error("the test Interview is not handed off");
    const abandoned: Abandoned = {
      step: "abandoned",
      id: handedOff.id,
      memberId: HANDED_OFF,
      threadId: handedOff.threadId,
      failedAttempts: 0,
      startedAt: handedOff.startedAt,
      endedAt: NOW,
      reason: "timed-out",
    };
    h.interviews.save(abandoned);

    const button = await press(h, confirm, OFFICER);

    expect(privateAnswersOf(button)).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("abandoned");
    expect(h.channels.logs).toEqual([]);
    expect(h.nameAndRoles.linked).toEqual([]);
  });

  test("Confirm after the Member left the server is refused privately, and stores nothing", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    h.onServer.delete(HANDED_OFF);

    const button = await press(h, confirm, OFFICER);

    expect(privateAnswersOf(button)).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.channels.logs).toEqual([]);
    expect(h.nameAndRoles.linked).toEqual([]);
  });

  test("Confirm after the confirmation expired is refused privately, and stores nothing", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);
    h.now = NOW_PLUS_30_MINUTES;

    const button = await press(h, confirm, OFFICER);

    expect(privateAnswersOf(button)).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("handed-off");
    expect(h.channels.logs).toEqual([]);
  });

  test("Cancel stores nothing, logs nothing, and leaves the Interview handed off", async () => {
    const { cancel } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    await press(h, cancel, OFFICER);

    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("handed-off");
    expect(h.channels.logs).toEqual([]);
    expect(h.channels.posts).toEqual([]);
    expect(h.nameAndRoles.linked).toEqual([]);
  });

  test("a Confirm pressed by another user is refused privately, and the Link is not made", async () => {
    const { confirm } = await openCard(h, OFFICER, HANDED_OFF, FOUND_UID);

    const button = await press(h, confirm, NOT_OFFICER_LINKED);

    expect(privateAnswersOf(button)).toEqual([expect.objectContaining({ flags: MessageFlags.Ephemeral })]);
    expect(h.links.linkFor(HANDED_OFF)).toBeUndefined();
    expect(h.interviews.latestFor(HANDED_OFF)?.step).toBe("handed-off");
    expect(h.channels.logs).toEqual([]);
  });
});
