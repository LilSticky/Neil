import { parseUid } from "../../domain/lookup-input.js";
import type { Link, RankOnLink } from "../../domain/link.js";
import type { MemberId } from "../../domain/rank-approval.js";
import type { LinkStore } from "../../storage/link-store.js";

/**
 * The part of the Link store the Preference Roles read: a Member is Linked once `link` is called, with the Alliance Rank
 * the Link carries (unknown when none is given), and no longer after `unlink`. The store itself is tested in
 * link-store.test.ts.
 */
export class FakeLinkStore implements Pick<LinkStore, "linkFor"> {
  private readonly linked = new Map<MemberId, Link>();

  link(memberId: MemberId, allianceRank: RankOnLink = { source: "unknown" }): void {
    this.linked.set(memberId, {
      memberId,
      uid: parsedUid(),
      linkedAt: new Date("2026-11-04T10:00:00Z"),
      allianceRank,
      madeBy: { kind: "in-game-proof" },
    });
  }

  unlink(memberId: MemberId): void {
    this.linked.delete(memberId);
  }

  linkFor(memberId: MemberId): Link | undefined {
    return this.linked.get(memberId);
  }
}

function parsedUid() {
  const parsed = parseUid("145563254785");
  if (!parsed.ok) throw new Error("the fake uid is not a valid uid");
  return parsed.value;
}
