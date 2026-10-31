import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import {
  giveUid,
  memberLeft,
  uidChecked,
  type AwaitingUid,
  type OnboardingInterview,
} from "../domain/onboarding-interview.js";
import { approve, cancel, type MemberId, type RankApproval } from "../domain/rank-approval.js";
import { openDatabase } from "../storage/database.js";
import { InterviewStore } from "../storage/interview-store.js";
import { LinkStore } from "../storage/link-store.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import { abandonedLogLine, askUidMessage, quotaResetMessage, timedOutMessage } from "./interview-texts.js";
import { createSweeper, startSweeper } from "./interview-sweeper.js";

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

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SWEEP_EVERY_MS = 60_000;

const NOW = new Date("2026-10-31T10:00:00Z");
const TIMEOUT_MS = 1440 * MINUTE_MS;
const OVERDUE_START = new Date(NOW.getTime() - TIMEOUT_MS - MINUTE_MS);

const MEMBER: MemberId = "111111111111111111";
const OTHER: MemberId = "222222222222222222";
const THREAD = "666666666666666666";
const OTHER_THREAD = "666666666666666667";
const UID_DIGITS = "145563254785";
const UID = uidOf(UID_DIGITS);
const OTHER_UID = uidOf("145563254786");

const PLAYER: Player = {
  uid: UID,
  name: "Vex",
  kingdom: kingdomOf(330),
  power: 15_902_728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

function daysBefore(when: Date, days: number): Date {
  return new Date(when.getTime() - days * DAY_MS);
}

/** The onboarding channels as the sweeper uses them: records posts, locks and log lines, and can refuse a thread. */
class FakeChannels implements OnboardingChannels {
  readonly posts: { readonly threadId: string; readonly message: BaseMessageOptions }[] = [];
  readonly lockedAndArchived: string[] = [];
  readonly logs: BaseMessageOptions[] = [];
  readonly failingThreads = new Set<string>();
  private posted = 0;

  openThread(): Promise<string> {
    return Promise.reject(new Error("the sweeper does not open threads"));
  }

  post(threadId: string, message: BaseMessageOptions): Promise<string> {
    if (this.failingThreads.has(threadId)) {
      return Promise.reject(new Error(`Discord refused the post to ${threadId}`));
    }
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

  deleteThread(): Promise<void> {
    return Promise.resolve();
  }

  lockAndArchive(threadId: string): Promise<void> {
    this.lockedAndArchived.push(threadId);
    return Promise.resolve();
  }

  archive(): Promise<void> {
    return Promise.resolve();
  }

  log(message: BaseMessageOptions): Promise<void> {
    this.logs.push(message);
    return Promise.resolve();
  }
}

/** Opens an Interview for the Member at the given time; the store gives it its id. */
function openAwaitingUid(interviews: InterviewStore, memberId: MemberId, threadId: string, startedAt: Date): AwaitingUid {
  const outcome = interviews.create({ memberId, threadId }, startedAt);
  if (outcome.kind !== "created") throw new Error(`the test Member ${memberId} already has an open Interview`);
  return outcome.interview;
}

/** Opens an Interview for the Member and pauses it for the Daily Quota until resumesAt. Returns the paused Interview. */
function pausedForQuota(
  interviews: InterviewStore,
  memberId: MemberId,
  threadId: string,
  startedAt: Date,
  resumesAt: Date,
): OnboardingInterview {
  const asked = openAwaitingUid(interviews, memberId, threadId, startedAt);
  const checking = giveUid(asked, UID_DIGITS, startedAt).interview;
  const paused = uidChecked(checking, { kind: "quota-spent", resetsAt: resumesAt }, startedAt).interview;
  if (paused.step !== "paused-for-quota") throw new Error(`the test Member ${memberId} is not paused for the Daily Quota`);
  interviews.save(paused);
  return paused;
}

/** Opens a Link for the Member with a pending Rank Approval, and returns that pending Rank Approval. */
function pendingApprovalFor(
  links: LinkStore,
  memberId: MemberId,
  uid: Uid,
  askedAt: Date,
): Extract<RankApproval, { readonly state: "pending" }> {
  links.confirm(
    {
      link: { memberId, uid, linkedAt: askedAt, allianceRank: { source: "unknown" } },
      rankApproval: {
        state: "pending",
        linkedMemberId: memberId,
        threadId: THREAD,
        approver: { kind: "officers" },
        askedAt,
      },
    },
    () => undefined,
  );
  const pending = links.pendingFor(memberId);
  if (pending === undefined || pending.state !== "pending") {
    throw new Error(`the test Member ${memberId} has no pending Rank Approval`);
  }
  return pending;
}

describe("createSweeper", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let clock: Date;
  let interviews: InterviewStore;
  let links: LinkStore;
  let channels: FakeChannels;
  let errors: string[];
  let sweeper: ReturnType<typeof createSweeper>;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-interview-sweeper-"));
    db = openDatabase(dataDir);
    clock = NOW;
    interviews = new InterviewStore(db, TIMEOUT_MS);
    links = new LinkStore(db);
    channels = new FakeChannels();
    errors = [];
    sweeper = createSweeper({
      interviews,
      links,
      channels,
      timeoutMs: TIMEOUT_MS,
      now: () => clock,
      logError: (line: string) => {
        errors.push(line);
      },
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("an awaiting Interview past its deadline", () => {
    test("is abandoned as timed out: the timeout message is posted, the thread locked and archived, the log says so", async () => {
      const interview = openAwaitingUid(interviews, MEMBER, THREAD, OVERDUE_START);

      await sweeper.sweep();

      expect(channels.posts).toEqual([{ threadId: THREAD, message: timedOutMessage(TIMEOUT_MS) }]);
      expect(channels.lockedAndArchived).toEqual([THREAD]);
      expect(channels.logs).toEqual([abandonedLogLine(MEMBER, "timed-out")]);
      expect(interviews.get(interview.id)).toMatchObject({
        step: "abandoned",
        reason: "timed-out",
        endedAt: NOW,
      });
    });

    test("is left untouched while its deadline has not come", async () => {
      const interview = openAwaitingUid(interviews, MEMBER, THREAD, NOW);
      const before = interviews.get(interview.id);

      await sweeper.sweep();

      expect(interviews.get(interview.id)).toEqual(before);
      expect(channels.posts).toEqual([]);
      expect(channels.lockedAndArchived).toEqual([]);
      expect(channels.logs).toEqual([]);
    });
  });

  describe("recovery after a restart", () => {
    test("asks a checking Interview for its uid again, counting no failed attempt", async () => {
      const asked = openAwaitingUid(interviews, MEMBER, THREAD, NOW);
      const typed = giveUid(asked, UID_DIGITS, NOW).interview;
      const afterFailure = uidChecked(typed, { kind: "not-found" }, NOW).interview;
      const checking = giveUid(afterFailure, UID_DIGITS, NOW).interview;
      interviews.save(checking);
      expect(interviews.get(asked.id)).toMatchObject({ step: "checking", failedAttempts: 1 });

      await sweeper.recover();

      expect(interviews.get(asked.id)).toMatchObject({
        step: "awaiting-uid",
        failedAttempts: 1,
        lastAskedAt: NOW,
      });
      expect(channels.posts).toEqual([{ threadId: THREAD, message: askUidMessage(asked.id, MEMBER) }]);
    });
  });

  describe("ended rows older than 90 days", () => {
    test("deletes Interviews ended more than 90 days ago and keeps newer ones", async () => {
      const old = openAwaitingUid(interviews, MEMBER, THREAD, daysBefore(NOW, 92));
      interviews.save(memberLeft(old, daysBefore(NOW, 91)).interview);
      const newer = openAwaitingUid(interviews, OTHER, OTHER_THREAD, daysBefore(NOW, 90));
      interviews.save(memberLeft(newer, daysBefore(NOW, 89)).interview);

      await sweeper.sweep();

      expect(interviews.get(old.id)).toBeUndefined();
      expect(interviews.get(newer.id)).toMatchObject({ step: "abandoned", endedAt: daysBefore(NOW, 89) });
    });

    test("deletes Rank Approvals ended more than 90 days ago and keeps newer ones", async () => {
      const oldApproval = pendingApprovalFor(links, MEMBER, UID, daysBefore(NOW, 95));
      const oldChange = approve(oldApproval, "R4", OTHER, daysBefore(NOW, 91));
      if (!oldChange.ok) throw new Error("the test Rank Approval has already ended");
      links.save(oldChange.approval);
      const newerApproval = pendingApprovalFor(links, OTHER, OTHER_UID, daysBefore(NOW, 90));
      const newerChange = cancel(newerApproval, daysBefore(NOW, 89));
      if (!newerChange.ok) throw new Error("the test Rank Approval has already ended");
      links.save(newerChange.approval);

      await sweeper.sweep();

      expect(links.get(oldApproval.id)).toBeUndefined();
      expect(links.get(newerApproval.id)).toMatchObject({ state: "cancelled" });
    });
  });

  describe("a corrupt row", () => {
    test("is logged through logError, and the other Interviews are still swept", async () => {
      const asked = openAwaitingUid(interviews, MEMBER, THREAD, OVERDUE_START);
      const checking = giveUid(asked, UID_DIGITS, OVERDUE_START).interview;
      const found = uidChecked(checking, { kind: "found", player: PLAYER }, OVERDUE_START).interview;
      interviews.save(found);
      db.prepare("UPDATE onboarding_interview SET player_json = ? WHERE id = ?").run("not json", found.id);
      const healthy = openAwaitingUid(interviews, OTHER, OTHER_THREAD, OVERDUE_START);
      expect(interviews.due(NOW).corrupt).toBe(1);

      await sweeper.sweep();

      expect(errors).toHaveLength(1);
      expect(interviews.get(healthy.id)).toMatchObject({ step: "abandoned", reason: "timed-out" });
      expect(channels.logs).toContainEqual(abandonedLogLine(OTHER, "timed-out"));
    });
  });

  describe("a failing channel call", () => {
    test("does not stop the other Interviews being swept", async () => {
      openAwaitingUid(interviews, MEMBER, THREAD, OVERDUE_START);
      const healthy = openAwaitingUid(interviews, OTHER, OTHER_THREAD, OVERDUE_START);
      channels.failingThreads.add(THREAD);

      await expect(sweeper.sweep()).resolves.toBeUndefined();

      expect(interviews.get(healthy.id)).toMatchObject({ step: "abandoned", reason: "timed-out" });
      expect(channels.logs).toContainEqual(abandonedLogLine(OTHER, "timed-out"));
    });
  });

  describe("an Interview paused for the Daily Quota", () => {
    const RESUMES_AT = new Date("2026-11-01T00:00:00Z");

    test("is resumed at or after its resume time: the Member is pinged and asked for the uid again, no attempt counted", async () => {
      const paused = pausedForQuota(interviews, MEMBER, THREAD, NOW, RESUMES_AT);
      clock = RESUMES_AT;

      await sweeper.sweep();

      expect(channels.posts).toEqual([{ threadId: THREAD, message: quotaResetMessage(paused.id, MEMBER) }]);
      expect(interviews.get(paused.id)).toMatchObject({
        step: "awaiting-uid",
        failedAttempts: 0,
        lastAskedAt: RESUMES_AT,
      });
    });

    test("is left paused before its resume time", async () => {
      const paused = pausedForQuota(interviews, MEMBER, THREAD, NOW, RESUMES_AT);
      clock = new Date(RESUMES_AT.getTime() - MINUTE_MS);

      await sweeper.sweep();

      expect(interviews.get(paused.id)).toEqual(paused);
      expect(channels.posts).toEqual([]);
      expect(channels.lockedAndArchived).toEqual([]);
      expect(channels.logs).toEqual([]);
    });

    test("is not abandoned as timed out when the pause is longer than the timeout", async () => {
      const longResumesAt = new Date(NOW.getTime() + 2 * DAY_MS);
      const paused = pausedForQuota(interviews, MEMBER, THREAD, OVERDUE_START, longResumesAt);

      await sweeper.sweep();

      expect(interviews.get(paused.id)).toMatchObject({ step: "paused-for-quota", resumesAt: longResumesAt });
      expect(channels.posts).toEqual([]);
      expect(channels.lockedAndArchived).toEqual([]);
      expect(channels.logs).toEqual([]);
    });

    test("runs the timeout from the resume time, not from the start of the pause", async () => {
      const paused = pausedForQuota(interviews, MEMBER, THREAD, NOW, RESUMES_AT);
      clock = RESUMES_AT;
      await sweeper.sweep();
      expect(interviews.get(paused.id)).toMatchObject({ step: "awaiting-uid", lastAskedAt: RESUMES_AT });

      clock = new Date(RESUMES_AT.getTime() + TIMEOUT_MS - MINUTE_MS);
      await sweeper.sweep();

      expect(interviews.get(paused.id)).toMatchObject({ step: "awaiting-uid" });
      expect(channels.lockedAndArchived).toEqual([]);

      const abandonedAt = new Date(RESUMES_AT.getTime() + TIMEOUT_MS);
      clock = abandonedAt;
      await sweeper.sweep();

      expect(interviews.get(paused.id)).toMatchObject({ step: "abandoned", reason: "timed-out", endedAt: abandonedAt });
      expect(channels.logs).toEqual([abandonedLogLine(MEMBER, "timed-out")]);
    });
  });
});

describe("startSweeper", () => {
  const STOP_NOTHING = (): void => undefined;

  test("runs recover and then sweep once at once, and schedules a sweep every 60 seconds", async () => {
    const order: string[] = [];
    const sweeper: ReturnType<typeof createSweeper> = {
      recover: () => {
        order.push("recover");
        return Promise.resolve();
      },
      sweep: () => {
        order.push("sweep");
        return Promise.resolve();
      },
    };
    const scheduled: { readonly run: () => void; readonly everyMs: number }[] = [];
    const schedule = (run: () => void, everyMs: number): (() => void) => {
      scheduled.push({ run, everyMs });
      return STOP_NOTHING;
    };

    startSweeper(sweeper, schedule);

    await vi.waitFor(() => {
      expect(order).toEqual(["recover", "sweep"]);
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.everyMs).toBe(SWEEP_EVERY_MS);
    scheduled[0]?.run();
    await vi.waitFor(() => {
      expect(order).toEqual(["recover", "sweep", "sweep"]);
    });
  });

  test("returns the stop function of the schedule", () => {
    let stopped = 0;
    const sweeper: ReturnType<typeof createSweeper> = {
      recover: () => Promise.resolve(),
      sweep: () => Promise.resolve(),
    };
    const schedule = (): (() => void) => () => {
      stopped += 1;
    };

    const stop = startSweeper(sweeper, schedule);
    stop();

    expect(stopped).toBe(1);
  });
});
