import { sameTag } from "./city-rotation.js";
import type { Uid } from "./lookup-input.js";
import { isNapCouncilMember, isNapMember, type NapEvent } from "./nap.js";

/** The longest text of what happened in a NaP Report, in characters. */
export const NAP_REPORT_MAX_TEXT = 1000;

/** The longest note on a proposed Report Outcome, in characters. */
export const NAP_REPORT_MAX_NOTE = 500;

/** The Report Outcomes the NaP Council can decide on a NaP Report (ADR 28). */
export const NAP_REPORT_OUTCOMES = ["dismissed", "warning", "compensation", "expelled", "exile"] as const;

/**
 * A Report Outcome: dismissed, a warning, compensation, expelled from the NaP, or the accused Player made an Exile in
 * REAPER. Only an approved NaP Motion decides one; Neil never does.
 */
export type NapReportOutcome = (typeof NAP_REPORT_OUTCOMES)[number];

/** Whether a text names a Report Outcome. */
export function isNapReportOutcome(value: string): value is NapReportOutcome {
  return (NAP_REPORT_OUTCOMES as readonly string[]).includes(value);
}

/**
 * A NaP Report: a suspected breach of the NaP by an Alliance in the NaP, filed by the R5 of another one. Its evidence lives
 * only in its private thread; here are its number, the accused Alliance and Player, what happened, and when.
 */
export interface NapReport {
  readonly number: number;
  readonly accusedTag: string;
  readonly accusedUid: Uid | undefined;
  readonly what: string;
  readonly reporterTag: string;
  readonly reportedAt: Date;
}

/** The result of the NaP Motion a Report Outcome was put to. */
export type NapReportVerdict = "approved" | "rejected";

/** The stored state of a proposed Report Outcome: proposed until its NaP Motion closes, then approved or rejected. */
export type NapReportProposalStatus =
  | { readonly kind: "proposed" }
  | { readonly kind: NapReportVerdict; readonly decidedAt: Date };

/** A Report Outcome proposed for a NaP Report and put to a NaP Motion. */
export interface NapReportProposal {
  readonly id: number;
  readonly report: number;
  readonly outcome: NapReportOutcome;
  readonly proposedAt: Date;
  readonly status: NapReportProposalStatus;
}

/**
 * Whether the R5 of the Alliance `reporterTag` may report a breach by the Alliance `accusedTag`: the reporter is on the
 * NaP Council, the accused Alliance is in the NaP, and it is not the reporter's own.
 */
export function mayReport(reporterTag: string | undefined, accusedTag: string, history: readonly NapEvent[]): boolean {
  return (
    reporterTag !== undefined &&
    isNapCouncilMember(reporterTag, history) &&
    isNapMember(history, accusedTag) &&
    !sameTag(reporterTag, accusedTag)
  );
}

/** Why the text of what happened is refused. */
export type NapReportTextProblem = "blank" | "too-long";

/** Checks the trimmed text of what happened; undefined when it may be filed. */
export function napReportTextProblem(text: string): NapReportTextProblem | undefined {
  if (text === "") return "blank";
  if (text.length > NAP_REPORT_MAX_TEXT) return "too-long";
  return undefined;
}

/** The approved Report Outcome of the report; undefined while it is open. */
export function decidedOutcomeOf(
  report: number,
  proposals: readonly NapReportProposal[],
): NapReportProposal | undefined {
  return proposals.find((proposal) => proposal.report === report && proposal.status.kind === "approved");
}

/** The Report Outcome of the report that waits for its NaP Motion; undefined when none does. */
export function waitingProposalOf(
  report: number,
  proposals: readonly NapReportProposal[],
): NapReportProposal | undefined {
  return proposals.find((proposal) => proposal.report === report && proposal.status.kind === "proposed");
}

/** Why a Report Outcome may not be proposed now. */
export type NapReportOutcomeRefusal = "unknown-report" | "decided" | "waiting" | "no-accused-player";

/**
 * Whether this Report Outcome may be proposed for the report: only for a known report with no approved outcome and no
 * other proposal waiting for its NaP Motion, and an Exile only when the report names the accused Player. Who may propose
 * is the NaP Motion's rule, checked by the caller.
 */
export function mayProposeOutcome(
  report: NapReport | undefined,
  proposals: readonly NapReportProposal[],
  outcome: NapReportOutcome,
): { readonly ok: true } | { readonly ok: false; readonly refusal: NapReportOutcomeRefusal } {
  if (report === undefined) return { ok: false, refusal: "unknown-report" };
  if (decidedOutcomeOf(report.number, proposals) !== undefined) return { ok: false, refusal: "decided" };
  if (waitingProposalOf(report.number, proposals) !== undefined) return { ok: false, refusal: "waiting" };
  if (outcome === "exile" && report.accusedUid === undefined) return { ok: false, refusal: "no-accused-player" };
  return { ok: true };
}
