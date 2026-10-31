import { describe, expect, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "./lookup-input.js";
import type { Player } from "./player.js";
import {
  MAX_FAILED_ATTEMPTS,
  confirm,
  dueAt,
  giveUid,
  memberLeft,
  quotaReset,
  recoverAfterRestart,
  reject,
  startInterview,
  timeOut,
  uidChecked,
  type InterviewTransition,
  type OnboardingInterview,
} from "./onboarding-interview.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${String(number)} is not a valid Kingdom`);
  return parsed.value;
}

const NOW = new Date("2026-10-31T10:00:00Z");
const LATER = new Date("2026-10-31T10:05:00Z");
const RESETS_AT = new Date("2026-11-01T00:00:00Z");
const TIMEOUT_MS = 1440 * 60 * 1000;

const MEMBER_ID = "111111111111111111";
const THREAD_ID = "222222222222222222";
const UID = uidOf("145563254785");
const TYPED_UID = " 145563254785 ";

const PLAYER: Player = {
  uid: UID,
  name: "Neil",
  kingdom: kingdomOf(330),
  power: 1_000_000,
  sanctuaryLevel: 5,
  alliance: { tag: "LAS", name: "Last Asylum", leaderUid: undefined },
  allianceRank: "R4",
};

/** A fresh Onboarding Interview, asked at NOW. */
function open(): OnboardingInterview {
  return startInterview({ id: 1, memberId: MEMBER_ID, threadId: THREAD_ID }, NOW).interview;
}

/** Awaiting the uid after `failures` failed attempts, each made at NOW. */
function afterFailures(failures: number): OnboardingInterview {
  let interview = open();
  for (let attempt = 0; attempt < failures; attempt++) {
    interview = uidChecked(giveUid(interview, TYPED_UID, NOW).interview, { kind: "not-found" }, NOW).interview;
  }
  return interview;
}

/** Checking the uid after `failures` failed attempts. */
function checkingAfter(failures: number): OnboardingInterview {
  return giveUid(afterFailures(failures), TYPED_UID, NOW).interview;
}

/** Awaiting confirmation of the shown Player after `failures` failed attempts. */
function confirmationAfter(failures: number): OnboardingInterview {
  return uidChecked(checkingAfter(failures), { kind: "found", player: PLAYER }, NOW).interview;
}

function checking(): OnboardingInterview {
  return checkingAfter(0);
}

function inConfirmation(): OnboardingInterview {
  return confirmationAfter(0);
}

function paused(): OnboardingInterview {
  return uidChecked(checking(), { kind: "quota-spent", resetsAt: RESETS_AT }, NOW).interview;
}

function handedOff(): OnboardingInterview {
  return afterFailures(MAX_FAILED_ATTEMPTS);
}

function linked(): OnboardingInterview {
  return confirm(inConfirmation(), { kind: "linked" }, LATER).interview;
}

describe("startInterview", () => {
  test("opens an Onboarding Interview waiting for the uid, with no failed attempt, asked now", () => {
    expect(startInterview({ id: 1, memberId: MEMBER_ID, threadId: THREAD_ID }, NOW)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: NOW,
      },
      event: { kind: "asked" },
    });
  });
});

describe("giveUid", () => {
  test.each([
    ["spaces around the digits", " 145563254785 "],
    ["a leading #", "#145563254785"],
  ])("a valid uid with %s moves the Interview to checking without a failed attempt", (_label, typed) => {
    expect(giveUid(open(), typed, LATER)).toEqual({
      interview: {
        step: "checking",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: NOW,
        uid: UID,
      },
      event: { kind: "checking", uid: UID },
    });
  });

  test.each([
    ["letters", "abc"],
    ["letters after digits", "12a"],
    ["empty", ""],
    ["a doubled #", "##1"],
    ["21 digits", "123456789012345678901"],
  ])("a malformed uid (%s) leaves the Interview as it was and counts no attempt", (_label, typed) => {
    expect(giveUid(open(), typed, LATER)).toEqual({
      interview: open(),
      event: { kind: "malformed" },
    });
  });
});

