import { ButtonStyle, ComponentType, type APIActionRowComponent, type APIButtonComponentWithCustomId } from "discord.js";
import type { NapVoteChoice } from "../domain/nap.js";
import { NAP_MOTION_MAX_HOURS, NAP_MOTION_MAX_TEXT, NAP_MOTION_MIN_HOURS, type NapMotionResult } from "../domain/nap-motion.js";
import type { MemberId } from "../domain/rank-approval.js";
import { timestamp } from "./timestamps.js";

/** The custom id prefix of the Approve button of a NaP Motion; it never starts like a join request's `nap-approve:`. */
export const NAP_MOTION_APPROVE_PREFIX = "nap-motion-approve:";

/** The custom id prefix of the Decline button of a NaP Motion. */
export const NAP_MOTION_DECLINE_PREFIX = "nap-motion-decline:";

/** Discord's limit on a message's content, in characters. */
export const CONTENT_LIMIT = 2000;

/** The Approve and Decline buttons of the NaP Motion with this id. */
export function napMotionVoteRow(id: number): APIActionRowComponent<APIButtonComponentWithCustomId> {
  return {
    type: ComponentType.ActionRow,
    components: [
      { type: ComponentType.Button, style: ButtonStyle.Success, label: "Approve", custom_id: `${NAP_MOTION_APPROVE_PREFIX}${id.toString()}` },
      { type: ComponentType.Button, style: ButtonStyle.Danger, label: "Decline", custom_id: `${NAP_MOTION_DECLINE_PREFIX}${id.toString()}` },
    ],
  };
}

/** The vote and motion id an Approve or Decline button of a NaP Motion names; undefined for a custom id Neil did not make. */
export function napMotionVoteOf(customId: string): { readonly vote: NapVoteChoice; readonly id: number } | undefined {
  const vote = customId.startsWith(NAP_MOTION_APPROVE_PREFIX)
    ? "approve"
    : customId.startsWith(NAP_MOTION_DECLINE_PREFIX)
      ? "decline"
      : undefined;
  if (vote === undefined) return undefined;
  const rest = customId.slice((vote === "approve" ? NAP_MOTION_APPROVE_PREFIX : NAP_MOTION_DECLINE_PREFIX).length);
  if (!/^[1-9]\d{0,15}$/u.test(rest)) return undefined;
  const id = Number(rest);
  return Number.isSafeInteger(id) ? { vote, id } : undefined;
}

/** A vote as its button names it. */
function voteName(vote: NapVoteChoice): string {
  return vote === "approve" ? "Approve" : "Decline";
}

/** The counts of a NaP Motion. */
function countsOf(result: { readonly approve: number; readonly decline: number }): string {
  return `${result.approve.toString()} Approve, ${result.decline.toString()} Decline`;
}

/** The motion's text as a block quote, line by line. */
function quoted(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/** The motion's text for the public decision log: mentions of Members and roles are replaced, so no Member is shown. */
export function publicText(text: string): string {
  return text.replace(/<@!?\d+>/gu, "@Member").replace(/<@&\d+>/gu, "@role");
}

/** The decision-log entry, as one or more message contents of at most CONTENT_LIMIT characters, cut only between lines. */
export function splitBetweenLines(lines: readonly string[], limit: number = CONTENT_LIMIT): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of lines.flatMap((entry) => cutLong(entry, limit))) {
    const next = current === "" ? line : `${current}\n${line}`;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    parts.push(current);
    current = line;
  }
  if (current !== "") parts.push(current);
  return parts;
}

/** A line longer than the limit (never one Neil writes) is cut into pieces of the limit. */
function cutLong(line: string, limit: number): string[] {
  if (line.length <= limit) return [line];
  const pieces: string[] = [];
  for (let start = 0; start < line.length; start += limit) pieces.push(line.slice(start, start + limit));
  return pieces;
}

/** One Alliance's line in the decision log: its vote, or that it did not vote. */
export interface AllianceVoteLine {
  readonly alliance: string;
  readonly vote: NapVoteChoice | undefined;
}

/**
 * The decision-log entry in #nap-announcements: the motion's result and counts, the Alliance that opened it, when it
 * opened and closed, its text, and each Alliance in the NaP at the deadline with its vote. No Member is named.
 */
export function decisionLogLines(entry: {
  readonly id: number;
  readonly text: string;
  readonly openerAlliance: string;
  readonly openedAt: Date;
  readonly closedAt: Date;
  readonly result: NapMotionResult;
  readonly votes: readonly AllianceVoteLine[];
}): string[] {
  return [
    `📜 **NaP Motion #${entry.id.toString()}: ${entry.result.outcome}** (${countsOf(entry.result)})`,
    `Opened by ${entry.openerAlliance} on ${timestamp(entry.openedAt, "f")}, closed ${timestamp(entry.closedAt, "f")}.`,
    quoted(publicText(entry.text)),
    "**Votes**",
    ...(entry.votes.length === 0
      ? ["No Alliance was in the NaP at the deadline."]
      : entry.votes.map(({ alliance, vote }) => `- ${alliance}: ${vote === undefined ? "did not vote" : voteName(vote)}`)),
  ];
}

