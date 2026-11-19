import { NAP_MOTION_MAX_TEXT } from "../domain/nap-motion.js";
import { NAP_REPORT_MAX_NOTE, NAP_REPORT_MAX_TEXT, type NapReportOutcome } from "../domain/nap-report.js";
import type { MemberId } from "../domain/rank-approval.js";
import { allianceLabel } from "./city-rotation-texts.js";
import { timestamp } from "./timestamps.js";

/** How each Report Outcome reads in Neil's messages. */
export const NAP_REPORT_OUTCOME_LABELS: Readonly<Record<NapReportOutcome, string>> = {
  dismissed: "Dismissed",
  warning: "Warning",
  compensation: "Compensation",
  expelled: "Expelled from the NaP",
  exile: "Exile (REAPER)",
};

/** The accused Alliance as Neil names it: `[TAG]`. */
function accused(tag: string): string {
  return allianceLabel(tag, undefined);
}

/** The name of a NaP Report's private thread in #nap-leaders, within Discord's 100 characters. */
export function napReportThreadName(number: number, tag: string): string {
  return `NaP report ${number.toString()} · ${accused(tag)}`.slice(0, 100);
}

/**
 * The text of the NaP Motion a Report Outcome is put to (ADR 28). It goes to #nap-leaders and to the public decision log,
 * so it names only the report's number, the accused Alliance and the proposed outcome: never the note, the evidence,
 * the reporter or any Member.
 */
export function napReportMotionText(number: number, tag: string, outcome: NapReportOutcome): string {
  return `NaP report ${number.toString()} on ${accused(tag)}: proposed outcome ${NAP_REPORT_OUTCOME_LABELS[outcome]}.`.slice(
    0,
    NAP_MOTION_MAX_TEXT,
  );
}

/**
 * The public log entry in #nap-announcements for an approved Report Outcome: only the report's number, the accused
 * Alliance, the outcome and the date. It never names the reporter, any Member or the evidence.
 */
export function napReportAnnouncement(number: number, tag: string, outcome: NapReportOutcome, at: Date): string {
  return `⚖️ **NaP report ${number.toString()}** on ${accused(tag)}: ${NAP_REPORT_OUTCOME_LABELS[outcome]} (decided by the NaP Council, ${timestamp(at, "D")}).`;
}

/** Neil's first message in a NaP Report's private thread: the report, and where the evidence goes. Mentions are off. */
export function napReportThreadIntro(report: {
  readonly number: number;
  readonly accusedTag: string;
  readonly accusedUid: string | undefined;
  readonly what: string;
  readonly reportedBy: MemberId;
  readonly reporterTag: string;
  readonly reportedAt: Date;
}): string {
  const n = report.number.toString();
  const player = report.accusedUid === undefined ? "" : `, accused Player ${report.accusedUid}`;
  return [
    `**NaP report ${n}** on ${accused(report.accusedTag)}${player}`,
    `Reported by <@${report.reportedBy}> of ${accused(report.reporterTag)}, ${timestamp(report.reportedAt, "f")}.`,
    "",
    report.what,
    "",
    "Post the evidence in this thread: screenshots, battle reports, coordinates. The accused Alliance's R5 can answer here. " +
      "Nothing here leaves this thread, and Neil never deletes it.",
    `A member of the NaP Council proposes an outcome with \`/nap report-outcome report:${n}\`; the NaP Council decides it by NaP Motion.`,
  ].join("\n");
}

