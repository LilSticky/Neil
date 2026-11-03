import type { MemberId } from "./rank-approval.js";

/** A correction a Member or an Officer may make to a Link or a Rank Approval. */
export type Correction = "unlink" | "rank-approval" | "officer-link";

/** The Member making a correction, and whether they are an Officer. */
export interface Corrector {
  readonly memberId: MemberId;
  readonly isOfficer: boolean;
}

/** Why a correction is refused: not an Officer, or an Officer correcting their own Link. */
export type CorrectionRefusal = "not-officer" | "own-link";

/**
 * Whether a Member may make a correction on the Member targetId. Unlinking yourself is open to every Member; any other
 * correction, and unlinking someone else, needs an Officer. An Officer may not correct their own Link with a Rank
 * Approval or an Officer Link.
 */
export function mayCorrect(
  correction: Correction,
  corrector: Corrector,
  targetId: MemberId,
): { readonly ok: true } | { readonly ok: false; readonly reason: CorrectionRefusal } {
  const isSelf = corrector.memberId === targetId;
  if (correction === "unlink") {
    if (isSelf || corrector.isOfficer) return { ok: true };
    return { ok: false, reason: "not-officer" };
  }
  if (!corrector.isOfficer) return { ok: false, reason: "not-officer" };
  if (isSelf) return { ok: false, reason: "own-link" };
  return { ok: true };
}
