import type { MemberId } from "../../domain/rank-approval.js";
import type { AppliedState, AppliedStore } from "../../storage/applied-store.js";

const RECORDED_AT = new Date("2026-11-04T10:00:00Z");

/**
 * The Applied States the Preference Roles and the choices read: a test records the roles last applied to a Member, or
 * clears them for a Member no apply has reached yet. The real store is tested in applied-store.test.ts.
 */
export class FakeAppliedStore implements Pick<AppliedStore, "get"> {
  private readonly states = new Map<MemberId, AppliedState>();

  /** Records the roles last applied to the Member, replacing any Applied State they had. */
  record(memberId: MemberId, roles: readonly string[]): void {
    this.states.set(memberId, { memberId, nickname: "Vex", roles, appliedAt: RECORDED_AT, complete: true });
  }

  /** Removes the Member's Applied State, as for a Member no apply has reached yet. */
  clear(memberId: MemberId): void {
    this.states.delete(memberId);
  }

  get(memberId: MemberId): AppliedState | undefined {
    return this.states.get(memberId);
  }
}
