import { parseInterviewUid, type Uid } from "./lookup-input.js";
import type { Player } from "./player.js";
import type { MemberId } from "./rank-approval.js";

/** Failed attempts that hand the Interview off to an Officer. */
export const MAX_FAILED_ATTEMPTS = 5;

/** Failed attempts of an Interview that is still open: one less than the maximum. */
export type OpenFailedAttempts = 0 | 1 | 2 | 3 | 4;

/** Why an attempt failed: the uid was not found, not prepared, already Linked, or rejected by the Member. */
export type FailureReason =
  "not-found" | "not-prepared" | "already-linked" | "rejected";

/** Why an Interview ended without a Link: the Member left, or the timeout ran out. */
export type AbandonReason = "left" | "timed-out";

/** The Game API's answer to a uid check, as the Interview needs it. */
export type UidCheck =
  | { readonly kind: "found"; readonly player: Player }
  | { readonly kind: "not-found" }
  | { readonly kind: "not-prepared" }
  | { readonly kind: "already-linked" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "quota-spent"; readonly resetsAt: Date };

/** The outcome of confirming the shown Player: the Link was made, or the uid is already Linked. */
export type ConfirmOutcome =
  { readonly kind: "linked" } | { readonly kind: "already-linked" };

/** A new Onboarding Interview for a Member who joined, in the thread opened for them. */
export interface NewInterview {
  readonly id: number;
  readonly memberId: MemberId;
  readonly threadId: string;
}

interface InterviewBase {
  readonly id: number;
  readonly memberId: MemberId;
  readonly threadId: string;
  readonly startedAt: Date;
}

interface OpenBase extends InterviewBase {
  readonly failedAttempts: OpenFailedAttempts;
}

/** Waiting for the Member to type their uid; lastAskedAt is when the thread last asked for it. */
export interface AwaitingUid extends OpenBase {
  readonly step: "awaiting-uid";
  readonly lastAskedAt: Date;
}

/** Checking the uid the Member typed against the Game API. */
export interface Checking extends OpenBase {
  readonly step: "checking";
  readonly lastAskedAt: Date;
  readonly uid: Uid;
}

/** Waiting for the Member to confirm the Player shown ("That's me" or "That's not me"). */
export interface AwaitingConfirmation extends OpenBase {
  readonly step: "awaiting-confirmation";
  readonly lastAskedAt: Date;
  readonly player: Player;
}

/** Paused until the Daily Quota resets; the timeout does not run meanwhile. */
export interface PausedForQuota extends OpenBase {
  readonly step: "paused-for-quota";
  readonly resumesAt: Date;
}

/** Ended with a Link for the Member. */
export interface Linked extends InterviewBase {
  readonly step: "linked";
  readonly failedAttempts: OpenFailedAttempts;
  readonly endedAt: Date;
  readonly uid: Uid;
}

/** Ended after the fifth failed attempt; an Officer takes over. */
export interface HandedOff extends InterviewBase {
  readonly step: "handed-off";
  readonly failedAttempts: typeof MAX_FAILED_ATTEMPTS;
  readonly endedAt: Date;
}

/** Ended without a Link because the Member left or the timeout ran out. */
export interface Abandoned extends InterviewBase {
  readonly step: "abandoned";
  readonly failedAttempts: OpenFailedAttempts;
  readonly endedAt: Date;
  readonly reason: AbandonReason;
}

export type OpenInterview =
  AwaitingUid | Checking | AwaitingConfirmation | PausedForQuota;

/** The Onboarding Interview of one Member: exactly one step at a time, and each step carries what it needs. */
export type OnboardingInterview =
  OpenInterview | Linked | HandedOff | Abandoned;

/** What happened, for the adapter to say in the thread and the log. */
export type InterviewEvent =
  | { readonly kind: "asked" }
  | { readonly kind: "malformed" }
  | { readonly kind: "checking"; readonly uid: Uid }
  | { readonly kind: "found"; readonly player: Player }
  | {
      readonly kind: "failed";
      readonly reason: FailureReason;
      readonly attemptsLeft: number;
    }
  | { readonly kind: "handed-off"; readonly reason: FailureReason }
  | { readonly kind: "unavailable" }
  | { readonly kind: "paused"; readonly resumesAt: Date }
  | { readonly kind: "resumed" }
  | { readonly kind: "linked"; readonly uid: Uid }
  | { readonly kind: "abandoned"; readonly reason: AbandonReason }
  | { readonly kind: "ended" }
  | { readonly kind: "ignored" };