describe("uidChecked", () => {
  test("a found Player moves the Interview to awaiting confirmation, asked now", () => {
    expect(uidChecked(checking(), { kind: "found", player: PLAYER }, LATER)).toEqual({
      interview: {
        step: "awaiting-confirmation",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
        player: PLAYER,
      },
      event: { kind: "found", player: PLAYER },
    });
  });

  test.each([
    ["not-found", { kind: "not-found" }],
    ["not-prepared", { kind: "not-prepared" }],
    ["already-linked", { kind: "already-linked" }],
  ] as const)("a %s check counts a failed attempt and asks again", (reason, check) => {
    expect(uidChecked(checking(), check, LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 1,
        startedAt: NOW,
        lastAskedAt: LATER,
      },
      event: { kind: "failed", reason, attemptsLeft: MAX_FAILED_ATTEMPTS - 1 },
    });
  });

  test("an unavailable Game API goes back to awaiting the uid without a failed attempt", () => {
    const result = uidChecked(checking(), { kind: "unavailable" }, LATER);
    expect(result.interview).toMatchObject({ step: "awaiting-uid", failedAttempts: 0 });
    expect(result.event).toEqual({ kind: "unavailable" });
  });

  test("a spent Daily Quota pauses the Interview until the quota resets, without a failed attempt", () => {
    const result = uidChecked(checking(), { kind: "quota-spent", resetsAt: RESETS_AT }, LATER);
    expect(result.interview).toMatchObject({
      step: "paused-for-quota",
      id: 1,
      memberId: MEMBER_ID,
      threadId: THREAD_ID,
      failedAttempts: 0,
      resumesAt: RESETS_AT,
    });
    expect(result.event).toEqual({ kind: "paused", resumesAt: RESETS_AT });
  });
});

describe("confirm", () => {
  test("a confirmed Link ends the Interview as linked, at now", () => {
    expect(confirm(inConfirmation(), { kind: "linked" }, LATER)).toEqual({
      interview: {
        step: "linked",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        endedAt: LATER,
        uid: UID,
      },
      event: { kind: "linked", uid: UID },
    });
  });

  test("a confirmation of a uid that is already Linked counts a failed attempt and asks again", () => {
    expect(confirm(inConfirmation(), { kind: "already-linked" }, LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 1,
        startedAt: NOW,
        lastAskedAt: LATER,
      },
      event: { kind: "failed", reason: "already-linked", attemptsLeft: MAX_FAILED_ATTEMPTS - 1 },
    });
  });
});

describe("reject", () => {
  test("\"That's not me\" counts a failed attempt and asks for the uid again", () => {
    expect(reject(inConfirmation(), LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 1,
        startedAt: NOW,
        lastAskedAt: LATER,
      },
      event: { kind: "failed", reason: "rejected", attemptsLeft: MAX_FAILED_ATTEMPTS - 1 },
    });
  });
});

describe("quotaReset", () => {
  test("the quota reset asks the Member again: awaiting the uid, asked now", () => {
    const result = quotaReset(paused(), LATER);
    expect(result.interview).toMatchObject({ step: "awaiting-uid", id: 1, lastAskedAt: LATER });
    expect(result.event).toEqual({ kind: "resumed" });
  });

  test("a pause does not count toward the timeout: the due time runs from the reset", () => {
    const { interview } = quotaReset(paused(), LATER);
    expect(dueAt(interview, TIMEOUT_MS)).toEqual(new Date(LATER.getTime() + TIMEOUT_MS));
  });
});

describe("timeOut", () => {
  test.each([
    ["awaiting the uid", open()],
    ["awaiting confirmation", inConfirmation()],
  ])("an Interview %s that times out is abandoned as timed out, at now", (_label, interview) => {
    expect(timeOut(interview, LATER)).toEqual({
      interview: {
        step: "abandoned",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: interview.failedAttempts,
        startedAt: NOW,
        endedAt: LATER,
        reason: "timed-out",
      },
      event: { kind: "abandoned", reason: "timed-out" },
    });
  });
});

describe("memberLeft", () => {
  test.each([
    ["awaiting the uid", open()],
    ["checking", checking()],
    ["awaiting confirmation", inConfirmation()],
    ["paused for the quota", paused()],
  ])("a Member who leaves while the Interview is %s abandons it as left, at now", (_label, interview) => {
    expect(memberLeft(interview, LATER)).toEqual({
      interview: {
        step: "abandoned",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: interview.failedAttempts,
        startedAt: NOW,
        endedAt: LATER,
        reason: "left",
      },
      event: { kind: "abandoned", reason: "left" },
    });
  });
});

describe("recoverAfterRestart", () => {
  test("an Interview stored as checking goes back to awaiting the uid, with no failed attempt added", () => {
    const result = recoverAfterRestart(checkingAfter(2), LATER);
    expect(result.interview).toMatchObject({ step: "awaiting-uid", failedAttempts: 2 });
    expect(result.event).toEqual({ kind: "asked" });
  });
});

