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

/** How a Link was made: from In-game Proof by the Member, or by an Officer (Officer Link). */
export type LinkMadeBy = { readonly kind: "in-game-proof" } | { readonly kind: "officer-link"; readonly officerId: MemberId };

/** A Member linked to a Player uid, with the Alliance Rank they were linked with and how the Link was made. */
export interface Link {
  readonly memberId: MemberId;
  readonly uid: Uid;
  readonly linkedAt: Date;
  readonly allianceRank: RankOnLink;
  readonly madeBy: LinkMadeBy;
}

/** The outcome of an Officer giving a Rank Approval on a Link: the new rank, and the Game API rank it overrides, if any. */
export type OfficerRankResult =
  | {
      readonly ok: true;
      readonly allianceRank: Extract<RankOnLink, { readonly source: "rank-approval" }>;
      readonly gameRank: RecordedRank | undefined;
    }
  | { readonly ok: false; readonly reason: "own-link" | "no-alliance" };

/**
 * An Officer gives a Rank Approval on a Link. Refused on the Officer's own Link and on a Link with no Alliance.
 * When the Game API gave a different rank, it is returned as gameRank so the Officer is told the next Daily Sync uses it.
 */
export function officerRank(link: Link, rank: RecordedRank, officerId: MemberId, now: Date): OfficerRankResult {
  if (link.memberId === officerId) return { ok: false, reason: "own-link" };
  if (link.allianceRank.source === "no-alliance") return { ok: false, reason: "no-alliance" };
  const gameRank =
    link.allianceRank.source === "game-api" && link.allianceRank.rank !== rank ? link.allianceRank.rank : undefined;
  return {
    ok: true,
    allianceRank: { source: "rank-approval", rank, approvedBy: officerId, approvedAt: now },
    gameRank,
  };
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
