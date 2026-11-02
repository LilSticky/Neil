import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Link } from "../domain/link.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { PickablePlayerMatch, Player } from "../domain/player.js";
import {
  MAX_FAILED_ATTEMPTS,
  acceptRecommendation,
  confirm as confirmInterview,
  giveUid,
  memberLeft,
  pickMatch,
  recommendationFound,
  timeOut,
  uidChecked,
  type AwaitingUid,
  type InterviewTransition,
  type OnboardingInterview,
  type OpenInterview,
  type RecommendationResult,
} from "../domain/onboarding-interview.js";
import { openDatabase } from "./database.js";
import { InterviewStore, type CreateOutcome, type InterviewDraft } from "./interview-store.js";
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
const OTHER_UID_DIGITS = "100000000001";
const PLAYER: Player = {
  uid: UID,
  name: "Neil",
  kingdom: kingdomOf(330),
  power: 1_000_000,
  sanctuaryLevel: 5,
  alliance: { tag: "LAS", name: "Last Asylum", leaderUid: undefined },
  allianceRank: "R4",
};
const MATCHES: readonly PickablePlayerMatch[] = [
  { uid: UID_DIGITS, name: "Neil", kingdom: 330, tag: "LAS" },
  { uid: OTHER_UID_DIGITS, name: "Neil", kingdom: 331 },
];
const ONE: RecommendationResult = { kind: "one", player: PLAYER };
const SEVERAL: RecommendationResult = { kind: "several", matches: MATCHES };

interface StepCase {
  readonly name: string;
  readonly build: (awaiting: AwaitingUid) => OnboardingInterview;
}

interface RecommendationCase {
  readonly name: string;
  readonly step: OnboardingInterview["step"];
  readonly build: (recommending: OnboardingInterview) => InterviewTransition;
}

function createdOf(outcome: CreateOutcome): OpenInterview {
  if (outcome.kind !== "created") throw new Error("the test Interview was not created");
  return outcome.interview;
}

/** The Interview after the name lookup found nothing: it asks for the uid. */
function askedForUid(interview: OpenInterview, now: Date): AwaitingUid {
  const asked = recommendationFound(interview, { kind: "none" }, now).interview;
  if (asked.step !== "awaiting-uid") throw new Error("the test Interview does not ask for the uid");
  return asked;
}

