import { describe, expect, test } from "vitest";
import { checkApply, kingMoveSteps, planKingMove, type ExpectedKing, type KingMove } from "./king-move.js";
import { uidOf } from "./__fixtures__/players.js";

const NOW = new Date("2026-11-20T20:05:00Z");
const R5_UID = uidOf("145563254785");
const NEW_KING = "111111111111111111";
const OLD_KING = "222222222222222222";
const OTHER = "333333333333333333";

const member: ExpectedKing = { kind: "member", leaderUid: R5_UID, leaderName: "Rogue", memberId: NEW_KING };

function prepared(previousKings: readonly string[] = [OLD_KING]): KingMove {
  const plan = planKingMove("NML", member, previousKings, NOW);
  if (plan.kind !== "prepare") throw new Error("expected a King Move");
  return plan.move;
}

describe("planKingMove", () => {
  test("prepares a move to the R5's Linked Member with the current holders as the snapshot", () => {
    const plan = planKingMove("NML", member, [OLD_KING, OLD_KING], NOW);
    expect(plan).toEqual({
      kind: "prepare",
      move: {
        holdingTag: "NML",
        leaderUid: R5_UID,
        leaderName: "Rogue",
        newKing: NEW_KING,
        previousKings: [OLD_KING],
        messageId: undefined,
        preparedAt: NOW,
        state: { kind: "prepared" },
      },
    });
  });

  test("prepares a move when nobody holds King yet", () => {
    expect(planKingMove("NML", member, [], NOW).kind).toBe("prepare");
  });

  test("prepares a move when the new King shares King with someone else", () => {
    expect(planKingMove("NML", member, [NEW_KING, OLD_KING], NOW).kind).toBe("prepare");
  });

  test("prepares nothing when the new King already is the only King", () => {
    expect(planKingMove("NML", member, [NEW_KING], NOW)).toEqual({
      kind: "not-prepared",
      reason: { kind: "already-king", memberId: NEW_KING },
    });
  });

  test.each([
    [{ kind: "game-api-failed", detail: "quota-spent" } as const, { kind: "game-api-failed", detail: "quota-spent" }],
    [{ kind: "no-r5" } as const, { kind: "no-r5" }],
    [{ kind: "unlinked", leaderUid: R5_UID, leaderName: undefined } as const, { kind: "unlinked", leaderUid: R5_UID }],
    [
      { kind: "left-server", leaderUid: R5_UID, leaderName: undefined, memberId: NEW_KING } as const,
      { kind: "left-server", leaderUid: R5_UID, memberId: NEW_KING },
    ],
  ])("prepares nothing for %o", (expected, reason) => {
    expect(planKingMove("NML", expected, [OLD_KING], NOW)).toEqual({ kind: "not-prepared", reason });
  });
});

describe("kingMoveSteps", () => {
  test("takes King from the snapshot holders and gives it to the new King", () => {
    expect(kingMoveSteps(prepared(), [OLD_KING])).toEqual({ takeFrom: [OLD_KING], giveToNewKing: true });
  });

  test("leaves a Member who got King after the move was prepared", () => {
    expect(kingMoveSteps(prepared(), [OLD_KING, OTHER])).toEqual({ takeFrom: [OLD_KING], giveToNewKing: true });
  });

  test("skips a snapshot holder who no longer holds King, and a new King who already holds it", () => {
    expect(kingMoveSteps(prepared([OLD_KING, NEW_KING]), [NEW_KING])).toEqual({ takeFrom: [], giveToNewKing: false });
  });

  test("never takes King from the new King", () => {
    expect(kingMoveSteps(prepared([NEW_KING, OLD_KING]), [NEW_KING, OLD_KING]).takeFrom).toEqual([OLD_KING]);
  });
});

describe("checkApply", () => {
  test("lets an Officer apply the live prepared move", () => {
    const move = prepared();
    expect(checkApply(move, move.preparedAt.getTime(), true)).toEqual({ kind: "ok" });
  });

  test("refuses anyone who is not an Officer", () => {
    const move = prepared();
    expect(checkApply(move, move.preparedAt.getTime(), false)).toEqual({ kind: "not-officer" });
  });

  test("refuses an applied, a superseded, an older or a missing move", () => {
    const move = prepared();
    const at = move.preparedAt.getTime();
    expect(checkApply({ ...move, state: { kind: "applied", appliedBy: OTHER, appliedAt: NOW } }, at, true).kind).toBe("not-open");
    expect(checkApply({ ...move, state: { kind: "superseded" } }, at, true).kind).toBe("not-open");
    expect(checkApply(move, at - 1, true).kind).toBe("not-open");
    expect(checkApply(undefined, at, true).kind).toBe("not-open");
  });
});
