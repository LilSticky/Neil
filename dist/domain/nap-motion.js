import { sameTag } from "./city-rotation.js";
import { isNapCouncilMember, voteResult, } from "./nap.js";
const HOUR_MS = 60 * 60 * 1000;
/** How many hours a NaP Motion's vote runs when the opener gives none: the same as the NaP Vote on a join request. */
export const NAP_MOTION_DEFAULT_HOURS = 48;
/** The fewest hours a NaP Motion's vote may run. */
export const NAP_MOTION_MIN_HOURS = 1;
/** The most hours a NaP Motion's vote may run: one week. */
export const NAP_MOTION_MAX_HOURS = 168;
/** The longest text of a NaP Motion, in characters. */
export const NAP_MOTION_MAX_TEXT = 500;
/** How long before the deadline the Linked R5s who have not voted are reminded (halfway for shorter motions). */
export const NAP_MOTION_REMINDER_MS = 24 * HOUR_MS;
/** Whether a Member may open a NaP Motion: only a member of the NaP Council, so nobody while the NaP is empty. */
export function mayOpenMotion(allianceTag, history) {
    return isNapCouncilMember(allianceTag, history);
}
/** Whether `hours` is a whole number of hours a NaP Motion's vote may run. */
export function isMotionHours(hours) {
    return Number.isInteger(hours) && hours >= NAP_MOTION_MIN_HOURS && hours <= NAP_MOTION_MAX_HOURS;
}
/** When the vote on a motion opened at `openedAt` and running `hours` hours ends. */
export function motionEndsAt(openedAt, hours) {
    return new Date(openedAt.getTime() + hours * HOUR_MS);
}
/**
 * When the Linked R5s who have not voted on a motion are reminded: 24 hours before its deadline, or halfway through a
 * motion shorter than 48 hours.
 */
export function motionReminderAt(openedAt, endsAt) {
    const runs = endsAt.getTime() - openedAt.getTime();
    return new Date(endsAt.getTime() - Math.min(NAP_MOTION_REMINDER_MS, runs / 2));
}
/**
 * Counts a NaP Motion like a NaP Vote: one vote per Alliance, only Alliances in the NaP at the deadline count, and more
 * Approve than Decline votes approve it; a tie or no votes reject it. There is no quorum.
 */
export function motionResult(votes, members) {
    const result = voteResult(votes, members);
    return {
        outcome: result.outcome === "approved" ? "approved" : "rejected",
        approve: result.approve,
        decline: result.decline,
    };
}
/** The Alliances in the NaP with no vote on the motion, in the order they joined. */
export function alliancesWithoutVote(members, votes) {
    return members.filter((member) => !votes.some((vote) => sameTag(vote.allianceTag, member.tag)));
}
/** Each Alliance in the NaP with its vote on the motion, or undefined when it did not vote, in the order they joined. */
export function votesByAlliance(members, votes) {
    return members.map((member) => ({
        tag: member.tag,
        vote: votes.find((vote) => sameTag(vote.allianceTag, member.tag))?.vote,
    }));
}
//# sourceMappingURL=nap-motion.js.map