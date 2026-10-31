import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Link } from "../domain/link.js";
import type { Player } from "../domain/player.js";
import type { Approver, MemberId, RankApproval } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { LinkStore } from "../storage/link-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import {
  rankAskedMessage,
  rankApprovedMessage,
  rankNotAllowedReply,
  rankSetLogLine,
  type OfficerRoles,
  type PrivateReply,
} from "./interview-texts.js";
import { createRankApprovals, type RankButtonLike } from "./rank-approval.js";

type PendingApproval = Extract<RankApproval, { readonly state: "pending" }>;
type ApprovedApproval = Extract<RankApproval, { readonly state: "approved" }>;

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
const OFFICERS: OfficerRoles = { moderatorRoleId: "333333333333333333", kingRoleId: "444444444444444444" };

const MEMBER: MemberId = "111111111111111111";
const OTHER: MemberId = "222222222222222222";
const OFFICER: MemberId = "555555555555555555";
const LEADER: MemberId = "777777777777777777";
const THREAD = "666666666666666666";
const UID = uidOf("145563254785");
const LEADER_UID = uidOf("145563254700");

const LINKED_UNKNOWN: Link = {
  memberId: MEMBER,
  uid: UID,
  linkedAt: NOW,
  allianceRank: { source: "unknown" },
};

const PLAYER_UNKNOWN: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  power: 15_902_728,
  sanctuaryLevel: 42,
  alliance: { tag: "NML", name: "Neil's Men", leaderUid: LEADER_UID },
  allianceRank: "unknown",
};

/** The onboarding channels as Rank Approvals use them: records every thread, post, archive and log call. */
class FakeChannels implements OnboardingChannels {
  readonly added: { readonly threadId: string; readonly memberId: string }[] = [];
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly archived: string[] = [];
  readonly logs: BaseMessageOptions[] = [];
  private posted = 0;

  openThread(): Promise<string> {
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

  addToThread(threadId: string, memberId: string): Promise<void> {
    this.added.push({ threadId, memberId });
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

/** A rank button press that records its private replies and the updates to the pressed message. */
class FakeRankButton implements RankButtonLike {
  readonly replies: PrivateReply[] = [];
  readonly updates: BaseMessageOptions[] = [];

  constructor(
    readonly customId: string,
    readonly user: { readonly id: string },
  ) {}

  reply(message: PrivateReply): Promise<void> {
    this.replies.push(message);
    return Promise.resolve();
  }

  update(options: BaseMessageOptions): Promise<void> {
    this.updates.push(options);
    return Promise.resolve();
  }
}

interface Harness {
  readonly links: LinkStore;
  readonly channels: FakeChannels;
  readonly roles: Map<MemberId, readonly string[]>;
  readonly errors: string[];
  readonly service: ReturnType<typeof createRankApprovals>;
}

/** The Link of the Member is stored with an unknown rank, and a pending Rank Approval for it is stored with the approver. */
function linkWithPendingApproval(h: Harness, approver: Approver): PendingApproval {
  const outcome = h.links.confirm(
    {
      link: LINKED_UNKNOWN,
      rankApproval: { state: "pending", linkedMemberId: MEMBER, threadId: THREAD, approver, askedAt: NOW },
    },
    () => undefined,
  );
  const approval = outcome.kind === "linked" ? outcome.rankApproval : undefined;
  if (approval?.state !== "pending") throw new Error("the test Rank Approval was not stored");
  return approval;
}

/** The approved Rank Approval as the store holds it after a press. */
function storedApproved(h: Harness, approvalId: number): ApprovedApproval {
  const stored = h.links.get(approvalId);
  if (stored?.state !== "approved") throw new Error("the test Rank Approval is not approved");
  return stored;
}

function rankPress(approvalId: number, rank: "R1" | "R2" | "R3" | "R4" | "R5", memberId: MemberId): FakeRankButton {
  return new FakeRankButton(`rank:${approvalId.toString()}:${rank}`, { id: memberId });
}

describe("createRankApprovals", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let h: Harness;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-rank-approval-"));
    db = openDatabase(dataDir);
    const links = new LinkStore(db);
    const channels = new FakeChannels();
    const roles = new Map<MemberId, readonly string[]>([[OFFICER, [OFFICERS.moderatorRoleId]]]);
    const errors: string[] = [];
    const service = createRankApprovals({
      links,
      channels,
      officerRoles: OFFICERS,
      memberRoleIdsOf: (memberId: MemberId) => Promise.resolve(roles.get(memberId) ?? []),
      now: () => NOW,
      logError: (line: string) => {
        errors.push(line);
      },
    });
    h = { links, channels, roles, errors, service };
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("when a Rank Approval is asked", () => {
    test("adds the leader's Member to the thread and asks them with the rank buttons", async () => {
      const approval = linkWithPendingApproval(h, { kind: "member", memberId: LEADER });

      await h.service.announce(approval, PLAYER_UNKNOWN);

      expect(h.channels.added).toEqual([{ threadId: THREAD, memberId: LEADER }]);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: rankAskedMessage(approval, PLAYER_UNKNOWN, OFFICERS) }]);
    });

    test("asks the Officers without adding anyone to the thread", async () => {
      const approval = linkWithPendingApproval(h, { kind: "officers" });

      await h.service.announce(approval, PLAYER_UNKNOWN);

      expect(h.channels.added).toEqual([]);
      expect(h.channels.posts).toEqual([{ threadId: THREAD, message: rankAskedMessage(approval, PLAYER_UNKNOWN, OFFICERS) }]);
    });
  });

