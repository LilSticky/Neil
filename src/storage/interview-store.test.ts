import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import {
  MAX_FAILED_ATTEMPTS,
  confirm as confirmInterview,
  giveUid,
  memberLeft,
  timeOut,
  uidChecked,
  type AwaitingUid,
  type Checking,
  type OnboardingInterview,
} from "../domain/onboarding-interview.js";
import { openDatabase } from "./database.js";
import { InterviewStore, type CreateOutcome } from "./interview-store.js";
import { LinkStore } from "./link-store.js";

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
const LATER = new Date("2026-10-31T10:05:00Z");
const OLD = new Date("2026-01-10T10:00:00Z");
const RECENT = new Date("2026-10-30T10:00:00Z");
const RESETS_AT = new Date("2026-11-01T00:00:00Z");
const CUTOFF = new Date("2026-08-02T00:00:00Z");
const TIMEOUT_MS = 1440 * 60 * 1000;

const MEMBER = "111111111111111111";
const OTHER = "222222222222222222";
const THIRD = "333333333333333333";
const THREAD = "444444444444444444";
const DRAFT = { memberId: MEMBER, threadId: THREAD };

const UID_DIGITS = "145563254785";
const UID = uidOf(UID_DIGITS);
const PLAYER: Player = {
  uid: UID,
  name: "Neil",
  kingdom: kingdomOf(330),
  power: 1_000_000,
  sanctuaryLevel: 5,
  alliance: { tag: "LAS", name: "Last Asylum", leaderUid: undefined },
  allianceRank: "R4",
};

interface StepCase {
  readonly name: string;
  readonly build: (awaiting: AwaitingUid) => OnboardingInterview;
}

function createdOf(outcome: CreateOutcome): AwaitingUid {
  if (outcome.kind !== "created") throw new Error("the test Interview was not created");
  return outcome.interview;
}

function checkingFrom(interview: OnboardingInterview): OnboardingInterview {
  return giveUid(interview, UID_DIGITS, LATER).interview;
}

function awaitingConfirmationFrom(interview: OnboardingInterview): OnboardingInterview {
  return uidChecked(checkingFrom(interview), { kind: "found", player: PLAYER }, LATER).interview;
}

function failedFiveTimes(interview: OnboardingInterview): OnboardingInterview {
  let current = interview;
  for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt++) {
    current = uidChecked(checkingFrom(current), { kind: "not-found" }, LATER).interview;
  }
  return current;
}

const STEP_CASES: readonly StepCase[] = [
  { name: "awaiting-uid", build: (awaiting) => awaiting },
  { name: "checking", build: (awaiting) => checkingFrom(awaiting) },
  { name: "awaiting-confirmation", build: (awaiting) => awaitingConfirmationFrom(awaiting) },
  {
    name: "paused-for-quota",
    build: (awaiting) =>
      uidChecked(checkingFrom(awaiting), { kind: "quota-spent", resetsAt: RESETS_AT }, LATER).interview,
  },
  {
    name: "linked",
    build: (awaiting) => confirmInterview(awaitingConfirmationFrom(awaiting), { kind: "linked" }, LATER).interview,
  },
  { name: "handed-off", build: (awaiting) => failedFiveTimes(awaiting) },
  { name: "abandoned (timed out)", build: (awaiting) => timeOut(awaiting, LATER).interview },
  { name: "abandoned (left)", build: (awaiting) => memberLeft(awaiting, LATER).interview },
];