/** The texts of the NaP Reports; every answer to a command is private. */
export const napReportMessages = {
  refusedReport:
    "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may file a NaP report.",
  ownAlliance: "You cannot report your own Alliance.",
  notInNap: (tag: string): string => `${accused(tag)} is not in the NaP. Only an Alliance in the NaP can be reported.`,
  blankWhat: "Say what happened.",
  whatTooLong: `What happened may be at most ${NAP_REPORT_MAX_TEXT.toString()} characters long.`,
  badPlayer: "The accused Player needs a valid uid (digits only).",
  noLeaders: "Neil could not file the NaP report: the server has no #nap-leaders. Ask an Officer.",
  threadFailed: "Neil could not open the private thread in #nap-leaders, so nothing was filed. Try again later, or ask an Officer.",
  filed: (number: number, threadId: string): string =>
    `Neil filed NaP report ${number.toString()} and opened its private thread <#${threadId}>. Post the evidence there.`,

  refusedPropose:
    "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may propose an outcome for a NaP report.",
  badOutcome: "Neil does not know this outcome.",
  noteTooLong: `The note may be at most ${NAP_REPORT_MAX_NOTE.toString()} characters long.`,
  unknownReport: (number: number): string => `There is no NaP report ${number.toString()}.`,
  decided: (number: number): string => `NaP report ${number.toString()} is already decided.`,
  waiting: (number: number): string =>
    `An outcome for NaP report ${number.toString()} still waits for its NaP Motion. Propose another once it is decided.`,
  noAccusedPlayer: (number: number): string =>
    `NaP report ${number.toString()} names no accused Player, so Exile cannot be proposed.`,
  motionNoLeaders: "Neil could not put the outcome to a NaP Motion: the server has no #nap-leaders. Ask an Officer.",
  motionPostFailed:
    "Neil could not post the NaP Motion in #nap-leaders, so nothing was proposed. Try again later, or ask an Officer.",
  proposed: (number: number, motion: number, endsAt: Date): string =>
    `Neil put the outcome for NaP report ${number.toString()} to NaP Motion #${motion.toString()} in #nap-leaders. The NaP Council votes until ${timestamp(endsAt, "f")} (${timestamp(endsAt, "R")}).`,

  threadProposed: (outcome: NapReportOutcome, motion: number, endsAt: Date, note: string | undefined): string =>
    `Proposed outcome: **${NAP_REPORT_OUTCOME_LABELS[outcome]}**, put to NaP Motion #${motion.toString()} until ${timestamp(endsAt, "f")}.` +
    (note === undefined ? "" : `\nNote: ${note}`),
  threadApproved: (outcome: NapReportOutcome, motion: number): string =>
    `NaP Motion #${motion.toString()} approved the outcome **${NAP_REPORT_OUTCOME_LABELS[outcome]}**. This report is decided.`,
  threadRejected: (outcome: NapReportOutcome, motion: number): string =>
    `NaP Motion #${motion.toString()} rejected the outcome **${NAP_REPORT_OUTCOME_LABELS[outcome]}**. The report stays open for another proposal.`,
  threadExileAdded: (confirmation: string): string => confirmation,
  threadExileKept: (confirmation: string): string => `${confirmation} The Exile stays as it was.`,
  threadExileNotRead: (uid: string): string =>
    `Neil could not read Player ${uid} from the game, so the Exile was not added. Add it by hand with \`/reaper add\`.`,

  logFiled: (memberId: MemberId, number: number, tag: string, notAdded: readonly string[]): string =>
    `<@${memberId}> filed NaP report ${number.toString()} on [${tag}].` +
    (notAdded.length === 0 ? "" : ` Not added to its thread: ${notAdded.map((id) => `<@${id}>`).join(", ")}.`),
  logNotFiled: (memberId: MemberId, tag: string, reason: string): string =>
    `The NaP report by <@${memberId}> on [${tag}] was not filed: ${reason}.`,
  logProposed: (memberId: MemberId, number: number, outcome: NapReportOutcome, motion: number): string =>
    `NaP Council member <@${memberId}> proposed the outcome ${NAP_REPORT_OUTCOME_LABELS[outcome]} for NaP report ${number.toString()}, put to NaP Motion #${motion.toString()}.`,
  logNotProposed: (memberId: MemberId, number: number, reason: string): string =>
    `The outcome for NaP report ${number.toString()} proposed by <@${memberId}> was not saved: the NaP Motion could not be opened (${reason}).`,
  logApproved: (number: number, outcome: NapReportOutcome, motion: number): string =>
    `NaP report ${number.toString()} was decided by NaP Motion #${motion.toString()}: ${NAP_REPORT_OUTCOME_LABELS[outcome]}.`,
  logRejected: (number: number, outcome: NapReportOutcome, motion: number): string =>
    `The outcome ${NAP_REPORT_OUTCOME_LABELS[outcome]} for NaP report ${number.toString()} was rejected by NaP Motion #${motion.toString()}; the report stays open.`,
  logExileNotAdded: (number: number, uid: string, reason: string): string =>
    `The Exile of Player ${uid} decided on NaP report ${number.toString()} was not added: ${reason}. Add it with /reaper add.`,
  logThreadPostFailed: (number: number, reason: string): string =>
    `Posting in the thread of NaP report ${number.toString()} failed: ${reason}`,
  logNoAnnouncements: (number: number): string =>
    `The outcome of NaP report ${number.toString()} was not announced: the server has no #nap-announcements.`,
  logAnnouncementFailed: (number: number, reason: string): string =>
    `Announcing the outcome of NaP report ${number.toString()} in #nap-announcements failed: ${reason}`,
} as const;
