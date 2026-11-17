import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
} from "discord.js";
import { NAP_COOLDOWN_MS, type NapDecision, type NapEvent, type NapMember, type NapVoteChoice } from "../domain/nap.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { NapJoinRequest } from "../storage/nap-store.js";
import { timestamp } from "./timestamps.js";

/** The custom id prefix of the Approve button of a NaP join request (also on requests posted before NaP Votes). */
export const NAP_APPROVE_PREFIX = "nap-approve:";

/** The custom id prefix of the Decline button of a NaP join request. */
export const NAP_DECLINE_PREFIX = "nap-decline:";

/** The most history entries /nap history shows. */
export const MAX_HISTORY_ENTRIES = 20;

/** The colour of the NaP embeds. */
const NAP_COLOUR = 0x3b88c3;

/** The Approve and Decline buttons of the join request of `tag`, made at `requestedAt`. */
export function napVoteRow(tag: string, requestedAt: Date): APIActionRowComponent<APIButtonComponentWithCustomId> {
  const suffix = `${tag}:${requestedAt.getTime().toString()}`;
  return {
    type: ComponentType.ActionRow,
    components: [
      { type: ComponentType.Button, style: ButtonStyle.Success, label: "Approve", custom_id: `${NAP_APPROVE_PREFIX}${suffix}` },
      { type: ComponentType.Button, style: ButtonStyle.Danger, label: "Decline", custom_id: `${NAP_DECLINE_PREFIX}${suffix}` },
    ],
  };
}

/** The vote, tag and request time an Approve or Decline button names; undefined for a custom id Neil did not make. */
export function napVoteOf(
  customId: string,
): { readonly vote: NapVoteChoice; readonly tag: string; readonly requestedAt: number } | undefined {
  const vote = customId.startsWith(NAP_APPROVE_PREFIX)
    ? "approve"
    : customId.startsWith(NAP_DECLINE_PREFIX)
      ? "decline"
      : undefined;
  if (vote === undefined) return undefined;
  const rest = customId.slice((vote === "approve" ? NAP_APPROVE_PREFIX : NAP_DECLINE_PREFIX).length);
  const colon = rest.lastIndexOf(":");
  if (colon <= 0) return undefined;
  const tag = rest.slice(0, colon);
  const requestedAt = Number(rest.slice(colon + 1));
  if (!Number.isSafeInteger(requestedAt) || rest.slice(colon + 1) === "") return undefined;
  return { vote, tag, requestedAt };
}

/** A vote as its button names it. */
function voteName(vote: NapVoteChoice): string {
  return vote === "approve" ? "Approve" : "Decline";
}

/** The counts of a NaP Vote. */
function countsOf(approve: number, decline: number): string {
  return `${approve.toString()} Approve, ${decline.toString()} Decline`;
}

/** Who decided, for /nap history: the vote with its counts, or the Member (an Officer marked as such). */
function decidedBy(decision: NapDecision): string {
  if (decision.as === "vote") return `by vote (${countsOf(decision.approve, decision.decline)})`;
  return `by <@${decision.by}>${decision.as === "officer" ? " (Officer)" : ""}`;
}

/**
 * /nap show: the Alliances in the NaP since when, then the open join requests by tag with when their NaP Vote ends, or
 * that an Officer decides while the NaP has no members. No Members are named.
 */
export function napShowEmbed(
  members: readonly NapMember[],
  requests: readonly NapJoinRequest[],
  label: (tag: string) => string,
): APIEmbed {
  const lines: string[] = [];
  if (members.length === 0) {
    lines.push("No Alliance is in the NaP yet.");
  } else {
    lines.push("**Members**", ...members.map((member) => `- ${label(member.tag)}, since ${timestamp(member.since, "D")}`));
  }
  if (requests.length > 0) {
    lines.push("", "**Waiting for a decision**", ...requests.map((request) => `- [${request.tag}], ${waiting(request)}`));
  }
  return { title: "NaP", color: NAP_COLOUR, description: lines.join("\n") };

  function waiting(request: NapJoinRequest): string {
    if (members.length === 0) return "an Officer decides";
    return request.voteEndsAt === undefined ? "the vote opens within a minute" : `vote ends ${timestamp(request.voteEndsAt, "R")}`;
  }
}