describe("InterviewStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-interviews-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("create stores a new awaiting-uid Interview with no failed attempt", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);

    const outcome = store.create(DRAFT, NOW);

    expect(outcome).toEqual({
      kind: "created",
      interview: {
        step: "awaiting-uid",
        id: expect.any(Number),
        memberId: MEMBER,
        threadId: THREAD,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: NOW,
      },
    });
    const created = createdOf(outcome);
    expect(store.get(created.id)).toEqual(created);
  });

  test("create refuses a second open Interview of the same Member, writing nothing", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const first = createdOf(store.create(DRAFT, NOW));

    const second = store.create({ memberId: MEMBER, threadId: "555555555555555555" }, LATER);

    expect(second).toEqual({ kind: "already-open" });
    expect(store.openFor(MEMBER)).toEqual(first);
  });

  test("create opens a new Interview once the Member's last one has ended", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const first = createdOf(store.create(DRAFT, NOW));
    store.save(memberLeft(first, LATER).interview);

    const second = createdOf(store.create(DRAFT, LATER));

    expect(second.id).not.toBe(first.id);
    expect(store.openFor(MEMBER)).toEqual(second);
  });

  test.each(STEP_CASES)("round-trips the $name step through save and get", ({ build }) => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const created = createdOf(store.create(DRAFT, NOW));
    const interview = build(created);

    store.save(interview);

    expect(store.get(interview.id)).toEqual(interview);
  });

  test("get finds nothing for an unknown id", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);

    expect(store.get(404)).toBeUndefined();
  });

  test("openFor finds the open Interview of a Member, and nothing once it has ended", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const created = createdOf(store.create(DRAFT, NOW));
    expect(store.openFor(MEMBER)).toEqual(created);

    const abandoned = memberLeft(created, LATER).interview;
    store.save(abandoned);

    expect(store.openFor(MEMBER)).toBeUndefined();
  });

  test("latestFor finds the newest Interview of a Member, ended or not", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const first = createdOf(store.create(DRAFT, NOW));
    const abandoned = memberLeft(first, LATER).interview;
    store.save(abandoned);
    expect(store.latestFor(MEMBER)).toEqual(abandoned);

    const second = createdOf(store.create(DRAFT, LATER));

    expect(store.latestFor(MEMBER)).toEqual(second);
  });

  test("save writes the due time from dueAt, so a paused Interview is due at its resume time", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const created = createdOf(store.create(DRAFT, NOW));
    const paused = uidChecked(checkingFrom(created), { kind: "quota-spent", resetsAt: RESETS_AT }, LATER).interview;
    store.save(paused);

    expect(store.due(new Date(RESETS_AT.getTime() - 1)).interviews).toEqual([]);
    expect(store.due(RESETS_AT).interviews).toEqual([paused]);
  });

  test("due lists only open Interviews whose due time has come, not checking or ended ones", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const asking = createdOf(store.create(DRAFT, NOW));
    const checking = checkingFrom(createdOf(store.create({ memberId: THIRD, threadId: THREAD }, NOW)));
    store.save(checking);
    const ended = createdOf(store.create({ memberId: "666666666666666666", threadId: THREAD }, NOW));
    store.save(timeOut(ended, NOW).interview);

    const due = store.due(new Date(NOW.getTime() + TIMEOUT_MS));

    expect(due.corrupt).toBe(0);
    expect(due.interviews).toEqual([asking]);
  });

  test("due reports a corrupt row as corrupt and skips it, without throwing", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    db.prepare(
      "INSERT INTO onboarding_interview (id, member_id, thread_id, step, failed_attempts, started_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(900, OTHER, THREAD, "mystery", 0, NOW.toISOString(), OLD.toISOString());
    const created = createdOf(store.create({ memberId: THIRD, threadId: THREAD }, NOW));
    const paused = uidChecked(checkingFrom(created), { kind: "quota-spent", resetsAt: RESETS_AT }, LATER).interview;
    store.save(paused);

    const due = store.due(RESETS_AT);

    expect(due.corrupt).toBe(1);
    expect(due.interviews).toEqual([paused]);
  });

  test("checking lists the Interviews waiting on a Game API check, for recovery after a restart", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const asking = createdOf(store.create(DRAFT, NOW));
    const inFlight = checkingFrom(createdOf(store.create({ memberId: OTHER, threadId: THREAD }, NOW)));
    store.save(inFlight);

    const checking: Checking[] = store.checking();

    expect(checking).toEqual([inFlight]);
    expect(store.get(asking.id)).toEqual(asking);
  });

  test("deleteEndedBefore removes the Interviews ended before the cutoff and keeps open and recent ones", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const oldEnded = memberLeft(createdOf(store.create(DRAFT, OLD)), OLD).interview;
    store.save(oldEnded);
    const recentEnded = memberLeft(createdOf(store.create({ memberId: OTHER, threadId: THREAD }, RECENT)), RECENT)
      .interview;
    store.save(recentEnded);
    const open = createdOf(store.create({ memberId: THIRD, threadId: THREAD }, NOW));

    store.deleteEndedBefore(CUTOFF);

    expect(store.get(oldEnded.id)).toBeUndefined();
    expect(store.get(recentEnded.id)).toEqual(recentEnded);
    expect(store.openFor(THIRD)).toEqual(open);
  });

  test("save runs inside the transaction LinkStore.confirm opens, and the Interview is stored with the Link", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const links = new LinkStore(db);
    const created = createdOf(store.create(DRAFT, NOW));
    store.save(awaitingConfirmationFrom(created));
    const link: Link = {
      memberId: MEMBER,
      uid: UID,
      linkedAt: LATER,
      allianceRank: { source: "game-api", rank: "R4" },
    };
    const linked = confirmInterview(awaitingConfirmationFrom(created), { kind: "linked" }, LATER).interview;

    const outcome = links.confirm({ link }, () => {
      store.save(linked);
    });

    expect(outcome).toEqual({ kind: "linked" });
    expect(store.get(created.id)).toEqual(linked);
    expect(links.linkFor(MEMBER)).toEqual(link);
  });

  test("an Interview saved inside a LinkStore.confirm that rolls back is not stored", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const links = new LinkStore(db);
    const created = createdOf(store.create(DRAFT, NOW));
    const waiting = awaitingConfirmationFrom(created);
    store.save(waiting);
    const link: Link = {
      memberId: MEMBER,
      uid: UID,
      linkedAt: LATER,
      allianceRank: { source: "game-api", rank: "R4" },
    };

    expect(() =>
      links.confirm({ link }, () => {
        store.save(confirmInterview(waiting, { kind: "linked" }, LATER).interview);
        throw new Error("the Link could not be stored");
      }),
    ).toThrow("the Link could not be stored");

    expect(store.get(created.id)).toEqual(waiting);
    expect(links.linkFor(MEMBER)).toBeUndefined();
  });
});
