import { parseInterviewUid, parseUid } from "./lookup-input.js";
/** Failed attempts that hand the Interview off to an Officer. */
export const MAX_FAILED_ATTEMPTS = 5;
const AFTER_FAILURE = {
    0: { handedOff: false, failedAttempts: 1 },
    1: { handedOff: false, failedAttempts: 2 },
    2: { handedOff: false, failedAttempts: 3 },
    3: { handedOff: false, failedAttempts: 4 },
    4: { handedOff: true },
};
/** Opens an Onboarding Interview looking up the Recommended Player, with no failed attempt. */
export function startInterview(input, now) {
    return {
        interview: {
            step: "recommending",
            id: input.id,
            memberId: input.memberId,
            threadId: input.threadId,
            failedAttempts: 0,
            startedAt: now,
            lastAskedAt: now,
        },
        event: { kind: "recommending" },
    };
}
/**
 * The name lookup answered. No Recommended Player asks for the uid at once; one Player waits for "That's me" or
 * "That's not me"; several matches wait for a pick. Neither counts an attempt.
 */
export function recommendationFound(interview, result, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "recommending")
        return ignore(interview);
    switch (result.kind) {
        case "none":
            return { interview: awaitingUid(interview, now), event: { kind: "asked" } };
        case "one":
            return {
                interview: {
                    step: "awaiting-recommendation",
                    ...fieldsOf(interview),
                    failedAttempts: interview.failedAttempts,
                    lastAskedAt: now,
                    recommended: result.player,
                },
                event: { kind: "recommended", player: result.player },
            };
        case "several":
            return {
                interview: {
                    step: "awaiting-pick",
                    ...fieldsOf(interview),
                    failedAttempts: interview.failedAttempts,
                    lastAskedAt: now,
                    matches: result.matches,
                },
                event: { kind: "pick-list", matches: result.matches },
            };
    }
}
/** The Member pressed "That's me": the uid of the Recommended Player is chosen, and the uid is asked for. */
export function acceptRecommendation(interview, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "awaiting-recommendation")
        return ignore(interview);
    return {
        interview: {
            step: "awaiting-uid",
            ...fieldsOf(interview),
            failedAttempts: interview.failedAttempts,
            lastAskedAt: now,
            chosen: { uid: interview.recommended.uid, player: interview.recommended },
        },
        event: { kind: "asked" },
    };
}
/**
 * The Member picked the match at index from the list: its uid is chosen, and the uid is asked for. An index outside
 * the list, or a match without a valid uid, is ignored.
 */
export function pickMatch(interview, index, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "awaiting-pick")
        return ignore(interview);
    const match = interview.matches[index];
    if (match === undefined)
        return ignore(interview);
    const uid = parseUid(match.uid);
    if (!uid.ok)
        return ignore(interview);
    return {
        interview: {
            step: "awaiting-uid",
            ...fieldsOf(interview),
            failedAttempts: interview.failedAttempts,
            lastAskedAt: now,
            chosen: { uid: uid.value, player: undefined },
        },
        event: { kind: "asked" },
    };
}
/** The Member declined the Recommended Player or the pick list ("That's not me", "None of these"): the uid is asked for, no attempt counted. */
export function declineRecommendation(interview, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "awaiting-recommendation" && interview.step !== "awaiting-pick")
        return ignore(interview);
    return { interview: awaitingUid(interview, now), event: { kind: "asked" } };
}
/**
 * The Member typed a uid. A valid one starts a check; a malformed one is asked again without counting an attempt.
 * A uid that is the chosen one goes straight to confirmation when the chosen Player is known, or to a check that keeps
 * the choice when it is not; any other uid drops the choice.
 * `now` is accepted so that every transition takes the clock the same way; giving a uid does not move the clock.
 */
export function giveUid(interview, typed, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- uniform transition signature, see the doc comment
now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "awaiting-uid")
        return ignore(interview);
    const parsed = parseInterviewUid(typed);
    if (!parsed.ok)
        return { interview, event: { kind: "malformed" } };
    const uid = parsed.value;
    const chosen = interview.chosen;
    if (chosen !== undefined && chosen.uid === uid && chosen.player !== undefined) {
        return {
            interview: {
                step: "awaiting-confirmation",
                ...fieldsOf(interview),
                failedAttempts: interview.failedAttempts,
                lastAskedAt: interview.lastAskedAt,
                player: chosen.player,
                confirmedByChoice: true,
            },
            event: { kind: "found", player: chosen.player },
        };
    }
    return {
        interview: {
            step: "checking",
            ...fieldsOf(interview),
            failedAttempts: interview.failedAttempts,
            lastAskedAt: interview.lastAskedAt,
            uid,
            ...withChoice(chosen !== undefined && chosen.uid === uid ? chosen : undefined),
        },
        event: { kind: "checking", uid },
    };
}
/**
 * The Game API answered the uid check. A found Player waits for confirmation (confirmed by the choice when the Member
 * chose this uid); a refusal counts an attempt, except an unavailable Game API or a Daily Quota, which pause or retry
 * without one.
 */
