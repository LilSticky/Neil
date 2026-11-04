import type { RankOnLink } from "../../domain/link.js";
import type { Player } from "../../domain/player.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { NameAndRoles } from "../name-and-roles.js";

/** One call to onLinked: the Member, the Player and the Alliance Rank on the Link it was made with. */
export interface LinkedCall {
  readonly memberId: MemberId;
  readonly player: Player;
  readonly rank: RankOnLink;
}

/**
 * The name and roles as the Interview and the Rank Approvals use them: records every call. After `failWith`, every call
 * rejects, as a broken apply would; the callers must still keep the Link and the thread messages.
 */
export class FakeNameAndRoles implements NameAndRoles {
  readonly linked: LinkedCall[] = [];
  readonly approved: MemberId[] = [];
  private failure: Error | undefined = undefined;

  /** Every call in the order made, under the name of the method; a test may share one trace with other fakes. */
  constructor(readonly trace: string[] = []) {}

  failWith(error: Error): void {
    this.failure = error;
  }

  onLinked(memberId: MemberId, player: Player, rank: RankOnLink): Promise<void> {
    this.trace.push("nameAndRoles.onLinked");
    this.linked.push({ memberId, player, rank });
    return this.outcome();
  }

  onRankApproved(memberId: MemberId): Promise<void> {
    this.approved.push(memberId);
    return this.outcome();
  }

  atStartup(): Promise<void> {
    return this.outcome();
  }

  private outcome(): Promise<void> {
    return this.failure === undefined ? Promise.resolve() : Promise.reject(this.failure);
  }
}