describe("failed attempts", () => {
  test("the fourth failed attempt keeps the Interview open with one attempt left", () => {
    const result = uidChecked(checkingAfter(3), { kind: "not-found" }, LATER);
    expect(result.interview).toMatchObject({ step: "awaiting-uid", failedAttempts: 4 });
    expect(result.event).toEqual({ kind: "failed", reason: "not-found", attemptsLeft: 1 });
  });

  test.each([
    [
      "a not-found check",
      (): InterviewTransition => uidChecked(checkingAfter(MAX_FAILED_ATTEMPTS - 1), { kind: "not-found" }, LATER),
      "not-found",
    ],
    [
      "an already-linked check",
      (): InterviewTransition => uidChecked(checkingAfter(MAX_FAILED_ATTEMPTS - 1), { kind: "already-linked" }, LATER),
      "already-linked",
    ],
    [
      "an already-linked confirmation",
      (): InterviewTransition => confirm(confirmationAfter(MAX_FAILED_ATTEMPTS - 1), { kind: "already-linked" }, LATER),
      "already-linked",
    ],
    [
      "a rejection",
      (): InterviewTransition => reject(confirmationAfter(MAX_FAILED_ATTEMPTS - 1), LATER),
      "rejected",
    ],
  ] as const)("the fifth failed attempt (%s) hands the Interview off to an Officer", (_label, run, reason) => {
    const result = run();
    expect(result.interview).toEqual({
      step: "handed-off",
      id: 1,
      memberId: MEMBER_ID,
      threadId: THREAD_ID,
      failedAttempts: MAX_FAILED_ATTEMPTS,
      startedAt: NOW,
      endedAt: LATER,
    });
    expect(result.event).toEqual({ kind: "handed-off", reason });
  });
});

describe("dueAt", () => {
  test("an Interview awaiting the uid is due a timeout after it was last asked", () => {
    expect(dueAt(open(), TIMEOUT_MS)).toEqual(new Date(NOW.getTime() + TIMEOUT_MS));
  });

  test("an Interview awaiting confirmation is due a timeout after it was last asked", () => {
    expect(dueAt(inConfirmation(), TIMEOUT_MS)).toEqual(new Date(NOW.getTime() + TIMEOUT_MS));
  });

  test("a paused Interview is due when the quota resets", () => {
    expect(dueAt(paused(), TIMEOUT_MS)).toEqual(RESETS_AT);
  });

  test.each([
    ["checking", checking()],
    ["linked", linked()],
    ["handed off", handedOff()],
    ["abandoned", timeOut(open(), LATER).interview],
  ])("an Interview that is %s has no due time", (_label, interview) => {
    expect(dueAt(interview, TIMEOUT_MS)).toBeUndefined();
  });
});

describe("ended Interviews refuse every event", () => {
  const ENDED: ReadonlyArray<readonly [string, () => OnboardingInterview]> = [
    ["linked", linked],
    ["handed off", handedOff],
    ["abandoned as timed out", () => timeOut(open(), LATER).interview],
    ["abandoned as left", () => memberLeft(open(), LATER).interview],
  ];

  const EVENTS: ReadonlyArray<readonly [string, (interview: OnboardingInterview) => InterviewTransition]> = [
    ["a uid given", (interview) => giveUid(interview, TYPED_UID, LATER)],
    ["a malformed uid given", (interview) => giveUid(interview, "abc", LATER)],
    ["a found check", (interview) => uidChecked(interview, { kind: "found", player: PLAYER }, LATER)],
    ["a failed check", (interview) => uidChecked(interview, { kind: "not-found" }, LATER)],
    ["a confirmation", (interview) => confirm(interview, { kind: "linked" }, LATER)],
    ["a rejection", (interview) => reject(interview, LATER)],
    ["a timeout", (interview) => timeOut(interview, LATER)],
    ["the member leaving", (interview) => memberLeft(interview, LATER)],
    ["the quota reset", (interview) => quotaReset(interview, LATER)],
    ["a restart", (interview) => recoverAfterRestart(interview, LATER)],
  ];

  for (const [endedLabel, build] of ENDED) {
    for (const [eventLabel, send] of EVENTS) {
      test(`refuses ${eventLabel} once the Interview is ${endedLabel}`, () => {
        const ended = build();
        expect(send(ended)).toEqual({ interview: ended, event: { kind: "ended" } });
      });
    }
  }
});
