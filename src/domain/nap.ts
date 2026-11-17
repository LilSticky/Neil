import { sameTag } from "./city-rotation.js";
import type { Editor } from "./exile.js";
import type { KingdomNumber } from "./lookup-input.js";
import type { MemberId } from "./rank-approval.js";

/** How long a NaP Vote runs: from when it opens until the NaP Council's votes are counted. */
export const NAP_VOTE_MS = 48 * 60 * 60 * 1000;

/** How long a declined Alliance waits before it may ask to join the NaP again: the NaP Cooldown. */
export const NAP_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** A vote of the NaP Council on a join request. */
export type NapVoteChoice = "approve" | "decline";

/**
 * How a join request was decided: by an Officer while the NaP had no members, by one member of the NaP Council (the
 * single approver before NaP Votes, kept for old entries), or by a NaP Vote with its counts and no Member named.
 */
export type NapDecision =
  | { readonly as: "officer" | "council"; readonly by: MemberId }
  | { readonly as: "vote"; readonly approve: number; readonly decline: number };

/**
 * One entry of the NaP's history: an Alliance joined, was declined, or left. Members are named only by their Discord
 * user id.
 */
export type NapEvent =
  | {
      readonly kind: "joined" | "declined";
      readonly tag: string;
      readonly requestedBy: MemberId;
      readonly requestedAt: Date;
      readonly decision: NapDecision;
      readonly at: Date;
    }
  | { readonly kind: "left"; readonly tag: string; readonly leftBy: MemberId; readonly at: Date };

/** One Alliance's vote on a join request, cast by one of its Linked R5s. */
export interface NapVote {
  readonly allianceTag: string;
  readonly voterId: MemberId;
  readonly vote: NapVoteChoice;
  readonly at: Date;
}

/** The outcome of a NaP Vote and its counts. */
export interface NapVoteResult {
  readonly outcome: "approved" | "declined";
  readonly approve: number;
  readonly decline: number;
}

/** A NaP Cooldown: when the Alliance was declined, and when it may ask again. */
export interface NapCooldown {
  readonly declinedAt: Date;
  readonly endsAt: Date;
}

/** An Alliance in the NaP, and when it last joined. */
export interface NapMember {
  readonly tag: string;
  readonly since: Date;
}

/**
 * The Alliances in the NaP: those whose latest event in the history (oldest first) is a join. Tags are compared ignoring
 * letter case; the members are listed in the order they joined.
 */
export function napMembers(history: readonly NapEvent[]): readonly NapMember[] {
  return latestEvents(history)
    .filter((event) => event.kind === "joined")
    .map((event) => ({ tag: event.tag, since: event.at }))
    .sort((a, b) => a.since.getTime() - b.since.getTime());
}

/** An Alliance that left the NaP and has not joined again, and when it last left. */
export interface NapFormerMember {
  readonly tag: string;
  readonly leftAt: Date;
}

/** Where an Alliance stands in the NaP: a member since when, or not a member, with when it last left if it ever did. */
export type NapStatus =
  | { readonly kind: "member"; readonly since: Date }
  | { readonly kind: "not-member"; readonly leftAt: Date | undefined };

/** The latest event of every Alliance in the history (oldest first), tags compared ignoring letter case. */
function latestEvents(history: readonly NapEvent[]): readonly NapEvent[] {
  const latest = new Map<string, NapEvent>();
  for (const event of history) {
    if (event.kind === "declined") continue;
    const key = event.tag.toLowerCase();
    latest.delete(key);
    latest.set(key, event);
  }
  return [...latest.values()];
}

/** The Alliances whose latest event in the history is a leave, the newest leave first. */
export function napFormerMembers(history: readonly NapEvent[]): readonly NapFormerMember[] {
  return latestEvents(history)
    .filter((event) => event.kind === "left")
    .map((event) => ({ tag: event.tag, leftAt: event.at }))
    .sort((a, b) => b.leftAt.getTime() - a.leftAt.getTime());
}

/**
 * Where a Home Kingdom Alliance stands in the NaP. Undefined for an Alliance of another Kingdom: the register knows
 * Alliances only by tag, so another Kingdom's Alliance with the same tag must never match.
 */
export function napStatusOf(
  history: readonly NapEvent[],
  homeKingdom: KingdomNumber,
  alliance: { readonly kingdom: KingdomNumber; readonly tag: string },
): NapStatus | undefined {
  if (alliance.kingdom !== homeKingdom) return undefined;
  const member = napMembers(history).find((entry) => sameTag(entry.tag, alliance.tag));
  if (member !== undefined) return { kind: "member", since: member.since };
  const former = napFormerMembers(history).find((entry) => sameTag(entry.tag, alliance.tag));
  return { kind: "not-member", leftAt: former?.leftAt };
}

