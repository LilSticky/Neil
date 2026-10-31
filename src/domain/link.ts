import type { Uid } from "./lookup-input.js";
import type { AllianceRank, Player } from "./player.js";
import type { MemberId } from "./rank-approval.js";

/** An Alliance Rank Neil can record: R1–R5. */
type RecordedRank = Exclude<AllianceRank, "unknown">;

/**
 * The Alliance Rank a Link carries, and where it came from. Only the Game API, a Rank Approval or nothing
 * gives one; "unknown" waits for a Rank Approval (or stays when it was cancelled).
 */
export type RankOnLink =
  | { readonly source: "game-api"; readonly rank: RecordedRank }
  | {
      readonly source: "rank-approval";
      readonly rank: RecordedRank;
      readonly approvedBy: MemberId;
      readonly approvedAt: Date;
    }
  | { readonly source: "unknown" }
  | { readonly source: "no-alliance" };

/** A Member linked to a Player uid, with the Alliance Rank they were linked with. */
export interface Link {
  readonly memberId: MemberId;
  readonly uid: Uid;
  readonly linkedAt: Date;
  readonly allianceRank: RankOnLink;
}

/** The RankOnLink for a Player: from the Game API when it gives a rank, unknown in an Alliance without one, none outside an Alliance. */
export function rankOnLink(player: Player): RankOnLink {
  if (player.alliance === undefined) return { source: "no-alliance" };
  if (player.allianceRank === "unknown") return { source: "unknown" };
  return { source: "game-api", rank: player.allianceRank };
}

/** A Rank Approval is needed only when the Alliance Rank is unknown. */
export function needsRankApproval(rank: RankOnLink): boolean {
  return rank.source === "unknown";
}
