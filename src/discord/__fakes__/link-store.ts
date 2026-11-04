import { parseUid } from "../../domain/lookup-input.js";
import type { Link, RankOnLink } from "../../domain/link.js";
import type { MemberId, RankApproval } from "../../domain/rank-approval.js";
import type { LinkStore } from "../../storage/link-store.js";

/**
 * The part of the Link store the Preference Roles and the Preferences message read: a Member is Linked once `link` is
 * called, with the Alliance Rank the Link carries (unknown when none is given), and no longer after `unlink`; a Member
 * may also have a pending Rank Approval in a thread. The store itself is tested in link-store.test.ts.
 */
export class FakeLinkStore implements Pick<LinkStore, "linkFor" | "pendingFor"> {
  private readonly linked = new Map<MemberId, Link>();
  private readonly pending = new Map<MemberId, RankApproval>();

  link(memberId: MemberId, allianceRank: RankOnLink = { source: "unknown" }): void {
    this.linked.set(memberId, {
      memberId,
      uid: parsedUid(),
      linkedAt: new Date("2026-11-04T10:00:00Z"),
      allianceRank,
      madeBy: { kind: "in-game-proof" },
    });
  }

  /** Records a pending Rank Approval of the Member, asked in the thread given. */
  pendingApproval(memberId: MemberId, threadId: string): void {
    this.pending.set(memberId, {
      state: "pending",
      id: 1,
      linkedMemberId: memberId,
      threadId,
      approver: { kind: "officers" },
      askedAt: new Date("2026-11-04T10:00:00Z"),
    });
  }

  unlink(memberId: MemberId): void {
    this.linked.delete(memberId);
  }

  linkFor(memberId: MemberId): Link | undefined {
    return this.linked.get(memberId);
  }

  pendingFor(memberId: MemberId): RankApproval | undefined {
    return this.pending.get(memberId);
  }
}

function parsedUid() {
  const parsed = parseUid("145563254785");
  if (!parsed.ok) throw new Error("the fake uid is not a valid uid");
  return parsed.value;
}
