import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link, RankOnLink } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import { approve, type ApprovableRank, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import { openDatabase } from "./database.js";
import { LinkStore } from "./link-store.js";

type PendingRankApprovalDraft = Omit<Extract<RankApproval, { readonly state: "pending" }>, "id">;

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const CAROL = "333333333333333333";
const LEADER = "444444444444444444";
const ALICE_UID = uidOf("145563254785");
const BOB_UID = uidOf("145563254786");
const CAROL_UID = uidOf("145563254787");
const LINKED_AT = new Date("2026-10-30T12:00:00Z");
const ASKED_AT = new Date("2026-10-30T12:05:00Z");

function linkOf(memberId: MemberId, uid: Uid, allianceRank: RankOnLink = { source: "no-alliance" }): Link {
  return { memberId, uid, linkedAt: LINKED_AT, allianceRank };
}

function pendingDraft(linkedMemberId: MemberId): PendingRankApprovalDraft {
  return {
    state: "pending",
    linkedMemberId,
    threadId: `thread-of-${linkedMemberId}`,
    approver: { kind: "officers" },
    askedAt: ASKED_AT,
  };
}

/** Approves a pending Rank Approval; the test fails loudly when it is not pending. */
function approved(approval: RankApproval, rank: ApprovableRank, by: MemberId, at: Date): RankApproval {
  const change = approve(approval, rank, by, at);
  if (!change.ok) throw new Error("the test Rank Approval is not pending");
  return change.approval;
}

describe("LinkStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-links-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("finds no Link for an unknown Member or uid", () => {
    const store = new LinkStore(db);

    expect(store.linkFor(ALICE)).toBeUndefined();
    expect(store.memberForUid(ALICE_UID)).toBeUndefined();
  });

  test("confirm inserts the Link and runs saveInterview, then the Link is found by Member and by uid", () => {
    const store = new LinkStore(db);
    const link = linkOf(ALICE, ALICE_UID);
    let saves = 0;

    const outcome = store.confirm({ link }, () => {
      saves += 1;
    });

    expect(outcome).toEqual({ kind: "linked" });
    expect(saves).toBe(1);
    expect(store.linkFor(ALICE)).toEqual(link);
    expect(store.memberForUid(ALICE_UID)).toBe(ALICE);
  });

  test("confirm keeps the Alliance Rank the Game API gave", () => {
    const store = new LinkStore(db);
    const link = linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R3" });

    store.confirm({ link }, () => undefined);

    expect(store.linkFor(ALICE)).toEqual(link);
  });

  test("confirm stores a pending Rank Approval and returns it with its id", () => {
    const store = new LinkStore(db);

    const outcome = store.confirm(
      { link: linkOf(ALICE, ALICE_UID, { source: "unknown" }), rankApproval: pendingDraft(ALICE) },
      () => undefined,
    );

    if (outcome.kind !== "linked" || outcome.rankApproval === undefined) {
      throw new Error("the Link with a Rank Approval was not confirmed");
    }
    expect(outcome.rankApproval).toEqual({ ...pendingDraft(ALICE), id: outcome.rankApproval.id });
    expect(Number.isInteger(outcome.rankApproval.id)).toBe(true);
    expect(store.pendingFor(ALICE)).toEqual(outcome.rankApproval);
  });

  test("confirm refuses a Member who already has a Link, writing nothing", () => {
    const store = new LinkStore(db);
    const first = linkOf(ALICE, ALICE_UID);
    store.confirm({ link: first }, () => undefined);
    let saves = 0;

    const outcome = store.confirm(
      { link: linkOf(ALICE, BOB_UID, { source: "unknown" }), rankApproval: pendingDraft(ALICE) },
      () => {
        saves += 1;
      },
    );

    expect(outcome).toEqual({ kind: "already-linked" });
    expect(saves).toBe(0);
    expect(store.linkFor(ALICE)).toEqual(first);
    expect(store.memberForUid(BOB_UID)).toBeUndefined();
    expect(store.pendingFor(ALICE)).toBeUndefined();
  });

  test("confirm refuses a uid another Member already holds, writing nothing", () => {
    const store = new LinkStore(db);
    store.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    let saves = 0;

    const outcome = store.confirm({ link: linkOf(BOB, ALICE_UID) }, () => {
      saves += 1;
    });

    expect(outcome).toEqual({ kind: "already-linked" });
    expect(saves).toBe(0);
    expect(store.linkFor(BOB)).toBeUndefined();
    expect(store.memberForUid(ALICE_UID)).toBe(ALICE);
  });

  test("a throwing saveInterview rolls back the Link and the Rank Approval", () => {
    const store = new LinkStore(db);

    expect(() =>
      store.confirm({ link: linkOf(CAROL, CAROL_UID, { source: "unknown" }), rankApproval: pendingDraft(CAROL) }, () => {
        throw new Error("the interview could not be saved");
      }),
    ).toThrow("the interview could not be saved");

    expect(store.linkFor(CAROL)).toBeUndefined();
    expect(store.memberForUid(CAROL_UID)).toBeUndefined();
    expect(store.pendingFor(CAROL)).toBeUndefined();
  });

  test("approving a Rank Approval writes the rank, the approver and the time onto the Link", () => {
    const store = new LinkStore(db);
    const outcome = store.confirm(
      { link: linkOf(ALICE, ALICE_UID, { source: "unknown" }), rankApproval: pendingDraft(ALICE) },
      () => undefined,
    );
    if (outcome.kind !== "linked" || outcome.rankApproval === undefined) {
      throw new Error("the Link with a Rank Approval was not confirmed");
    }
    const approvedAt = new Date("2026-10-30T13:00:00Z");

    store.save(approved(outcome.rankApproval, "R4", LEADER, approvedAt));

    expect(store.linkFor(ALICE)?.allianceRank).toEqual({
      source: "rank-approval",
      rank: "R4",
      approvedBy: LEADER,
      approvedAt,
    });
    expect(store.pendingFor(ALICE)).toBeUndefined();
  });

  test("deleteEndedBefore removes Rank Approvals ended before the cutoff and keeps the rest", () => {
    const store = new LinkStore(db);
    const oldOutcome = store.confirm(
      { link: linkOf(ALICE, ALICE_UID, { source: "unknown" }), rankApproval: pendingDraft(ALICE) },
      () => undefined,
    );
    const recentOutcome = store.confirm(
      { link: linkOf(BOB, BOB_UID, { source: "unknown" }), rankApproval: pendingDraft(BOB) },
      () => undefined,
    );
    const pendingOutcome = store.confirm(
      { link: linkOf(CAROL, CAROL_UID, { source: "unknown" }), rankApproval: pendingDraft(CAROL) },
      () => undefined,
    );
    if (
      oldOutcome.kind !== "linked" ||
      oldOutcome.rankApproval === undefined ||
      recentOutcome.kind !== "linked" ||
      recentOutcome.rankApproval === undefined ||
      pendingOutcome.kind !== "linked" ||
      pendingOutcome.rankApproval === undefined
    ) {
      throw new Error("the Links with Rank Approvals were not confirmed");
    }
    const oldApproval = oldOutcome.rankApproval;
    const recentApproval = recentOutcome.rankApproval;
    store.save(approved(oldApproval, "R2", LEADER, new Date("2026-01-10T10:00:00Z")));
    store.save(approved(recentApproval, "R5", LEADER, new Date("2026-10-30T10:00:00Z")));

    store.deleteEndedBefore(new Date("2026-08-02T00:00:00Z"));

    expect(store.get(oldApproval.id)).toBeUndefined();
    expect(store.get(recentApproval.id)).toMatchObject({ state: "approved", rank: "R5" });
    expect(store.pendingFor(CAROL)).toEqual(pendingOutcome.rankApproval);
    expect(store.linkFor(ALICE)).toBeDefined();
  });
});