/** Whether the Alliance with this tag is in the NaP. */
export function isNapMember(history: readonly NapEvent[], tag: string): boolean {
  return napMembers(history).some((member) => sameTag(member.tag, tag));
}

/**
 * The tag of the Home Kingdom Alliance the Member is Linked R5 of: their rank is R5 from the Game API or a Rank Approval,
 * their Alliance is in the Home Kingdom and its tag is known. Undefined otherwise (the same rule as the City Rotation's
 * editors).
 */
export function linkedR5AllianceOf(editor: Editor, homeKingdom: KingdomNumber): string | undefined {
  const { allianceRank, allianceKingdom, allianceTag } = editor;
  if (allianceKingdom !== homeKingdom || allianceTag === undefined || allianceTag === "") return undefined;
  if (allianceRank.source !== "game-api" && allianceRank.source !== "rank-approval") return undefined;
  return allianceRank.rank === "R5" ? allianceTag : undefined;
}

/** Whether a Member is on the NaP Council: they are the Linked R5 of an Alliance in the NaP. */
export function isNapCouncilMember(allianceTag: string | undefined, history: readonly NapEvent[]): boolean {
  return allianceTag !== undefined && isNapMember(history, allianceTag);
}

/**
 * The NaP Cooldown of the Alliance with this tag (ignoring letter case): its latest decline plus NAP_COOLDOWN_MS, when it
 * has not joined since. Undefined when it was never declined. Whether the cooldown still runs depends on the time.
 */
export function cooldownEndOf(history: readonly NapEvent[], tag: string): NapCooldown | undefined {
  let cooldown: NapCooldown | undefined;
  for (const event of history) {
    if (!sameTag(event.tag, tag)) continue;
    if (event.kind === "declined") {
      cooldown = { declinedAt: event.at, endsAt: new Date(event.at.getTime() + NAP_COOLDOWN_MS) };
    } else if (event.kind === "joined") {
      cooldown = undefined;
    }
  }
  return cooldown;
}

/** The NaP Cooldown of the Alliance with this tag when it still runs at `now`; undefined otherwise. */
export function runningCooldownOf(history: readonly NapEvent[], tag: string, now: Date): NapCooldown | undefined {
  const cooldown = cooldownEndOf(history, tag);
  return cooldown !== undefined && cooldown.endsAt.getTime() > now.getTime() ? cooldown : undefined;
}

/**
 * Whether the Linked R5 of `allianceTag` may ask for it to join: they are a Linked R5, their Alliance is not in the NaP,
 * no NaP Cooldown of it runs at `now`, and no join request for it is open.
 */
export function mayAskToJoin(
  allianceTag: string | undefined,
  history: readonly NapEvent[],
  openRequestTags: readonly string[],
  now: Date,
): boolean {
  if (allianceTag === undefined || isNapMember(history, allianceTag)) return false;
  if (runningCooldownOf(history, allianceTag, now) !== undefined) return false;
  return !openRequestTags.some((tag) => sameTag(tag, allianceTag));
}

/**
 * Whether, and how, a Member may decide a join request: as `council` (they vote in the NaP Vote) when they are the
 * Linked R5 of an Alliance in the NaP; as `officer` (they decide alone, at once) when they are an Officer and the NaP has
 * no members; undefined when they may not.
 */
export function mayDecide(
  member: { readonly allianceTag: string | undefined; readonly officer: boolean },
  history: readonly NapEvent[],
): "council" | "officer" | undefined {
  if (isNapCouncilMember(member.allianceTag, history)) return "council";
  if (member.officer && napMembers(history).length === 0) return "officer";
  return undefined;
}

/**
 * Counts a NaP Vote: one vote per Alliance, and only the votes of Alliances in the NaP now (votes of Alliances that left
 * are ignored). More Approve than Decline votes approve; a tie or no votes at all decline.
 */
export function voteResult(votes: readonly NapVote[], members: readonly NapMember[]): NapVoteResult {
  const counted = new Map<string, NapVoteChoice>();
  for (const vote of votes) {
    if (members.some((member) => sameTag(member.tag, vote.allianceTag))) counted.set(vote.allianceTag.toLowerCase(), vote.vote);
  }
  const choices = [...counted.values()];
  const approve = choices.filter((choice) => choice === "approve").length;
  const decline = choices.length - approve;
  return { outcome: approve > decline ? "approved" : "declined", approve, decline };
}

/** Whether the Linked R5 of `allianceTag` may take it out of the NaP: it is in the NaP. Nobody else's approval is needed. */
export function mayLeave(allianceTag: string | undefined, history: readonly NapEvent[]): boolean {
  return isNapCouncilMember(allianceTag, history);
}
