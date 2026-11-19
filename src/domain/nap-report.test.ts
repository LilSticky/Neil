import { describe, expect, test } from "vitest";
import type { Uid } from "./lookup-input.js";
import type { NapEvent } from "./nap.js";
import {
  decidedOutcomeOf,
  isNapReportOutcome,
  mayProposeOutcome,
  mayReport,
  NAP_REPORT_MAX_TEXT,
  napReportTextProblem,
  waitingProposalOf,
  type NapReport,
  type NapReportProposal,
} from "./nap-report.js";

const AT = new Date("2026-11-19T12:00:00.000Z");

function joined(tag: string): NapEvent {
  return {
    kind: "joined",
    tag,
    requestedBy: "111111111111111111",
    requestedAt: AT,
    decision: { as: "officer", by: "222222222222222222" },
    at: AT,
  };
}

const history: readonly NapEvent[] = [
  joined("ABC"),
  joined("XYZ"),
  joined("OLD"),
  { kind: "left", tag: "OLD", leftBy: "111111111111111111", at: AT },
];

function report(number: number, accusedUid: string | null = "12345"): NapReport {
  return {
    number,
    accusedTag: "XYZ",
    accusedUid: accusedUid === null ? undefined : (accusedUid as Uid),
    what: "Hit our farms",
    reporterTag: "ABC",
    reportedAt: AT,
  };
}

function proposal(id: number, reportNumber: number, kind: "proposed" | "approved" | "rejected"): NapReportProposal {
  return {
    id,
    report: reportNumber,
    outcome: "warning",
    proposedAt: AT,
    status: kind === "proposed" ? { kind } : { kind, decidedAt: AT },
  };
}

describe("mayReport", () => {
  test("the R5 of an Alliance in the NaP may report another Alliance in the NaP, ignoring letter case", () => {
    expect(mayReport("ABC", "XYZ", history)).toBe(true);
    expect(mayReport("abc", "xyz", history)).toBe(true);
  });

  test("refuses a reporter who is not on the NaP Council", () => {
    expect(mayReport(undefined, "XYZ", history)).toBe(false);
    expect(mayReport("NEW", "XYZ", history)).toBe(false);
    expect(mayReport("OLD", "XYZ", history)).toBe(false);
  });

  test("refuses the reporter's own Alliance and an Alliance outside the NaP", () => {
    expect(mayReport("ABC", "abc", history)).toBe(false);
    expect(mayReport("ABC", "OLD", history)).toBe(false);
    expect(mayReport("ABC", "NEW", history)).toBe(false);
  });
});

describe("napReportTextProblem", () => {
  test("refuses a blank or too-long text", () => {
    expect(napReportTextProblem("")).toBe("blank");
    expect(napReportTextProblem("x".repeat(NAP_REPORT_MAX_TEXT + 1))).toBe("too-long");
    expect(napReportTextProblem("x".repeat(NAP_REPORT_MAX_TEXT))).toBeUndefined();
  });
});

describe("isNapReportOutcome", () => {
  test("knows the five Report Outcomes only", () => {
    for (const outcome of ["dismissed", "warning", "compensation", "expelled", "exile"]) {
      expect(isNapReportOutcome(outcome)).toBe(true);
    }
    expect(isNapReportOutcome("banned")).toBe(false);
  });
});

describe("decidedOutcomeOf and waitingProposalOf", () => {
  test("find the approved and the waiting proposal of one report", () => {
    const proposals = [proposal(1, 1, "rejected"), proposal(2, 1, "approved"), proposal(3, 2, "proposed")];
    expect(decidedOutcomeOf(1, proposals)?.id).toBe(2);
    expect(decidedOutcomeOf(2, proposals)).toBeUndefined();
    expect(waitingProposalOf(2, proposals)?.id).toBe(3);
    expect(waitingProposalOf(1, proposals)).toBeUndefined();
  });
});

describe("mayProposeOutcome", () => {
  test("allows an outcome for an open report, also after a rejected proposal", () => {
    expect(mayProposeOutcome(report(1), [], "warning")).toEqual({ ok: true });
    expect(mayProposeOutcome(report(1), [proposal(1, 1, "rejected")], "exile")).toEqual({ ok: true });
  });

  test("refuses an unknown report, a decided report and a second waiting proposal", () => {
    expect(mayProposeOutcome(undefined, [], "warning")).toEqual({ ok: false, refusal: "unknown-report" });
    expect(mayProposeOutcome(report(1), [proposal(1, 1, "approved")], "warning")).toEqual({
      ok: false,
      refusal: "decided",
    });
    expect(mayProposeOutcome(report(1), [proposal(1, 1, "proposed")], "dismissed")).toEqual({
      ok: false,
      refusal: "waiting",
    });
  });

  test("a waiting proposal of another report does not block", () => {
    expect(mayProposeOutcome(report(1), [proposal(1, 2, "proposed")], "warning")).toEqual({ ok: true });
  });

  test("refuses an Exile when the report names no accused Player", () => {
    expect(mayProposeOutcome(report(1, null), [], "exile")).toEqual({ ok: false, refusal: "no-accused-player" });
    expect(mayProposeOutcome(report(1, null), [], "expelled")).toEqual({ ok: true });
  });
});
