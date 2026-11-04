import type { RankOnLink } from "../../domain/link.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { PreferenceRoles } from "../preferences.js";

/** One call to apply: the Member and the Alliance Rank the Preference Roles were applied with. */
export interface AppliedPreferenceRoles {
  readonly memberId: MemberId;
  readonly rank: RankOnLink;
}

/**
 * The Preference Roles as the name and roles, the Unlink and the corrections use them: records every apply and every
 * forget. After `failWith`, every apply rejects, as a broken change would; after `failForgetWith`, every forget rejects.
 * The callers must still keep going.
 */
export class FakePreferenceRoles implements Pick<PreferenceRoles, "apply" | "forget"> {
  readonly applied: AppliedPreferenceRoles[] = [];
  readonly forgotten: MemberId[] = [];
  private failure: Error | undefined = undefined;
  private forgetFailure: Error | undefined = undefined;

  failWith(error: Error): void {
    this.failure = error;
  }

  failForgetWith(error: Error): void {
    this.forgetFailure = error;
  }

  apply(memberId: MemberId, rank: RankOnLink): Promise<void> {
    this.applied.push({ memberId, rank });
    return this.failure === undefined ? Promise.resolve() : Promise.reject(this.failure);
  }

  forget(memberId: MemberId): Promise<void> {
    this.forgotten.push(memberId);
    return this.forgetFailure === undefined ? Promise.resolve() : Promise.reject(this.forgetFailure);
  }
}
