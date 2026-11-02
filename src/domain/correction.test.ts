import { describe, expect, test } from "vitest";
import { mayCorrect } from "./correction.js";
import type { MemberId } from "./rank-approval.js";

const MEMBER: MemberId = "member-linked";
const OTHER_MEMBER: MemberId = "member-other";
const OFFICER: MemberId = "member-officer";

const plainMember = { memberId: MEMBER, isOfficer: false } as const;
const officer = { memberId: OFFICER, isOfficer: true } as const;

describe("mayCorrect unlink", () => {
  test("lets a Member Unlink themselves", () => {
    expect(mayCorrect("unlink", plainMember, MEMBER)).toEqual({ ok: true });
  });

  test("lets an Officer Unlink another Member", () => {
    expect(mayCorrect("unlink", officer, OTHER_MEMBER)).toEqual({ ok: true });
  });

  test("refuses a Member who is not an Officer when they name another Member, with not-officer", () => {
    expect(mayCorrect("unlink", plainMember, OTHER_MEMBER)).toEqual({ ok: false, reason: "not-officer" });
  });
});

describe.each(["rank-approval", "officer-link"] as const)("mayCorrect %s", (correction) => {
  test("lets an Officer correct another Member", () => {
    expect(mayCorrect(correction, officer, OTHER_MEMBER)).toEqual({ ok: true });
  });

  test("refuses an Officer who names themselves, with own-link", () => {
    expect(mayCorrect(correction, officer, OFFICER)).toEqual({ ok: false, reason: "own-link" });
  });

  test("refuses a Member who is not an Officer, with not-officer, even for themselves", () => {
    expect(mayCorrect(correction, plainMember, MEMBER)).toEqual({ ok: false, reason: "not-officer" });
    expect(mayCorrect(correction, plainMember, OTHER_MEMBER)).toEqual({ ok: false, reason: "not-officer" });
  });
});
