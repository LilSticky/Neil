import { describe, expect, test } from "vitest";
import {
  alliancesWithoutVote,
  isMotionHours,
  mayOpenMotion,
  motionEndsAt,
  motionReminderAt,
  motionResult,
  NAP_MOTION_DEFAULT_HOURS,
  NAP_MOTION_MAX_HOURS,
  NAP_MOTION_MAX_TEXT,
  votesByAlliance,
} from "./nap-motion.js";
import type { NapEvent, NapMember, NapVote } from "./nap.js";

const HOUR = 60 * 60 * 1000;
const OPENED = new Date("2026-11-18T12:00:00.000Z");

function joined(tag: string): NapEvent {
  return {
    kind: "joined",
    tag,
    requestedBy: "111111111111111111",
    requestedAt: OPENED,
    decision: { as: "officer", by: "222222222222222222" },
    at: OPENED,
  };
}

function member(tag: string): NapMember {
  return { tag, since: OPENED };
}

function vote(allianceTag: string, choice: "approve" | "decline"): NapVote {
  return { allianceTag, voterId: "111111111111111111", vote: choice, at: OPENED };
}

describe("NaP Motion rules", () => {
  test("default to 48 hours, at most one week, and texts of at most 500 characters", () => {
    expect(NAP_MOTION_DEFAULT_HOURS).toBe(48);
    expect(NAP_MOTION_MAX_HOURS).toBe(168);
    expect(NAP_MOTION_MAX_TEXT).toBe(500);
  });

  test("accept whole hours from 1 to 168 only", () => {
    expect(isMotionHours(1)).toBe(true);
    expect(isMotionHours(168)).toBe(true);
    expect(isMotionHours(0)).toBe(false);
    expect(isMotionHours(169)).toBe(false);
    expect(isMotionHours(1.5)).toBe(false);
  });

  test("let only a member of the NaP Council open a motion, so nobody while the NaP is empty", () => {
    const history = [joined("NML")];
    expect(mayOpenMotion("NML", history)).toBe(true);
    expect(mayOpenMotion("nml", history)).toBe(true);
    expect(mayOpenMotion("ABC", history)).toBe(false);
    expect(mayOpenMotion(undefined, history)).toBe(false);
    expect(mayOpenMotion("NML", [])).toBe(false);
  });

  test("end the vote the given hours after it opened", () => {
    expect(motionEndsAt(OPENED, 48)).toEqual(new Date(OPENED.getTime() + 48 * HOUR));
  });

  test("remind 24 hours before the deadline, or halfway through a motion shorter than 48 hours", () => {
    expect(motionReminderAt(OPENED, motionEndsAt(OPENED, 72))).toEqual(new Date(OPENED.getTime() + 48 * HOUR));
    expect(motionReminderAt(OPENED, motionEndsAt(OPENED, 48))).toEqual(new Date(OPENED.getTime() + 24 * HOUR));
    expect(motionReminderAt(OPENED, motionEndsAt(OPENED, 10))).toEqual(new Date(OPENED.getTime() + 5 * HOUR));
    expect(motionReminderAt(OPENED, motionEndsAt(OPENED, 1))).toEqual(new Date(OPENED.getTime() + HOUR / 2));
  });

  test("approve with more Approve than Decline votes, and reject a tie or no votes", () => {
    const members = [member("NML"), member("ABC"), member("XYZ")];
    expect(motionResult([vote("NML", "approve"), vote("ABC", "approve"), vote("XYZ", "decline")], members)).toEqual({
      outcome: "approved",
      approve: 2,
      decline: 1,
    });
    expect(motionResult([vote("NML", "approve"), vote("ABC", "decline")], members)).toEqual({
      outcome: "rejected",
      approve: 1,
      decline: 1,
    });
    expect(motionResult([], members)).toEqual({ outcome: "rejected", approve: 0, decline: 0 });
  });

  test("count no vote of an Alliance that left the NaP", () => {
    expect(motionResult([vote("NML", "decline"), vote("QQQ", "approve"), vote("ABC", "approve")], [member("NML"), member("ABC")])).toEqual({
      outcome: "rejected",
      approve: 1,
      decline: 1,
    });
    expect(motionResult([vote("NML", "approve")], [])).toEqual({ outcome: "rejected", approve: 0, decline: 0 });
  });

  test("list the Alliances without a vote, and each Alliance's vote, ignoring letter case", () => {
    const members = [member("NML"), member("ABC"), member("XYZ")];
    const votes = [vote("abc", "decline"), vote("NML", "approve"), vote("QQQ", "approve")];
    expect(alliancesWithoutVote(members, votes)).toEqual([member("XYZ")]);
    expect(votesByAlliance(members, votes)).toEqual([
      { tag: "NML", vote: "approve" },
      { tag: "ABC", vote: "decline" },
      { tag: "XYZ", vote: undefined },
    ]);
  });
});
