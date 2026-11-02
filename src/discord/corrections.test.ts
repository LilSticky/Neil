import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageFlags, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link, RankOnLink } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { LinkStore } from "../storage/link-store.js";
import { FakeNameAndRoles } from "./__fakes__/name-and-roles.js";
import { FakeUnlink } from "./__fakes__/unlink.js";
import { handleRank, handleUnlink, type CorrectionInteraction } from "./corrections.js";
import type { Message, OfficerRoles, PrivateReply } from "./interview-texts.js";
import { rankSetLogLine } from "./interview-texts.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

const NOW = new Date("2026-11-02T10:00:00Z");
const OFFICERS: OfficerRoles = { moderatorRoleId: "900000000000000001", kingRoleId: "900000000000000002" };
const MEMBER_ROLE_ID = "900000000000000003";
const OFFICER_ROLE_IDS = [OFFICERS.moderatorRoleId];

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

/** The channels a /rank posts to and logs in: records every thread post and log line. */
class FakeChannels {
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly logs: BaseMessageOptions[] = [];

  post(threadId: string, message: BaseMessageOptions): Promise<string> {
    this.posts.push({ threadId, message });
    return Promise.resolve(`message-${this.posts.length.toString()}`);
  }

  log(message: BaseMessageOptions): Promise<void> {
    this.logs.push(message);
    return Promise.resolve();
  }
}

interface Harness {
  readonly links: LinkStore;
  readonly interviews: InterviewStore;
  readonly unlink: FakeUnlink;
  readonly channels: FakeChannels;
  readonly nameAndRoles: FakeNameAndRoles;
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
    links,
    interviews,
    unlink: new FakeUnlink(links),
    channels: new FakeChannels(),
    nameAndRoles: new FakeNameAndRoles(),
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

  test("settles the pending Rank Approval of that Link, and says in its thread the rank an Officer set", async () => {
    linkWithPendingApproval(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.channels.posts).toHaveLength(1);
    expect(h.channels.posts[0]?.threadId).toBe(THREAD);
    expect(contentOf(h.channels.posts[0]?.message)).toBe(`<@${OFFICER}> set <@${LINKED}>'s rank to R4.`);
  });

  test("posts in no thread when the Link has no pending Rank Approval", async () => {
    linkMember(h, LINKED, LINKED_UID, UNKNOWN_RANK);
    const interaction = new FakeCorrectionInteraction(OFFICER, OFFICER_ROLE_IDS, { member: LINKED, rank: "R4" });

    await handleRank(interaction, deps);

    expect(h.channels.posts).toEqual([]);
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
});