/** A new Interview stored as asking for the uid, as the lookup leaves it when no Player is recommended. */
function startedAwaitingUid(store: InterviewStore, draft: InterviewDraft, now: Date): AwaitingUid {
  const asked = askedForUid(createdOf(store.create(draft, now)), now);
  store.save(asked);
  return asked;
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

/**
 * The steps of the name lookup and of the choice that follows it, each built from the Interview the lookup opened.
 * The step is named so that a build which does not reach it fails the round trip instead of passing vacuously.
 */
const RECOMMENDATION_CASES: readonly RecommendationCase[] = [
  {
    name: "recommending",
    step: "recommending",
    build: (recommending) => ({ interview: recommending, event: { kind: "recommending" } }),
  },
  {
    name: "awaiting-recommendation",
    step: "awaiting-recommendation",
    build: (recommending) => recommendationFound(recommending, ONE, LATER),
  },
  {
    name: "awaiting-pick",
    step: "awaiting-pick",
    build: (recommending) => recommendationFound(recommending, SEVERAL, LATER),
  },
  {
    name: "awaiting-uid with the Recommended Player chosen",
    step: "awaiting-uid",
    build: (recommending) => acceptRecommendation(recommendationFound(recommending, ONE, LATER).interview, LATER),
  },
  {
    name: "awaiting-uid with a pick chosen",
    step: "awaiting-uid",
    build: (recommending) => pickMatch(recommendationFound(recommending, SEVERAL, LATER).interview, 1, LATER),
  },
  {
    name: "awaiting-confirmation confirmed by the choice",
    step: "awaiting-confirmation",
    build: (recommending) =>
      giveUid(acceptRecommendation(recommendationFound(recommending, ONE, LATER).interview, LATER).interview, UID_DIGITS, LATER),
  },
  {
    name: "checking with a pick chosen",
    step: "checking",
    build: (recommending) =>
      giveUid(pickMatch(recommendationFound(recommending, SEVERAL, LATER).interview, 1, LATER).interview, OTHER_UID_DIGITS, LATER),
  },
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

  test("create stores a new recommending Interview with no failed attempt", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);

    const outcome = store.create(DRAFT, NOW);

    const created = createdOf(outcome);
    expect(Number.isInteger(created.id)).toBe(true);
    expect(outcome).toEqual({
      kind: "created",
      interview: {
        step: "recommending",
        id: created.id,
        memberId: MEMBER,
        threadId: THREAD,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: NOW,
      },
    });
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
    const awaiting = askedForUid(createdOf(store.create(DRAFT, NOW)), NOW);
    const interview = build(awaiting);

    store.save(interview);

    expect(store.get(interview.id)).toEqual(interview);
  });

  test.each(RECOMMENDATION_CASES)("round-trips the $name step through save and get", ({ step, build }) => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const recommending = createdOf(store.create(DRAFT, NOW));
    expect(recommending.step).toBe("recommending");
    const { interview, event } = build(recommending);
    expect(event.kind).not.toBe("ignored");
    expect(interview.step).toBe(step);

    store.save(interview);

    expect(store.get(interview.id)).toEqual(interview);
  });

  test("saveIfStep writes the Interview and returns true when the stored row still has the expected step", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const created = startedAwaitingUid(store, DRAFT, NOW);
    const checking = checkingFrom(created);

    const saved = store.saveIfStep(checking, "awaiting-uid");

    expect(saved).toBe(true);
    expect(store.get(created.id)).toEqual(checking);
  });

  test("saveIfStep writes nothing and returns false when a stale writer finds the row has moved on", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const created = startedAwaitingUid(store, DRAFT, NOW);
    const checking = checkingFrom(created);
    expect(store.saveIfStep(checking, "awaiting-uid")).toBe(true);
    const stale = timeOut(created, LATER).interview;

    const saved = store.saveIfStep(stale, "awaiting-uid");

    expect(saved).toBe(false);
    expect(store.get(created.id)).toEqual(checking);
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
    const created = startedAwaitingUid(store, DRAFT, NOW);
    const paused = uidChecked(checkingFrom(created), { kind: "quota-spent", resetsAt: RESETS_AT }, LATER).interview;
    store.save(paused);

    expect(store.due(new Date(RESETS_AT.getTime() - 1)).interviews).toEqual([]);
    expect(store.due(RESETS_AT).interviews).toEqual([paused]);
  });

  test("due lists only open Interviews whose due time has come, not checking or ended ones", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const asking = startedAwaitingUid(store, DRAFT, NOW);
    const checking = checkingFrom(startedAwaitingUid(store, { memberId: THIRD, threadId: THREAD }, NOW));
    store.save(checking);
    const ended = startedAwaitingUid(store, { memberId: "666666666666666666", threadId: THREAD }, NOW);
    store.save(timeOut(ended, NOW).interview);

    const due = store.due(new Date(NOW.getTime() + TIMEOUT_MS));

    expect(due.corrupt).toBe(0);
    expect(due.interviews).toEqual([asking]);
  });

  test("due does not list a recommending Interview, which has no due time", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    createdOf(store.create(DRAFT, NOW));

    const due = store.due(new Date(NOW.getTime() + TIMEOUT_MS));

    expect(due).toEqual({ interviews: [], corrupt: 0 });
  });

  test("due lists an awaiting-pick Interview once its timeout has come", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const pick = recommendationFound(createdOf(store.create(DRAFT, NOW)), SEVERAL, LATER).interview;
    store.save(pick);

    expect(store.due(new Date(LATER.getTime() + TIMEOUT_MS - 1)).interviews).toEqual([]);
    expect(store.due(new Date(LATER.getTime() + TIMEOUT_MS)).interviews).toEqual([pick]);
  });

  test("due reports a corrupt row as corrupt and skips it, without throwing", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    db.prepare(
      "INSERT INTO onboarding_interview (id, member_id, thread_id, step, failed_attempts, started_at, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(900, OTHER, THREAD, "mystery", 0, NOW.toISOString(), OLD.toISOString());
    const created = startedAwaitingUid(store, { memberId: THIRD, threadId: THREAD }, NOW);
    const paused = uidChecked(checkingFrom(created), { kind: "quota-spent", resetsAt: RESETS_AT }, LATER).interview;
    store.save(paused);

    const due = store.due(RESETS_AT);

    expect(due.corrupt).toBe(1);
    expect(due.interviews).toEqual([paused]);
  });

  test("due reports an awaiting-pick row whose matches_json is corrupt as corrupt and skips it, without throwing", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    db.prepare(
      "INSERT INTO onboarding_interview (id, member_id, thread_id, step, failed_attempts, started_at, last_asked_at, due_at, matches_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(900, OTHER, THREAD, "awaiting-pick", 0, OLD.toISOString(), OLD.toISOString(), OLD.toISOString(), "not json");
    const pick = recommendationFound(createdOf(store.create({ memberId: THIRD, threadId: THREAD }, NOW)), SEVERAL, LATER)
      .interview;
    store.save(pick);

    const due = store.due(new Date(LATER.getTime() + TIMEOUT_MS));

    expect(due).toEqual({ interviews: [pick], corrupt: 1 });
  });

  test("inFlight lists an awaiting-confirmation Interview confirmed by the choice, so that recovery makes its Link", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    const recommending = createdOf(store.create(DRAFT, NOW));
    const byChoice = giveUid(
      acceptRecommendation(recommendationFound(recommending, ONE, LATER).interview, LATER).interview,
      UID_DIGITS,
      LATER,
    ).interview;
    expect(byChoice).toMatchObject({ step: "awaiting-confirmation", confirmedByChoice: true });
    store.save(byChoice);

    expect(store.inFlight()).toEqual({ interviews: [byChoice], corrupt: 0 });
  });

  test("inFlight does not list an awaiting-confirmation Interview that the Member confirms by the card", () => {
    const store = new InterviewStore(db, TIMEOUT_MS);
    store.save(awaitingConfirmationFrom(startedAwaitingUid(store, { memberId: OTHER, threadId: THREAD }, NOW)));

    expect(store.inFlight()).toEqual({ interviews: [], corrupt: 0 });
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
    const created = startedAwaitingUid(store, DRAFT, NOW);
    store.save(awaitingConfirmationFrom(created));
    const link: Link = {
      memberId: MEMBER,
      uid: UID,
      linkedAt: LATER,
      allianceRank: { source: "game-api", rank: "R4" },
      madeBy: { kind: "in-game-proof" },
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
    const created = startedAwaitingUid(store, DRAFT, NOW);
    const waiting = awaitingConfirmationFrom(created);
    store.save(waiting);
    const link: Link = {
      memberId: MEMBER,
      uid: UID,
      linkedAt: LATER,
      allianceRank: { source: "game-api", rank: "R4" },
      madeBy: { kind: "in-game-proof" },
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
