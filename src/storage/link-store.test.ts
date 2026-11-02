import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link, RankOnLink } from "../domain/link.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import { MAX_FAILED_ATTEMPTS, type HandedOff, type OnboardingInterview } from "../domain/onboarding-interview.js";
import {
  approve,
  cancel,
  type ApprovableRank,
  type Approver,
  type MemberId,
  type RankApproval,
} from "../domain/rank-approval.js";
import { AppliedStore, type AppliedState } from "./applied-store.js";
import { openDatabase } from "./database.js";
import { InterviewStore } from "./interview-store.js";
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
const OFFICER = "555555555555555555";
const ALICE_UID = uidOf("145563254785");
const BOB_UID = uidOf("145563254786");
const CAROL_UID = uidOf("145563254787");
const LINKED_AT = new Date("2026-10-30T12:00:00Z");
const ASKED_AT = new Date("2026-10-30T12:05:00Z");
const SETTLED_AT = new Date("2026-10-30T13:00:00Z");
const INTERVIEW_TIMEOUT_MS = 1440 * 60 * 1000;

function linkOf(memberId: MemberId, uid: Uid, allianceRank: RankOnLink = { source: "no-alliance" }): Link {
  return { memberId, uid, linkedAt: LINKED_AT, allianceRank, madeBy: { kind: "in-game-proof" } };
}

/** An Officer Link: made by an Officer from a uid, with no In-game Proof. */
function officerLinkOf(memberId: MemberId, uid: Uid): Link {
  return {
    memberId,
    uid,
    linkedAt: LINKED_AT,
    allianceRank: { source: "no-alliance" },
    madeBy: { kind: "officer-link", officerId: OFFICER },
  };
}

/** The Officer's Rank Approval on a Link, as the domain gives it: the rank, approved by the Officer at SETTLED_AT. */
function officerRankOf(rank: ApprovableRank): Extract<RankOnLink, { readonly source: "rank-approval" }> {
  return { source: "rank-approval", rank, approvedBy: OFFICER, approvedAt: SETTLED_AT };
}

