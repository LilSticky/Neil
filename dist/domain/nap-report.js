import { sameTag } from "./city-rotation.js";
import { isNapCouncilMember, isNapMember } from "./nap.js";
/** The longest text of what happened in a NaP Report, in characters. */
export const NAP_REPORT_MAX_TEXT = 1000;
/** The longest note on a proposed Report Outcome, in characters. */
export const NAP_REPORT_MAX_NOTE = 500;
/** The Report Outcomes the NaP Council can decide on a NaP Report (ADR 28). */
export const NAP_REPORT_OUTCOMES = ["dismissed", "warning", "compensation", "expelled", "exile"];
/** Whether a text names a Report Outcome. */
export function isNapReportOutcome(value) {
    return NAP_REPORT_OUTCOMES.includes(value);
}
/**
 * Whether the R5 of the Alliance `reporterTag` may report a breach by the Alliance `accusedTag`: the reporter is on the
 * NaP Council, the accused Alliance is in the NaP, and it is not the reporter's own.
 */
export function mayReport(reporterTag, accusedTag, history) {
    return (reporterTag !== undefined &&
        isNapCouncilMember(reporterTag, history) &&
        isNapMember(history, accusedTag) &&
        !sameTag(reporterTag, accusedTag));
}
/** Checks the trimmed text of what happened; undefined when it may be filed. */
export function napReportTextProblem(text) {
    if (text === "")
        return "blank";
    if (text.length > NAP_REPORT_MAX_TEXT)
        return "too-long";
    return undefined;
}
/** The approved Report Outcome of the report; undefined while it is open. */
export function decidedOutcomeOf(report, proposals) {
    return proposals.find((proposal) => proposal.report === report && proposal.status.kind === "approved");
}
/** The Report Outcome of the report that waits for its NaP Motion; undefined when none does. */
export function waitingProposalOf(report, proposals) {
    return proposals.find((proposal) => proposal.report === report && proposal.status.kind === "proposed");
}
/**
 * Whether this Report Outcome may be proposed for the report: only for a known report with no approved outcome and no
 * other proposal waiting for its NaP Motion, and an Exile only when the report names the accused Player. Who may propose
 * is the NaP Motion's rule, checked by the caller.
 */
export function mayProposeOutcome(report, proposals, outcome) {
    if (report === undefined)
        return { ok: false, refusal: "unknown-report" };
    if (decidedOutcomeOf(report.number, proposals) !== undefined)
        return { ok: false, refusal: "decided" };
    if (waitingProposalOf(report.number, proposals) !== undefined)
        return { ok: false, refusal: "waiting" };
    if (outcome === "exile" && report.accusedUid === undefined)
        return { ok: false, refusal: "no-accused-player" };
    return { ok: true };
}
//# sourceMappingURL=nap-report.js.map