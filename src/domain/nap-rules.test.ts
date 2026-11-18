import { describe, expect, test } from "vitest";
import {
  currentNapRules,
  decideNapRules,
  mayProposeNapRules,
  napRulesStateOf,
  napRulesTextProblem,
  nextNapRulesNumber,
  openNapRulesProposal,
  type NapRulesVersion,
} from "./nap-rules.js";

const DAY = 24 * 60 * 60 * 1000;
const START = new Date("2026-11-01T12:00:00.000Z");

function at(days: number): Date {
  return new Date(START.getTime() + days * DAY);
}

function proposed(number: number, text = `rules ${number.toString()}`): NapRulesVersion {
  return { number, text, change: `change ${number.toString()}`, proposedAt: at(number), status: { kind: "proposed" } };
}

function approved(number: number, decidedDay: number): NapRulesVersion {
  return { ...proposed(number), status: { kind: "approved", decidedAt: at(decidedDay) } };
}

function rejected(number: number, decidedDay: number): NapRulesVersion {
  return { ...proposed(number), status: { kind: "rejected", decidedAt: at(decidedDay) } };
}

describe("nextNapRulesNumber", () => {
  test("the first proposal is version 1", () => {
    expect(nextNapRulesNumber([])).toBe(1);
  });

  test("goes up by one per proposal, rejected ones included", () => {
    expect(nextNapRulesNumber([approved(1, 2), rejected(2, 3)])).toBe(3);
    expect(nextNapRulesNumber([approved(1, 2), rejected(2, 3), proposed(3)])).toBe(4);
  });
});

describe("currentNapRules", () => {
  test("there are no rules before a version is approved", () => {
    expect(currentNapRules([])).toBeUndefined();
    expect(currentNapRules([proposed(1)])).toBeUndefined();
    expect(currentNapRules([rejected(1, 2)])).toBeUndefined();
  });

  test("is the approved version decided last", () => {
    const versions = [approved(1, 2), approved(2, 4), rejected(3, 5), proposed(4)];
    expect(currentNapRules(versions)?.number).toBe(2);
  });

  test("a rejected version never becomes current", () => {
    const versions = [approved(1, 2), rejected(2, 9)];
    expect(currentNapRules(versions)?.number).toBe(1);
  });
});

describe("napRulesStateOf", () => {
  test("reads proposed, in effect, replaced and rejected", () => {
    const versions = [approved(1, 2), approved(2, 4), rejected(3, 5), proposed(4)];
    expect(versions.map((version) => napRulesStateOf(version, versions))).toEqual([
      "replaced",
      "in-effect",
      "rejected",
      "proposed",
    ]);
  });
});

describe("decideNapRules", () => {
  test("a proposed version is approved or rejected", () => {
    expect(decideNapRules(proposed(1), "approved", at(3))?.status).toEqual({ kind: "approved", decidedAt: at(3) });
    expect(decideNapRules(proposed(1), "rejected", at(3))?.status).toEqual({ kind: "rejected", decidedAt: at(3) });
  });

  test("only a proposed version can be decided", () => {
    expect(decideNapRules(approved(1, 2), "rejected", at(3))).toBeUndefined();
    expect(decideNapRules(rejected(1, 2), "approved", at(3))).toBeUndefined();
  });
});

describe("mayProposeNapRules", () => {
  test("a second proposal is refused while one is open", () => {
    expect(mayProposeNapRules([])).toBe(true);
    expect(mayProposeNapRules([approved(1, 2), rejected(2, 3)])).toBe(true);
    expect(mayProposeNapRules([approved(1, 2), proposed(2)])).toBe(false);
    expect(openNapRulesProposal([approved(1, 2), proposed(2)])?.number).toBe(2);
  });
});

describe("napRulesTextProblem", () => {
  test("refuses a blank text or change, too long ones and a text equal to the current rules", () => {
    const current = approved(1, 2);
    expect(napRulesTextProblem("", "x", undefined)).toBe("blank-text");
    expect(napRulesTextProblem("x", "", undefined)).toBe("blank-change");
    expect(napRulesTextProblem("x".repeat(4001), "x", undefined)).toBe("text-too-long");
    expect(napRulesTextProblem("x", "x".repeat(501), undefined)).toBe("change-too-long");
    expect(napRulesTextProblem(current.text, "x", current)).toBe("unchanged");
    expect(napRulesTextProblem("new rules", "x", current)).toBeUndefined();
  });
});