export function uidChecked(interview, check, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "checking")
        return ignore(interview);
    switch (check.kind) {
        case "found":
            return {
                interview: {
                    step: "awaiting-confirmation",
                    ...fieldsOf(interview),
                    failedAttempts: interview.failedAttempts,
                    lastAskedAt: now,
                    player: check.player,
                    ...confirmedByChoiceOf(interview.chosen),
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
export function confirm(interview, outcome, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "awaiting-confirmation")
        return ignore(interview);
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
/**
 * An Officer Links the Member to the uid of the Player the Officer confirmed, after the Interview was handed off. Only a
 * handed-off Interview ends as linked, and it keeps its five failed attempts; the Officer is named in the event, and the
 * Link names them as its madeBy. An open Interview is not handed off, so nothing changes; an ended one refuses.
 */
export function linkByOfficer(interview, uid, officerId, now) {
    if (interview.step === "handed-off") {
        return {
            interview: {
                step: "linked",
                ...fieldsOf(interview),
                failedAttempts: interview.failedAttempts,
                endedAt: now,
                uid,
            },
            event: { kind: "officer-link", uid, officerId },
        };
    }
    return isOpen(interview) ? ignore(interview) : refuse(interview);
}
/** The Member pressed "That's not me": a failed attempt. */
export function reject(interview, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "awaiting-confirmation")
        return ignore(interview);
    return failed(interview, "rejected", now);
}
/** The Daily Quota reset: the Member is asked for their uid again. */
export function quotaReset(interview, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "paused-for-quota")
        return ignore(interview);
    return {
        interview: awaitingUid(interview, now),
        event: { kind: "resumed" },
    };
}
/** The timeout ran out while the Interview waited for the Member: it is abandoned as timed out. */
export function timeOut(interview, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step !== "awaiting-uid" &&
        interview.step !== "awaiting-confirmation" &&
        interview.step !== "awaiting-recommendation" &&
        interview.step !== "awaiting-pick")
        return ignore(interview);
    return abandon(interview, "timed-out", now);
}
/** The Member left the server: an open Interview is abandoned as left, whatever its step. */
export function memberLeft(interview, now) {
    if (!isOpen(interview))
        return refuse(interview);
    return abandon(interview, "left", now);
}
/**
 * After a restart, a lookup or a check that was in flight is lost: the Member is asked for their uid again, no attempt
 * counted. A check keeps the choice the Member made, so that the uid asked again is still the chosen one.
 */
export function recoverAfterRestart(interview, now) {
    if (!isOpen(interview))
        return refuse(interview);
    if (interview.step === "recommending") {
        return { interview: awaitingUid(interview, now), event: { kind: "asked" } };
    }
    if (interview.step === "checking") {
        return {
            interview: { ...awaitingUid(interview, now), ...withChoice(interview.chosen) },
            event: { kind: "asked" },
        };
    }
    return ignore(interview);
}
/**
 * When the Interview is due to time out: a timeout after the last ask while awaiting the Member, or the quota reset
 * while paused. Undefined for lookups, checks and ended Interviews.
 */
export function dueAt(interview, timeoutMs) {
    switch (interview.step) {
        case "awaiting-uid":
        case "awaiting-confirmation":
        case "awaiting-recommendation":
        case "awaiting-pick":
            return new Date(interview.lastAskedAt.getTime() + timeoutMs);
        case "paused-for-quota":
            return interview.resumesAt;
        case "recommending":
        case "checking":
        case "linked":
        case "handed-off":
        case "abandoned":
            return undefined;
    }
}
function isOpen(interview) {
    return (interview.step !== "linked" &&
        interview.step !== "handed-off" &&
        interview.step !== "abandoned");
}
function fieldsOf(interview) {
    return {
        id: interview.id,
        memberId: interview.memberId,
        threadId: interview.threadId,
        startedAt: interview.startedAt,
    };
}
/** The optional `chosen` field, present only when there is a choice. */
function withChoice(chosen) {
    return chosen === undefined ? {} : { chosen };
}
/** The optional `confirmedByChoice` field, set only when the Member chose the uid that was found. */
function confirmedByChoiceOf(chosen) {
    return chosen === undefined ? {} : { confirmedByChoice: true };
}
/** An ended Interview refuses every event: nothing changes and the adapter says so. */
function refuse(interview) {
    return { interview, event: { kind: "ended" } };
}
/** An event that does not apply to the current step: nothing changes. */
function ignore(interview) {
    return { interview, event: { kind: "ignored" } };
}
function awaitingUid(interview, now) {
    return {
        step: "awaiting-uid",
        ...fieldsOf(interview),
        failedAttempts: interview.failedAttempts,
        lastAskedAt: now,
    };
}
/** Counts a failed attempt: the Interview asks again, or is handed off at the maximum. */
function failed(interview, reason, now) {
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
function abandon(interview, reason, now) {
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
//# sourceMappingURL=onboarding-interview.js.map