/**
 * One history entry: when, which Alliance, joined, declined or left, the Members behind it as mentions, and for a vote
 * only its counts. A decline says when the Alliance may ask again.
 */
export function napHistoryLine(event: NapEvent): string {
  const when = timestamp(event.at, "f");
  if (event.kind === "left") return `${when} [${event.tag}] left, by <@${event.leftBy}>`;
  const asked = `asked by <@${event.requestedBy}> ${timestamp(event.requestedAt, "f")}`;
  if (event.kind === "joined") return `${when} [${event.tag}] joined, ${asked}, approved ${decidedBy(event.decision)}`;
  const askAgain = timestamp(new Date(event.at.getTime() + NAP_COOLDOWN_MS), "D");
  return `${when} [${event.tag}] declined, ${asked}, ${decidedBy(event.decision)}, may ask again ${askAgain}`;
}

/** /nap history: the newest entries first, at most MAX_HISTORY_ENTRIES. */
export function napHistoryEmbed(history: readonly NapEvent[]): APIEmbed {
  const newest = [...history].reverse().slice(0, MAX_HISTORY_ENTRIES);
  const description =
    newest.length === 0 ? "The NaP has no history yet." : newest.map((event) => napHistoryLine(event)).join("\n");
  return { title: "NaP history", color: NAP_COLOUR, description };
}

