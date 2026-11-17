import type { Uid } from "./lookup-input.js";
import type { MemberId } from "./rank-approval.js";

/**
 * A King Move: Neil's prepared move of the King role to the receiving Alliance's R5 after a Handover; an Officer applies
 * it (ADR 21). Only the latest one is live.
 */
export interface KingMove {
  /** The Holding Alliance the Handover settled. */
  readonly holdingTag: string;
  /** The Alliance's R5, read fresh from the Game API. */
  readonly leaderUid: Uid;
  /** The R5's Player Name when the Game API gave one. */
  readonly leaderName: string | undefined;
  /** The R5's Linked Member: the new King. */
  readonly newKing: MemberId;
  /** The Members holding King when the move was prepared (the snapshot); only they lose it. */
  readonly previousKings: readonly MemberId[];
  /** The card in #neil-log; undefined until it is posted, or when the post failed. */
  readonly messageId: string | undefined;
  readonly preparedAt: Date;
  readonly state: KingMoveState;
}

/** Whether the King Move waits for an Officer, was applied (by whom and when), or was replaced by a newer one. */
export type KingMoveState =
  | { readonly kind: "prepared" }
  | { readonly kind: "applied"; readonly appliedBy: MemberId; readonly appliedAt: Date }
  | { readonly kind: "superseded" };

/** What Neil learned about the receiving Alliance's R5 at the Handover. */
export type ExpectedKing =
  /** The Game API failed, or the quota is spent; `detail` names the answer. */
  | { readonly kind: "game-api-failed"; readonly detail: string }
  /** The Alliance was read, but it names no R5. */
  | { readonly kind: "no-r5" }
  | { readonly kind: "unlinked"; readonly leaderUid: Uid; readonly leaderName: string | undefined }
  | { readonly kind: "left-server"; readonly leaderUid: Uid; readonly leaderName: string | undefined; readonly memberId: MemberId }
  | { readonly kind: "member"; readonly leaderUid: Uid; readonly leaderName: string | undefined; readonly memberId: MemberId };

/** Why Neil prepares no King Move; an Officer moves King by hand (or nothing needs to move). */
export type NotPrepared =
  | { readonly kind: "game-api-failed"; readonly detail: string }
  | { readonly kind: "no-r5" }
  | { readonly kind: "unlinked"; readonly leaderUid: Uid }
  | { readonly kind: "left-server"; readonly leaderUid: Uid; readonly memberId: MemberId }
  | { readonly kind: "already-king"; readonly memberId: MemberId };

export type KingMovePlan =
  | { readonly kind: "prepare"; readonly move: KingMove }
  | { readonly kind: "not-prepared"; readonly reason: NotPrepared };

/**
 * The King Move after a Handover to `holdingTag`: the expected King, and the Members holding King now as the snapshot.
 * Nothing is prepared when the R5 is unknown or not a Member here, or when they already are the only King.
 */
export function planKingMove(
  holdingTag: string,
  expected: ExpectedKing,
  kingHolders: readonly MemberId[],
  now: Date,
): KingMovePlan {
  switch (expected.kind) {
    case "game-api-failed":
      return { kind: "not-prepared", reason: { kind: "game-api-failed", detail: expected.detail } };
    case "no-r5":
      return { kind: "not-prepared", reason: { kind: "no-r5" } };
    case "unlinked":
      return { kind: "not-prepared", reason: { kind: "unlinked", leaderUid: expected.leaderUid } };
    case "left-server":
      return {
        kind: "not-prepared",
        reason: { kind: "left-server", leaderUid: expected.leaderUid, memberId: expected.memberId },
      };
    case "member": {
      const holders = [...new Set(kingHolders)];
      if (holders.length === 1 && holders[0] === expected.memberId) {
        return { kind: "not-prepared", reason: { kind: "already-king", memberId: expected.memberId } };
      }
      return {
        kind: "prepare",
        move: {
          holdingTag,
          leaderUid: expected.leaderUid,
          leaderName: expected.leaderName,
          newKing: expected.memberId,
          previousKings: holders,
          messageId: undefined,
          preparedAt: now,
          state: { kind: "prepared" },
        },
      };
    }
  }
}

/** The role changes an Apply makes: whom King is taken from, and whether the new King is given it. */
export interface KingMoveSteps {
  readonly takeFrom: readonly MemberId[];
  readonly giveToNewKing: boolean;
}

/**
 * The steps of an Apply, from the Members holding King now: King is taken only from the snapshot Members who still hold
 * it (never from the new King, never from someone who got it later), and given to the new King when they lack it.
 */
export function kingMoveSteps(move: KingMove, kingHoldersNow: readonly MemberId[]): KingMoveSteps {
  const now = new Set(kingHoldersNow);
  return {
    takeFrom: move.previousKings.filter((memberId) => memberId !== move.newKing && now.has(memberId)),
    giveToNewKing: !now.has(move.newKing),
  };
}

/**
 * Whether a press of Apply may apply the move: only an Officer, and only on the live, still prepared King Move (the
 * button names the move by the moment it was prepared).
 */
export type ApplyCheck = { readonly kind: "ok" } | { readonly kind: "not-officer" } | { readonly kind: "not-open" };

export function checkApply(move: KingMove | undefined, pressedPreparedAt: number, officer: boolean): ApplyCheck {
  if (!officer) return { kind: "not-officer" };
  if (move?.state.kind !== "prepared" || move.preparedAt.getTime() !== pressedPreparedAt) return { kind: "not-open" };
  return { kind: "ok" };
}