/** The texts of NaP Motions; every answer to a command or button is private. */
export const napMotionMessages = {
  refusedOpen:
    "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may open a NaP Motion.",
  blankText: "A NaP Motion needs a text: what the NaP Council decides.",
  tooLong: `The text of a NaP Motion may be at most ${NAP_MOTION_MAX_TEXT.toString()} characters long.`,
  badHours: `A NaP Motion's vote runs from ${NAP_MOTION_MIN_HOURS.toString()} to ${NAP_MOTION_MAX_HOURS.toString()} hours.`,
  noLeaders: "Neil could not open the NaP Motion: the server has no #nap-leaders. Ask an Officer.",
  postFailed: "Neil could not post the NaP Motion in #nap-leaders. Try again later, or ask an Officer.",
  opened: (id: number, endsAt: Date): string =>
    `Neil opened NaP Motion #${id.toString()} in #nap-leaders. The NaP Council votes until ${timestamp(endsAt, "f")} (${timestamp(endsAt, "R")}).`,
  notOpen: "This NaP Motion is no longer open.",
  refusedVote: "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may vote on a NaP Motion.",
  voteEnded: "The vote on this NaP Motion has ended; Neil counts it within a minute.",
  /** The private answer to a vote on a motion. */
  voted: (id: number, vote: NapVoteChoice, voterAlliance: string, endsAt: Date, previous: NapVoteChoice | undefined): string =>
    `Neil recorded ${voteName(vote)} as the vote of ${voterAlliance} on NaP Motion #${id.toString()}${
      previous === undefined ? "" : ` (it was ${voteName(previous)})`
    }. You can change it until ${timestamp(endsAt, "f")}.`,

  /** The motion in #nap-leaders, with the Approve and Decline buttons. No running count. */
  motion: (id: number, opener: MemberId, openerAlliance: string, text: string, endsAt: Date): string =>
    `<@${opener}> of ${openerAlliance} opened **NaP Motion #${id.toString()}**:\n${quoted(text)}\nThe NaP Council votes with the buttons until ${timestamp(endsAt, "f")} (${timestamp(endsAt, "R")}): one vote per Alliance in the NaP, which can be changed until then. More Approve than Decline votes approve the motion; a tie or no votes reject it. Votes stay hidden until it closes.`,
  /** The motion in #nap-leaders once closed, without its buttons. */
  closed: (id: number, opener: MemberId, openerAlliance: string, text: string, result: NapMotionResult, at: Date): string =>
    `**NaP Motion #${id.toString()}** by <@${opener}> of ${openerAlliance} was ${result.outcome} (${countsOf(result)}) on ${timestamp(at, "f")}:\n${quoted(text)}\nThe result and each Alliance's vote are in #nap-announcements.`,
  /** The reminder in #nap-leaders, before the mentions of the Linked R5s who have not voted. */
  reminder: (id: number, openerAlliance: string, endsAt: Date): string =>
    `⏰ Reminder: the vote on NaP Motion #${id.toString()} by ${openerAlliance} ends ${timestamp(endsAt, "f")} (${timestamp(endsAt, "R")}). These R5s' Alliances have not voted yet:`,

  logOpened: (memberId: MemberId, tag: string, id: number, endsAt: Date): string =>
    `NaP Council member <@${memberId}> of [${tag}] opened NaP Motion #${id.toString()}, voting until ${timestamp(endsAt, "f")}.`,
  logNoLeaders: (memberId: MemberId): string =>
    `The NaP Motion of <@${memberId}> was not opened: the server has no #nap-leaders.`,
  logPostFailed: (memberId: MemberId, reason: string): string =>
    `Posting the NaP Motion of <@${memberId}> in #nap-leaders failed: ${reason}`,
  logVoted: (memberId: MemberId, vote: NapVoteChoice, voterTag: string, id: number, previous: NapVoteChoice | undefined): string =>
    `NaP Council member <@${memberId}> voted ${voteName(vote)} for [${voterTag}] on NaP Motion #${id.toString()}${
      previous === undefined ? "" : `, changed from ${voteName(previous)}`
    }.`,
  logReminded: (id: number, reminded: readonly MemberId[]): string =>
    `Neil reminded ${reminded.map((memberId) => `<@${memberId}>`).join(", ")} to vote on NaP Motion #${id.toString()}.`,
  logNoReminder: (id: number): string =>
    `No reminder for NaP Motion #${id.toString()}: every Alliance in the NaP voted, or no Linked R5 of the others was found.`,
  logReminderNoLeaders: (id: number): string =>
    `The reminder for NaP Motion #${id.toString()} was not posted: the server has no #nap-leaders.`,
  logReminderFailed: (id: number, reason: string): string =>
    `Posting the reminder for NaP Motion #${id.toString()} in #nap-leaders failed: ${reason}`,
  logClosed: (id: number, result: NapMotionResult): string =>
    `NaP Motion #${id.toString()} was ${result.outcome}: ${countsOf(result)}.`,
  logEditFailed: (id: number, reason: string): string =>
    `Editing NaP Motion #${id.toString()} in #nap-leaders failed: ${reason}`,
  logNoAnnouncements: (id: number): string =>
    `The result of NaP Motion #${id.toString()} was not posted in the decision log: the server has no #nap-announcements.`,
  logAnnouncementFailed: (id: number, reason: string): string =>
    `Posting the result of NaP Motion #${id.toString()} in #nap-announcements failed: ${reason}`,
} as const;
