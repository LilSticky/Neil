import { describe, expect, test } from "vitest";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "./lookup-input.js";
import type { PickablePlayerMatch, Player } from "./player.js";
import {
  MAX_FAILED_ATTEMPTS,
  acceptRecommendation,
  confirm,
  declineRecommendation,
  dueAt,
  giveUid,
  memberLeft,
  pickMatch,
  quotaReset,
  recommendationFound,
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

/** Two matches of the cleaned name, already in pick-list order (Kingdom, then name). */
const PICK_MATCHES: readonly PickablePlayerMatch[] = [
  { name: "Bob", kingdom: 12, uid: "123456789012" },
  { name: "Carol", kingdom: 330, uid: "134567890123" },
];
const PICKED_UID = uidOf("123456789012");
const PICKED_TYPED_UID = "123456789012";
const OTHER_TYPED_UID = "134567890123";
const OTHER_UID = uidOf(OTHER_TYPED_UID);
const BOB: Player = { ...PLAYER, uid: PICKED_UID, name: "Bob", kingdom: kingdomOf(12) };

/** An Onboarding Interview whose name lookup is in flight, started at NOW. */
function recommending(): OnboardingInterview {
  return startInterview({ id: 1, memberId: MEMBER_ID, threadId: THREAD_ID }, NOW).interview;
}

/** Awaiting the uid after the name lookup found no Recommended Player, at NOW. */
function open(): OnboardingInterview {
  return recommendationFound(recommending(), { kind: "none" }, NOW).interview;
}

/** Awaiting "That's me" or "That's not me" for one Recommended Player, asked at NOW. */
function awaitingRecommendation(): OnboardingInterview {
  return recommendationFound(recommending(), { kind: "one", player: PLAYER }, NOW).interview;
}

/** Awaiting a pick from the several matches, asked at NOW. */
function awaitingPick(): OnboardingInterview {
  return recommendationFound(recommending(), { kind: "several", matches: PICK_MATCHES }, NOW).interview;
}

/** Awaiting the uid, with the Recommended Player accepted at NOW. */
function chosenRecommendation(): OnboardingInterview {
  return acceptRecommendation(awaitingRecommendation(), NOW).interview;
}

/** Awaiting the uid, with the pick of the first match made at NOW. */
function chosenPick(): OnboardingInterview {
  return pickMatch(awaitingPick(), 0, NOW).interview;
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
  test("opens an Onboarding Interview looking up the Recommended Player, with no failed attempt, started now", () => {
    expect(startInterview({ id: 1, memberId: MEMBER_ID, threadId: THREAD_ID }, NOW)).toEqual({
      interview: {
        step: "recommending",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: NOW,
      },
      event: { kind: "recommending" },
    });
  });
});

describe("recommendationFound", () => {
  test("no Recommended Player asks for the uid at once, with no failed attempt, asked now", () => {
    expect(recommendationFound(recommending(), { kind: "none" }, LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
      },
      event: { kind: "asked" },
    });
  });

  test("one Recommended Player waits for \"That's me\" or \"That's not me\", asked now", () => {
    expect(recommendationFound(recommending(), { kind: "one", player: PLAYER }, LATER)).toEqual({
      interview: {
        step: "awaiting-recommendation",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
        recommended: PLAYER,
      },
      event: { kind: "recommended", player: PLAYER },
    });
  });

  test("several matches wait for a pick from the list, asked now", () => {
    expect(recommendationFound(recommending(), { kind: "several", matches: PICK_MATCHES }, LATER)).toEqual({
      interview: {
        step: "awaiting-pick",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
        matches: PICK_MATCHES,
      },
      event: { kind: "pick-list", matches: PICK_MATCHES },
    });
  });
});

describe("acceptRecommendation", () => {
  test("\"That's me\" asks for the uid with the Recommended Player chosen, asked now, no failed attempt", () => {
    expect(acceptRecommendation(awaitingRecommendation(), LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
        chosen: { uid: UID, player: PLAYER },
      },
      event: { kind: "asked" },
    });
  });
});

describe("pickMatch", () => {
  test("a pick asks for the uid with the picked match chosen, asked now, no failed attempt", () => {
    expect(pickMatch(awaitingPick(), 0, LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
        chosen: { uid: PICKED_UID, player: undefined },
      },
      event: { kind: "asked" },
    });
  });

  test.each([
    ["past the end of the list", 2],
    ["before the start of the list", -1],
  ])("a pick %s is ignored and changes nothing", (_label, index) => {
    expect(pickMatch(awaitingPick(), index, LATER)).toEqual({
      interview: awaitingPick(),
      event: { kind: "ignored" },
    });
  });
});

