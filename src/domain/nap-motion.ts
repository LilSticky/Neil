import { sameTag } from "./city-rotation.js";
import {
  isNapCouncilMember,
  voteResult,
  type NapEvent,
  type NapMember,
  type NapVote,
  type NapVoteChoice,
} from "./nap.js";
import type { MemberId } from "./rank-approval.js";

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

/** The result of a closed NaP Motion: more Approve than Decline votes approve it; a tie or no votes reject it. */
export type NapMotionOutcome = "approved" | "rejected";

/** A closed NaP Motion's result and its counts. */
export interface NapMotionResult {
  readonly outcome: NapMotionOutcome;
  readonly approve: number;
  readonly decline: number;
}

/**
 * A NaP Motion: a matter the NaP Council decides by vote. Its opener (a member of the NaP Council) and the Alliance they
 * opened it for, when it opened and when its vote ends, its message in #nap-leaders once posted, when the Linked R5s who
 * had not voted were reminded, and its result once closed.
 */
export interface NapMotion {
  readonly id: number;
  readonly text: string;
  readonly openedBy: MemberId;
  readonly openerTag: string;
  readonly openedAt: Date;
  readonly endsAt: Date;
  readonly channelId: string | undefined;
  readonly messageId: string | undefined;
  readonly remindedAt: Date | undefined;
  /** Undefined while the motion runs. */
  readonly closed: (NapMotionResult & { readonly at: Date }) | undefined;
}

/** Whether a Member may open a NaP Motion: only a member of the NaP Council, so nobody while the NaP is empty. */
export function mayOpenMotion(allianceTag: string | undefined, history: readonly NapEvent[]): boolean {
  return isNapCouncilMember(allianceTag, history);
}

/** Whether `hours` is a whole number of hours a NaP Motion's vote may run. */
export function isMotionHours(hours: number): boolean {
  return Number.isInteger(hours) && hours >= NAP_MOTION_MIN_HOURS && hours <= NAP_MOTION_MAX_HOURS;
}

/** When the vote on a motion opened at `openedAt` and running `hours` hours ends. */
export function motionEndsAt(openedAt: Date, hours: number): Date {
  return new Date(openedAt.getTime() + hours * HOUR_MS);
}

/**
 * When the Linked R5s who have not voted on a motion are reminded: 24 hours before its deadline, or halfway through a
 * motion shorter than 48 hours.
 */
export function motionReminderAt(openedAt: Date, endsAt: Date): Date {
  const runs = endsAt.getTime() - openedAt.getTime();
  return new Date(endsAt.getTime() - Math.min(NAP_MOTION_REMINDER_MS, runs / 2));
}

/**
 * Counts a NaP Motion like a NaP Vote: one vote per Alliance, only Alliances in the NaP at the deadline count, and more
 * Approve than Decline votes approve it; a tie or no votes reject it. There is no quorum.
 */
export function motionResult(votes: readonly NapVote[], members: readonly NapMember[]): NapMotionResult {
  const result = voteResult(votes, members);
  return {
    outcome: result.outcome === "approved" ? "approved" : "rejected",
    approve: result.approve,
    decline: result.decline,
  };
}

/** The Alliances in the NaP with no vote on the motion, in the order they joined. */
export function alliancesWithoutVote(members: readonly NapMember[], votes: readonly NapVote[]): readonly NapMember[] {
  return members.filter((member) => !votes.some((vote) => sameTag(vote.allianceTag, member.tag)));
}

/** Each Alliance in the NaP with its vote on the motion, or undefined when it did not vote, in the order they joined. */
export function votesByAlliance(
  members: readonly NapMember[],
  votes: readonly NapVote[],
): readonly { readonly tag: string; readonly vote: NapVoteChoice | undefined }[] {
  return members.map((member) => ({
    tag: member.tag,
    vote: votes.find((vote) => sameTag(vote.allianceTag, member.tag))?.vote,
  }));
}