  describe("a press on a rank button", () => {
    test("stores the rank on the Link, with the approver and the time", async () => {
      const approval = linkWithPendingApproval(h, { kind: "officers" });
      await h.service.announce(approval, PLAYER_UNKNOWN);

      await h.service.onButton(rankPress(approval.id, "R3", OFFICER));

      expect(h.links.linkFor(MEMBER)?.allianceRank).toEqual({
        source: "rank-approval",
        rank: "R3",
        approvedBy: OFFICER,
        approvedAt: NOW,
      });
      expect(h.links.get(approval.id)).toMatchObject({ state: "approved", rank: "R3", approvedBy: OFFICER });
    });

    test("removes the buttons from the asked message", async () => {
      const approval = linkWithPendingApproval(h, { kind: "officers" });
      await h.service.announce(approval, PLAYER_UNKNOWN);
      const button = rankPress(approval.id, "R3", OFFICER);

      await h.service.onButton(button);

      expect(button.updates).toHaveLength(1);
      expect(button.updates[0]?.components).toEqual([]);
    });

    test("posts the approved message in the thread and archives the thread", async () => {
      const approval = linkWithPendingApproval(h, { kind: "officers" });
      await h.service.announce(approval, PLAYER_UNKNOWN);

      await h.service.onButton(rankPress(approval.id, "R3", OFFICER));

      expect(h.channels.posts.at(-1)).toEqual({
        threadId: THREAD,
        message: rankApprovedMessage(storedApproved(h, approval.id)),
      });
      expect(h.channels.archived).toEqual([THREAD]);
    });

    test("logs the rank set by the approver", async () => {
      const approval = linkWithPendingApproval(h, { kind: "officers" });
      await h.service.announce(approval, PLAYER_UNKNOWN);

      await h.service.onButton(rankPress(approval.id, "R3", OFFICER));

      expect(h.channels.logs).toEqual([rankSetLogLine(OFFICER, MEMBER, "R3")]);
    });

    test("lets the leader's Member approve when they are the chosen approver", async () => {
      const approval = linkWithPendingApproval(h, { kind: "member", memberId: LEADER });
      await h.service.announce(approval, PLAYER_UNKNOWN);

      await h.service.onButton(rankPress(approval.id, "R2", LEADER));

      expect(h.links.linkFor(MEMBER)?.allianceRank).toEqual({
        source: "rank-approval",
        rank: "R2",
        approvedBy: LEADER,
        approvedAt: NOW,
      });
    });

    test("refuses an Officer when a Member was asked to approve, and Officers are not asked", async () => {
      const approval = linkWithPendingApproval(h, { kind: "member", memberId: LEADER });
      await h.service.announce(approval, PLAYER_UNKNOWN);
      const button = rankPress(approval.id, "R3", OFFICER);

      await h.service.onButton(button);

      expect(button.replies).toEqual([rankNotAllowedReply()]);
      expect(h.links.get(approval.id)).toMatchObject({ state: "pending" });
      expect(h.links.linkFor(MEMBER)?.allianceRank).toEqual({ source: "unknown" });
      expect(h.channels.added).toEqual([{ threadId: THREAD, memberId: LEADER }]);
      expect(h.channels.logs).toEqual([]);
    });

    test("refuses the Linked Member even when they are an Officer, and changes nothing", async () => {
      h.roles.set(MEMBER, [OFFICERS.kingRoleId]);
      const approval = linkWithPendingApproval(h, { kind: "officers" });
      await h.service.announce(approval, PLAYER_UNKNOWN);
      const button = rankPress(approval.id, "R5", MEMBER);

      await h.service.onButton(button);

      expect(button.replies).toEqual([rankNotAllowedReply()]);
      expect(button.updates).toEqual([]);
      expect(h.links.get(approval.id)).toMatchObject({ state: "pending" });
      expect(h.links.linkFor(MEMBER)?.allianceRank).toEqual({ source: "unknown" });
      expect(h.channels.archived).toEqual([]);
      expect(h.channels.logs).toEqual([]);
    });

    test("refuses a Member who is not an Officer, and changes nothing", async () => {
      const approval = linkWithPendingApproval(h, { kind: "officers" });
      await h.service.announce(approval, PLAYER_UNKNOWN);
      const button = rankPress(approval.id, "R1", OTHER);

      await h.service.onButton(button);

      expect(button.replies).toEqual([rankNotAllowedReply()]);
      expect(h.links.get(approval.id)).toMatchObject({ state: "pending" });
      expect(h.links.linkFor(MEMBER)?.allianceRank).toEqual({ source: "unknown" });
      expect(h.channels.logs).toEqual([]);
    });

    test("refuses a press on a Rank Approval that is already approved, and keeps the first rank", async () => {
      const approval = linkWithPendingApproval(h, { kind: "officers" });
      await h.service.announce(approval, PLAYER_UNKNOWN);
      await h.service.onButton(rankPress(approval.id, "R3", OFFICER));
      const again = rankPress(approval.id, "R4", OFFICER);

      await h.service.onButton(again);

      expect(again.replies).toEqual([rankNotAllowedReply()]);
      expect(h.links.linkFor(MEMBER)?.allianceRank).toMatchObject({ source: "rank-approval", rank: "R3" });
    });
  });
});