describe("declineRecommendation", () => {
  test.each([
    ["a Recommended Player", awaitingRecommendation],
    ["a pick list", awaitingPick],
  ])("declining %s asks for the uid, with no failed attempt, asked now", (_label, build) => {
    expect(declineRecommendation(build(), LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
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

  test("the uid of the Recommended Player chosen goes straight to awaiting confirmation, confirmed by the choice", () => {
    expect(giveUid(chosenRecommendation(), TYPED_UID, LATER)).toMatchObject({
      interview: {
        step: "awaiting-confirmation",
        failedAttempts: 0,
        player: PLAYER,
        confirmedByChoice: true,
      },
      event: { kind: "found", player: PLAYER },
    });
  });

  test("the uid of a picked match goes to checking, keeping the pick; the found Player is then confirmed by the choice", () => {
    const checkingPick = giveUid(chosenPick(), PICKED_TYPED_UID, LATER).interview;
    expect(checkingPick).toEqual({
      step: "checking",
      id: 1,
      memberId: MEMBER_ID,
      threadId: THREAD_ID,
      failedAttempts: 0,
      startedAt: NOW,
      lastAskedAt: NOW,
      uid: PICKED_UID,
      chosen: { uid: PICKED_UID, player: undefined },
    });
    expect(uidChecked(checkingPick, { kind: "found", player: BOB }, LATER).interview).toMatchObject({
      step: "awaiting-confirmation",
      player: BOB,
      confirmedByChoice: true,
    });
  });

  test.each([
    ["a Recommended Player", chosenRecommendation],
    ["a pick", chosenPick],
  ])("a different uid after choosing %s drops the choice and goes to checking as any uid", (_label, build) => {
    expect(giveUid(build(), OTHER_TYPED_UID, LATER)).toEqual({
      interview: {
        step: "checking",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: NOW,
        uid: OTHER_UID,
      },
      event: { kind: "checking", uid: OTHER_UID },
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
    ["awaiting the uid", open],
    ["awaiting confirmation", inConfirmation],
    ["awaiting a Recommended Player's answer", awaitingRecommendation],
    ["awaiting a pick", awaitingPick],
  ])("an Interview %s that times out is abandoned as timed out, at now", (_label, build) => {
    const interview = build();
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
    ["looking up the Recommended Player", recommending],
    ["awaiting the uid", open],
    ["checking", checking],
    ["awaiting confirmation", inConfirmation],
    ["paused for the quota", paused],
    ["awaiting a Recommended Player's answer", awaitingRecommendation],
    ["awaiting a pick", awaitingPick],
  ])("a Member who leaves while the Interview is %s abandons it as left, at now", (_label, build) => {
    const interview = build();
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

  test("an Interview stored as checking a pick keeps the pick as its choice, so the uid asked again is still the chosen one", () => {
    const checkingPick = giveUid(chosenPick(), PICKED_TYPED_UID, NOW).interview;
    expect(checkingPick).toMatchObject({ step: "checking", chosen: { uid: PICKED_UID } });

    const result = recoverAfterRestart(checkingPick, LATER);

    expect(result.interview).toMatchObject({ step: "awaiting-uid", chosen: { uid: PICKED_UID } });
    expect(result.event).toEqual({ kind: "asked" });
  });

  test("an Interview stored as looking up the Recommended Player goes back to awaiting the uid, no failed attempt", () => {
    expect(recoverAfterRestart(recommending(), LATER)).toEqual({
      interview: {
        step: "awaiting-uid",
        id: 1,
        memberId: MEMBER_ID,
        threadId: THREAD_ID,
        failedAttempts: 0,
        startedAt: NOW,
        lastAskedAt: LATER,
      },
      event: { kind: "asked" },
    });
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

  test.each([
    ["awaiting a Recommended Player's answer", awaitingRecommendation],
    ["awaiting a pick", awaitingPick],
  ])("an Interview %s is due a timeout after it was last asked", (_label, build) => {
    expect(dueAt(build(), TIMEOUT_MS)).toEqual(new Date(NOW.getTime() + TIMEOUT_MS));
  });

  test("a paused Interview is due when the quota resets", () => {
    expect(dueAt(paused(), TIMEOUT_MS)).toEqual(RESETS_AT);
  });

  test.each([
    ["looking up the Recommended Player", recommending],
    ["checking", checking],
    ["linked", linked],
    ["handed off", handedOff],
    ["abandoned", () => timeOut(open(), LATER).interview],
  ])("an Interview that is %s has no due time", (_label, build) => {
    expect(dueAt(build(), TIMEOUT_MS)).toBeUndefined();
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