/** The Interview after an event, with the event that happened. */
export interface InterviewTransition {
  readonly interview: OnboardingInterview;
  readonly event: InterviewEvent;
}

/** What one more failed attempt does: asks again with the new count, or hands off at the maximum. */
type AfterFailure =
  | { readonly handedOff: false; readonly failedAttempts: 1 | 2 | 3 | 4 }
  | { readonly handedOff: true };

const AFTER_FAILURE: Record<OpenFailedAttempts, AfterFailure> = {
  0: { handedOff: false, failedAttempts: 1 },
  1: { handedOff: false, failedAttempts: 2 },
  2: { handedOff: false, failedAttempts: 3 },
  3: { handedOff: false, failedAttempts: 4 },
  4: { handedOff: true },
};

/** Opens an Onboarding Interview asking the Member for their uid, with no failed attempt. */
export function startInterview(
  input: NewInterview,
  now: Date,
): InterviewTransition {
  return {
    interview: {
      step: "awaiting-uid",
      id: input.id,
      memberId: input.memberId,
      threadId: input.threadId,
      failedAttempts: 0,
      startedAt: now,
      lastAskedAt: now,
    },
    event: { kind: "asked" },
  };
}

/**
 * The Member typed a uid. A valid one starts a check; a malformed one is asked again without counting an attempt.
 * `now` is accepted so that every transition takes the clock the same way; giving a uid does not move the clock.
 */
export function giveUid(
  interview: OnboardingInterview,
  typed: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- uniform transition signature, see the doc comment
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  if (interview.step !== "awaiting-uid") return ignore(interview);
  const parsed = parseInterviewUid(typed);
  if (!parsed.ok) return { interview, event: { kind: "malformed" } };
  return {
    interview: {
      step: "checking",
      ...fieldsOf(interview),
      failedAttempts: interview.failedAttempts,
      lastAskedAt: interview.lastAskedAt,
      uid: parsed.value,
    },
    event: { kind: "checking", uid: parsed.value },
  };
}

/**
 * The Game API answered the uid check. A found Player waits for confirmation; a refusal counts an attempt, except
 * an unavailable Game API or a Daily Quota, which pause or retry without one.
 */
export function uidChecked(
  interview: OnboardingInterview,
  check: UidCheck,
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  if (interview.step !== "checking") return ignore(interview);
  switch (check.kind) {
    case "found":
      return {
        interview: {
          step: "awaiting-confirmation",
          ...fieldsOf(interview),
          failedAttempts: interview.failedAttempts,
          lastAskedAt: now,
          player: check.player,
        },
        event: { kind: "found", player: check.player },
      };
    case "quota-spent":
      return {
        interview: {
          step: "paused-for-quota",
          ...fieldsOf(interview),
          failedAttempts: interview.failedAttempts,
          resumesAt: check.resetsAt,
        },
        event: { kind: "paused", resumesAt: check.resetsAt },
      };
    case "unavailable":
      return {
        interview: awaitingUid(interview, now),
        event: { kind: "unavailable" },
      };
    case "not-found":
    case "not-prepared":
    case "already-linked":
      return failed(interview, check.kind, now);
  }
}

/** The Member confirmed the Player shown: the Link is made, or the uid turned out to be Linked already. */
export function confirm(
  interview: OnboardingInterview,
  outcome: ConfirmOutcome,
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  if (interview.step !== "awaiting-confirmation") return ignore(interview);
  if (outcome.kind === "already-linked")
    return failed(interview, "already-linked", now);
  return {
    interview: {
      step: "linked",
      ...fieldsOf(interview),
      failedAttempts: interview.failedAttempts,
      endedAt: now,
      uid: interview.player.uid,
    },
    event: { kind: "linked", uid: interview.player.uid },
  };
}

/** The Member pressed "That's not me": a failed attempt. */
export function reject(
  interview: OnboardingInterview,
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  if (interview.step !== "awaiting-confirmation") return ignore(interview);
  return failed(interview, "rejected", now);
}