/** The texts of the NaP register; every answer to a command is private. */
export const napMessages = {
  unknownSubcommand: "Neil does not know this /nap command.",
  refusedNotR5: "Only a Member Linked to the R5 of a Home Kingdom Alliance may ask for it to join the NaP.",
  alreadyMember: (alliance: string): string => `${alliance} is already in the NaP.`,
  requestOpen: (alliance: string): string => `A join request for ${alliance} already waits for a decision in #nap-leaders.`,
  asked: (alliance: string): string =>
    `Neil asked the NaP Council in #nap-leaders to decide on ${alliance} joining the NaP.`,
  cooldown: (alliance: string, declinedAt: Date, endsAt: Date): string =>
    `${alliance} was declined on ${timestamp(declinedAt, "D")} and may ask to join the NaP again ${timestamp(endsAt, "f")} (${timestamp(endsAt, "R")}).`,
  noLeaders: "Neil could not ask the NaP Council: the server has no #nap-leaders. Ask an Officer.",
  reposted: (alliance: string): string =>
    `The join request for ${alliance} was missing in #nap-leaders, so Neil posted it again.`,
  postFailed: "Neil could not post the join request in #nap-leaders. Try again later, or ask an Officer.",
  refusedLeave: "Only a Member Linked to the R5 of an Alliance in the NaP may take it out of the NaP.",
  leftReply: (alliance: string): string => `${alliance} has left the NaP. It may ask to join again with \`/nap join\`.`,
  refusedHistory: "Only the NaP Council and Officers may see the NaP history.",
  notOpen: "This join request is no longer open.",
  refusedVote:
    "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may vote on this, or an Officer decide it while the NaP has no members.",
  voteEnded: "The vote on this join request has ended; Neil counts it within a minute.",
  /** The private answer to a vote of the NaP Council. */
  voted: (vote: NapVoteChoice, voterAlliance: string, alliance: string, endsAt: Date, previous: NapVoteChoice | undefined): string =>
    `Neil recorded ${voteName(vote)} as the vote of ${voterAlliance} on ${alliance} joining the NaP${
      previous === undefined || previous === vote ? "" : ` (it was ${voteName(previous)})`
    }. You can change it until ${timestamp(endsAt, "f")}.`,

  /**
   * The join request in #nap-leaders, with the Approve and Decline buttons: the NaP Vote and until when it runs, or, with
   * no end (the NaP has no members), that an Officer decides.
   */
  joinRequest: (alliance: string, asker: MemberId, voteEndsAt: Date | undefined): string =>
    `<@${asker}> asks for ${alliance} to join the NaP.\n${
      voteEndsAt === undefined
        ? "The NaP has no members yet, so an Officer approves or declines it with the buttons."
        : `The NaP Council votes with the buttons until ${timestamp(voteEndsAt, "f")} (${timestamp(voteEndsAt, "R")}): one vote per Alliance in the NaP, which can be changed until then. More Approve than Decline votes let ${alliance} in; otherwise it is declined and may ask again after 30 days.`
    }`,
  /** The join request once an Officer approved it, without its buttons. */
  approved: (alliance: string, asker: MemberId, officer: MemberId): string =>
    `${alliance} is now in the NaP: asked by <@${asker}>, approved by <@${officer}> (Officer).`,
  /** The join request once an Officer declined it, without its buttons. */
  declinedByOfficer: (alliance: string, asker: MemberId, officer: MemberId, askAgain: Date): string =>
    `${alliance} was declined: asked by <@${asker}>, declined by <@${officer}> (Officer). It may ask again ${timestamp(askAgain, "f")}.`,
  /** The join request once the NaP Vote approved it, without its buttons. */
  approvedByVote: (alliance: string, asker: MemberId, approve: number, decline: number): string =>
    `${alliance} is now in the NaP: asked by <@${asker}>, approved by the NaP Council's vote (${countsOf(approve, decline)}).`,
  /** The join request once the NaP Vote declined it, without its buttons. */
  declinedByVote: (alliance: string, asker: MemberId, approve: number, decline: number, askAgain: Date): string =>
    `${alliance} was declined by the NaP Council's vote (${countsOf(approve, decline)}): asked by <@${asker}>. It may ask again ${timestamp(askAgain, "f")}.`,
  /** The line in #nap-leaders when an Alliance leaves. */
  leftNotice: (alliance: string, member: MemberId): string => `${alliance} has left the NaP, by its R5 <@${member}>.`,

  logRequested: (memberId: MemberId, tag: string): string => `<@${memberId}> asked for [${tag}] to join the NaP.`,
  logApproved: (memberId: MemberId, tag: string, asker: MemberId): string =>
    `Officer <@${memberId}> approved [${tag}] joining the NaP (asked by <@${asker}>).`,
  logDeclined: (memberId: MemberId, tag: string, asker: MemberId, askAgain: Date): string =>
    `Officer <@${memberId}> declined [${tag}] joining the NaP (asked by <@${asker}>); it may ask again ${timestamp(askAgain, "f")}.`,
  logVoted: (memberId: MemberId, vote: NapVoteChoice, voterTag: string, tag: string, previous: NapVoteChoice | undefined): string =>
    `NaP Council member <@${memberId}> voted ${voteName(vote)} for [${voterTag}] on [${tag}] joining the NaP${
      previous === undefined ? "" : `, changed from ${voteName(previous)}`
    }.`,
  logVoteResult: (
    tag: string,
    asker: MemberId,
    result: { readonly outcome: "approved" | "declined"; readonly approve: number; readonly decline: number },
    askAgain: Date,
  ): string =>
    `The NaP Council's vote ${result.outcome} [${tag}] joining the NaP (asked by <@${asker}>): ${countsOf(result.approve, result.decline)}${
      result.outcome === "declined" ? `; it may ask again ${timestamp(askAgain, "f")}` : ""
    }.`,
  logVoteOpened: (tag: string, endsAt: Date): string =>
    `The NaP Council's vote on [${tag}] joining the NaP is open until ${timestamp(endsAt, "f")}.`,
  logEditFailed: (tag: string, reason: string): string =>
    `Editing the NaP join request for [${tag}] in #nap-leaders failed: ${reason}`,
  logLeft: (memberId: MemberId, tag: string): string => `<@${memberId}> took [${tag}] out of the NaP.`,
  logNoLeaders: (tag: string): string => `The NaP join request for [${tag}] was not posted: the server has no #nap-leaders.`,
  logRequestPostFailed: (tag: string, reason: string): string =>
    `Posting the NaP join request for [${tag}] in #nap-leaders failed: ${reason}`,
  logReposted: (memberId: MemberId, tag: string): string =>
    `<@${memberId}> had the NaP join request for [${tag}] posted again in #nap-leaders.`,
  logRepostNoLeaders: (tag: string): string =>
    `The NaP join request for [${tag}] was not posted again: the server has no #nap-leaders.`,
  logRepostFailed: (tag: string, reason: string): string =>
    `Posting the NaP join request for [${tag}] in #nap-leaders again failed: ${reason}`,
  logLeaveNoLeaders: (tag: string): string => `The NaP leave of [${tag}] was not posted: the server has no #nap-leaders.`,
  logLeavePostFailed: (tag: string, reason: string): string =>
    `Posting the NaP leave of [${tag}] in #nap-leaders failed: ${reason}`,
} as const;