/** Creates an open Interview for the Member and moves it to handed-off, as after five failed attempts. */
function storeHandedOff(interviews: InterviewStore, memberId: MemberId): HandedOff {
  const created = interviews.create({ memberId, threadId: `thread-of-${memberId}` }, ASKED_AT);
  if (created.kind !== "created") throw new Error("the test Interview was not created");
  const handedOff: HandedOff = {
    step: "handed-off",
    id: created.interview.id,
    memberId,
    threadId: created.interview.threadId,
    failedAttempts: MAX_FAILED_ATTEMPTS,
    startedAt: created.interview.startedAt,
    endedAt: ASKED_AT,
  };
  interviews.save(handedOff);
  return handedOff;
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

function appliedStateOf(memberId: MemberId): AppliedState {
  return {
    memberId,
    nickname: "[NML] Rogue",
    roles: ["NML", "T3"],
    appliedAt: new Date("2026-10-30T12:01:00Z"),
    complete: true,
  };
}

/** Confirms a Link with a pending Rank Approval that goes to the given approver; the test fails when it is not confirmed. */
function confirmPending(store: LinkStore, memberId: MemberId, uid: Uid, approver: Approver): RankApproval {
  const outcome = store.confirm(
    {
      link: linkOf(memberId, uid, { source: "unknown" }),
      rankApproval: { ...pendingDraft(memberId), approver },
    },
    () => undefined,
  );
  if (outcome.kind !== "linked" || outcome.rankApproval === undefined) {
    throw new Error("the Link with a Rank Approval was not confirmed");
  }
  return outcome.rankApproval;
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

  test("saveIfPending approves a pending Rank Approval and returns true", () => {
    const store = new LinkStore(db);
    const outcome = store.confirm(
      { link: linkOf(ALICE, ALICE_UID, { source: "unknown" }), rankApproval: pendingDraft(ALICE) },
      () => undefined,
    );
    if (outcome.kind !== "linked" || outcome.rankApproval === undefined) {
      throw new Error("the Link with a Rank Approval was not confirmed");
    }

    const saved = store.saveIfPending(approved(outcome.rankApproval, "R4", LEADER, new Date("2026-10-30T13:00:00Z")));

    expect(saved).toBe(true);
    expect(store.linkFor(ALICE)?.allianceRank).toMatchObject({ source: "rank-approval", rank: "R4" });
  });

  test("saveIfPending refuses a second approval of the same Rank Approval, writes nothing and keeps the first rank", () => {
    const store = new LinkStore(db);
    const outcome = store.confirm(
      { link: linkOf(ALICE, ALICE_UID, { source: "unknown" }), rankApproval: pendingDraft(ALICE) },
      () => undefined,
    );
    if (outcome.kind !== "linked" || outcome.rankApproval === undefined) {
      throw new Error("the Link with a Rank Approval was not confirmed");
    }
    const pending = outcome.rankApproval;
    const firstApproval = approved(pending, "R4", LEADER, new Date("2026-10-30T13:00:00Z"));
    expect(store.saveIfPending(firstApproval)).toBe(true);
    const secondApproval = approved(pending, "R2", CAROL, new Date("2026-10-30T13:05:00Z"));

    const saved = store.saveIfPending(secondApproval);

    expect(saved).toBe(false);
    expect(store.get(pending.id)).toMatchObject({ state: "approved", rank: "R4", approvedBy: LEADER });
    expect(store.linkFor(ALICE)?.allianceRank).toMatchObject({ source: "rank-approval", rank: "R4", approvedBy: LEADER });
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
  test("all lists every Link, in the order they were made", () => {
    const store = new LinkStore(db);
    const alice = linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R4" });
    const bob = linkOf(BOB, BOB_UID, { source: "unknown" });
    store.confirm({ link: alice }, () => undefined);
    store.confirm({ link: bob }, () => undefined);

    expect(store.all()).toEqual([alice, bob]);
  });

  test("updateRank replaces the rank on the Link and keeps its uid and linked time", () => {
    const store = new LinkStore(db);
    const alice = linkOf(ALICE, ALICE_UID, { source: "unknown" });
    store.confirm({ link: alice }, () => undefined);

    store.updateRank(ALICE, { source: "game-api", rank: "R4" });

    expect(store.linkFor(ALICE)).toEqual({ ...alice, allianceRank: { source: "game-api", rank: "R4" }, madeBy: { kind: "in-game-proof" } });
  });

  test("updateRank drops an approved rank to unknown when the Player is no longer in that Alliance", () => {
    const store = new LinkStore(db);
    const outcome = store.confirm(
      { link: linkOf(ALICE, ALICE_UID, { source: "unknown" }), rankApproval: pendingDraft(ALICE) },
      () => undefined,
    );
    if (outcome.kind !== "linked" || outcome.rankApproval === undefined) {
      throw new Error("the Link with a Rank Approval was not confirmed");
    }
    store.save(approved(outcome.rankApproval, "R3", LEADER, new Date("2026-10-31T10:00:00Z")));

    store.updateRank(ALICE, { source: "unknown" });

    expect(store.linkFor(ALICE)?.allianceRank).toEqual({ source: "unknown" });
  });

  test("unlink deletes the Link and its Applied State, and returns the removed Link", () => {
    const store = new LinkStore(db);
    const applied = new AppliedStore(db);
    const alice = linkOf(ALICE, ALICE_UID, { source: "game-api", rank: "R4" });
    store.confirm({ link: alice }, () => undefined);
    applied.record(appliedStateOf(ALICE));

    expect(store.unlink(ALICE)).toEqual(alice);

    expect(store.linkFor(ALICE)).toBeUndefined();
    expect(store.memberForUid(ALICE_UID)).toBeUndefined();
    expect(applied.get(ALICE)).toBeUndefined();
  });

  test("unlink frees the uid, so another Member can be Linked to the same Player", () => {
    const store = new LinkStore(db);
    store.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    store.unlink(ALICE);

    const outcome = store.confirm({ link: linkOf(BOB, ALICE_UID) }, () => undefined);

    expect(outcome).toEqual({ kind: "linked" });
    expect(store.memberForUid(ALICE_UID)).toBe(BOB);
  });

  test("a second unlink of the same Member returns undefined", () => {
    const store = new LinkStore(db);
    store.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    store.unlink(ALICE);

    expect(store.unlink(ALICE)).toBeUndefined();
  });

  test("unlink keeps the Rank Approvals of the Member, so they can still be read by id", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "officers" });

    store.unlink(ALICE);

    expect(store.get(pending.id)).toEqual(pending);
  });

  test("pendingApprovedBy lists the pending Rank Approvals whose approver is that Member", () => {
    const store = new LinkStore(db);
    const forLeader = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });
    confirmPending(store, BOB, BOB_UID, { kind: "officers" });
    confirmPending(store, CAROL, CAROL_UID, { kind: "member", memberId: BOB });

    expect(store.pendingApprovedBy(LEADER)).toEqual([forLeader]);
  });

  test("pendingApprovedBy leaves out Rank Approvals that have already ended", () => {
    const store = new LinkStore(db);
    const approvedOne = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });
    const cancelledOne = confirmPending(store, BOB, BOB_UID, { kind: "member", memberId: LEADER });
    const stillPending = confirmPending(store, CAROL, CAROL_UID, { kind: "member", memberId: LEADER });
    const cancelledChange = cancel(cancelledOne, new Date("2026-10-30T13:00:00Z"));
    if (!cancelledChange.ok) throw new Error("the test Rank Approval is not pending");
    store.save(approved(approvedOne, "R4", LEADER, new Date("2026-10-30T13:00:00Z")));
    store.save(cancelledChange.approval);

    expect(store.pendingApprovedBy(LEADER)).toEqual([stillPending]);
  });

  test("save hands a pending Rank Approval on to the Officers and keeps it pending", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });
    const handedOn: RankApproval = { ...pending, approver: { kind: "officers" } };

    store.save(handedOn);

    expect(store.get(pending.id)).toEqual(handedOn);
    expect(store.pendingFor(ALICE)).toEqual(handedOn);
  });

  test("handToOfficers hands a pending Rank Approval of that Member to the Officers and returns true", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });

    const handed = store.handToOfficers(pending.id, LEADER);

    expect(handed).toBe(true);
    expect(store.get(pending.id)).toEqual({ ...pending, approver: { kind: "officers" } });
  });

  test("handToOfficers returns false the second time, so a Rank Approval is handed on once", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });
    store.handToOfficers(pending.id, LEADER);

    expect(store.handToOfficers(pending.id, LEADER)).toBe(false);
    expect(store.get(pending.id)).toEqual({ ...pending, approver: { kind: "officers" } });
  });

  test("handToOfficers returns false for a Member who is not the approver, and writes nothing", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });

    expect(store.handToOfficers(pending.id, BOB)).toBe(false);
    expect(store.get(pending.id)).toEqual(pending);
  });

  test("handToOfficers returns false for a Rank Approval already with the Officers, and writes nothing", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "officers" });

    expect(store.handToOfficers(pending.id, LEADER)).toBe(false);
    expect(store.get(pending.id)).toEqual(pending);
  });

  test.each(["approved", "cancelled"] as const)(
    "handToOfficers returns false for a Rank Approval that is %s, and leaves it as it was",
    (ending) => {
      const store = new LinkStore(db);
      const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });
      const endedAt = new Date("2026-10-30T13:00:00Z");
      const ended = ending === "approved" ? approved(pending, "R4", LEADER, endedAt) : cancelOf(pending, endedAt);
      store.save(ended);

      expect(store.handToOfficers(pending.id, LEADER)).toBe(false);
      expect(store.get(pending.id)).toEqual(ended);
    },
  );

  test("an Officer Link is stored with its Officer and reads back as made by that Officer", () => {
    const store = new LinkStore(db);
    const link = officerLinkOf(ALICE, ALICE_UID);

    store.confirm({ link }, () => undefined);

    expect(store.linkFor(ALICE)).toEqual(link);
    expect(store.linkFor(ALICE)?.madeBy).toEqual({ kind: "officer-link", officerId: OFFICER });
  });

  test("a Link whose linked_by is NULL, as every Link before the migration, reads as made from In-game Proof", () => {
    const store = new LinkStore(db);
    db.prepare("INSERT INTO link (member_id, uid, linked_at, rank_source, linked_by) VALUES (?, ?, ?, ?, ?)").run(
      ALICE,
      ALICE_UID,
      LINKED_AT.toISOString(),
      "no-alliance",
      null,
    );

    expect(store.linkFor(ALICE)?.madeBy).toEqual({ kind: "in-game-proof" });
  });

  test("rankByOfficer replaces the rank with the Officer's and settles the pending Rank Approval as approved by the Officer", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "member", memberId: LEADER });

    const settled = store.rankByOfficer(ALICE, officerRankOf("R3"), SETTLED_AT);

    expect(settled).toEqual(approved(pending, "R3", OFFICER, SETTLED_AT));
    expect(store.get(pending.id)).toEqual(settled);
    expect(store.linkFor(ALICE)?.allianceRank).toEqual({
      source: "rank-approval",
      rank: "R3",
      approvedBy: OFFICER,
      approvedAt: SETTLED_AT,
    });
    expect(store.pendingFor(ALICE)).toBeUndefined();
  });

  test("rankByOfficer returns undefined when no Rank Approval is pending, and still replaces an earlier approved rank", () => {
    const store = new LinkStore(db);
    const pending = confirmPending(store, ALICE, ALICE_UID, { kind: "officers" });
    store.save(approved(pending, "R4", LEADER, new Date("2026-10-30T12:30:00Z")));

    expect(store.rankByOfficer(ALICE, officerRankOf("R2"), SETTLED_AT)).toBeUndefined();

    expect(store.linkFor(ALICE)?.allianceRank).toEqual({
      source: "rank-approval",
      rank: "R2",
      approvedBy: OFFICER,
      approvedAt: SETTLED_AT,
    });
  });

  test("rankByOfficer settles only the pending Rank Approval of that Link", () => {
    const store = new LinkStore(db);
    confirmPending(store, ALICE, ALICE_UID, { kind: "officers" });
    const other = confirmPending(store, BOB, BOB_UID, { kind: "officers" });

    store.rankByOfficer(ALICE, officerRankOf("R3"), SETTLED_AT);

    expect(store.pendingFor(BOB)).toEqual(other);
  });

  test("confirm of an Officer Link stores it and saves its handed-off Interview as linked, in one transaction", () => {
    const store = new LinkStore(db);
    const interviews = new InterviewStore(db, INTERVIEW_TIMEOUT_MS);
    const handedOff = storeHandedOff(interviews, BOB);
    const linkedInterview: OnboardingInterview = {
      step: "linked",
      id: handedOff.id,
      memberId: BOB,
      threadId: handedOff.threadId,
      failedAttempts: 0,
      startedAt: handedOff.startedAt,
      endedAt: SETTLED_AT,
      uid: BOB_UID,
    };
    const link = officerLinkOf(BOB, BOB_UID);

    const outcome = store.confirm({ link }, () => {
      if (!interviews.saveIfStep(linkedInterview, "handed-off")) throw new Error("the Interview moved on");
    });

    expect(outcome).toEqual({ kind: "linked" });
    expect(store.linkFor(BOB)).toEqual(link);
    expect(interviews.get(handedOff.id)?.step).toBe("linked");
  });

  test("confirm of an Officer Link whose Interview is no longer handed off stores nothing", () => {
    const store = new LinkStore(db);
    const interviews = new InterviewStore(db, INTERVIEW_TIMEOUT_MS);
    const created = interviews.create({ memberId: BOB, threadId: "thread-of-bob" }, ASKED_AT);
    if (created.kind !== "created") throw new Error("the test Interview was not created");
    const stillOpen = created.interview;
    const linkedInterview: OnboardingInterview = {
      step: "linked",
      id: stillOpen.id,
      memberId: BOB,
      threadId: stillOpen.threadId,
      failedAttempts: 0,
      startedAt: stillOpen.startedAt,
      endedAt: SETTLED_AT,
      uid: BOB_UID,
    };

    expect(() =>
      store.confirm({ link: officerLinkOf(BOB, BOB_UID) }, () => {
        if (!interviews.saveIfStep(linkedInterview, "handed-off")) throw new Error("the Interview moved on");
      }),
    ).toThrow("the Interview moved on");

    expect(store.linkFor(BOB)).toBeUndefined();
    expect(store.memberForUid(BOB_UID)).toBeUndefined();
    expect(interviews.get(stillOpen.id)?.step).toBe("recommending");
  });

  test("confirm of an Officer Link for a uid already Linked to another Member gives already-linked and writes nothing", () => {
    const store = new LinkStore(db);
    const interviews = new InterviewStore(db, INTERVIEW_TIMEOUT_MS);
    store.confirm({ link: linkOf(ALICE, ALICE_UID) }, () => undefined);
    const handedOff = storeHandedOff(interviews, BOB);
    let saves = 0;

    const outcome = store.confirm({ link: officerLinkOf(BOB, ALICE_UID) }, () => {
      saves += 1;
    });

    expect(outcome).toEqual({ kind: "already-linked" });
    expect(saves).toBe(0);
    expect(store.linkFor(BOB)).toBeUndefined();
    expect(interviews.get(handedOff.id)).toEqual(handedOff);
  });
});

/** Cancels a pending Rank Approval; the test fails loudly when it is not pending. */
function cancelOf(approval: RankApproval, at: Date): RankApproval {
  const change = cancel(approval, at);
  if (!change.ok) throw new Error("the test Rank Approval is not pending");
  return change.approval;
}