/** The Daily Quota reset: the Member is asked for their uid again. */
export function quotaReset(
  interview: OnboardingInterview,
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  if (interview.step !== "paused-for-quota") return ignore(interview);
  return {
    interview: awaitingUid(interview, now),
    event: { kind: "resumed" },
  };
}

/** The timeout ran out while the Interview waited for the Member: it is abandoned as timed out. */
export function timeOut(
  interview: OnboardingInterview,
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  if (
    interview.step !== "awaiting-uid" &&
    interview.step !== "awaiting-confirmation"
  )
    return ignore(interview);
  return abandon(interview, "timed-out", now);
}

/** The Member left the server: an open Interview is abandoned as left, whatever its step. */
export function memberLeft(
  interview: OnboardingInterview,
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  return abandon(interview, "left", now);
}

/** After a restart, a check that was in flight is lost: the Member is asked for their uid again, no attempt counted. */
export function recoverAfterRestart(
  interview: OnboardingInterview,
  now: Date,
): InterviewTransition {
  if (!isOpen(interview)) return refuse(interview);
  if (interview.step !== "checking") return ignore(interview);
  return {
    interview: awaitingUid(interview, now),
    event: { kind: "asked" },
  };
}

/**
 * When the Interview is due to time out: a timeout after the last ask while awaiting the Member, or the quota reset
 * while paused. Undefined for checking and ended Interviews.
 */
export function dueAt(
  interview: OnboardingInterview,
  timeoutMs: number,
): Date | undefined {
  switch (interview.step) {
    case "awaiting-uid":
    case "awaiting-confirmation":
      return new Date(interview.lastAskedAt.getTime() + timeoutMs);
    case "paused-for-quota":
      return interview.resumesAt;
    case "checking":
    case "linked":
    case "handed-off":
    case "abandoned":
      return undefined;
  }
}

function isOpen(interview: OnboardingInterview): interview is OpenInterview {
  return (
    interview.step !== "linked" &&
    interview.step !== "handed-off" &&
    interview.step !== "abandoned"
  );
}

function fieldsOf(interview: InterviewBase): InterviewBase {
  return {
    id: interview.id,
    memberId: interview.memberId,
    threadId: interview.threadId,
    startedAt: interview.startedAt,
  };
}

/** An ended Interview refuses every event: nothing changes and the adapter says so. */
function refuse(interview: OnboardingInterview): InterviewTransition {
  return { interview, event: { kind: "ended" } };
}

/** An event that does not apply to the current step: nothing changes. */
function ignore(interview: OnboardingInterview): InterviewTransition {
  return { interview, event: { kind: "ignored" } };
}

function awaitingUid(interview: OpenInterview, now: Date): AwaitingUid {
  return {
    step: "awaiting-uid",
    ...fieldsOf(interview),
    failedAttempts: interview.failedAttempts,
    lastAskedAt: now,
  };
}

/** Counts a failed attempt: the Interview asks again, or is handed off at the maximum. */
function failed(
  interview: OpenInterview,
  reason: FailureReason,
  now: Date,
): InterviewTransition {
  const after = AFTER_FAILURE[interview.failedAttempts];
  if (after.handedOff) {
    return {
      interview: {
        step: "handed-off",
        ...fieldsOf(interview),
        failedAttempts: MAX_FAILED_ATTEMPTS,
        endedAt: now,
      },
      event: { kind: "handed-off", reason },
    };
  }
  return {
    interview: {
      step: "awaiting-uid",
      ...fieldsOf(interview),
      failedAttempts: after.failedAttempts,
      lastAskedAt: now,
    },
    event: {
      kind: "failed",
      reason,
      attemptsLeft: MAX_FAILED_ATTEMPTS - after.failedAttempts,
    },
  };
}

function abandon(
  interview: OpenInterview,
  reason: AbandonReason,
  now: Date,
): InterviewTransition {
  return {
    interview: {
      step: "abandoned",
      ...fieldsOf(interview),
      failedAttempts: interview.failedAttempts,
      endedAt: now,
      reason,
    },
    event: { kind: "abandoned", reason },
  };
}
