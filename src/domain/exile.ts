import type { RankOnLink } from "./link.js";
import type { KingdomNumber, ParseResult, Uid } from "./lookup-input.js";
import type { MemberId } from "./rank-approval.js";
import type { Player } from "./player.js";

/** Why a Player was made an Exile: trimmed, 1 to 200 characters. Only exileReasonOf makes one. */
export type ExileReason = string & { readonly __brand: "ExileReason" };

const REASON_MAX_LENGTH = 200;

/** A reason as typed: trimmed, and refused when empty or longer than 200 characters. */
export function exileReasonOf(text: string): ParseResult<ExileReason> {
  const trimmed = text.trim();
  const length = Array.from(trimmed).length;
  if (length === 0 || length > REASON_MAX_LENGTH) return { ok: false };
  return { ok: true, value: trimmed as ExileReason };
}

/** A point on the map. */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** An Exile as REAPER stores it. The position, when present, was read at positionAt. */
export interface Exile {
  readonly uid: Uid;
  /** The latest Player Name read; follows renames. */
  readonly name: string;
  /** The latest Kingdom read. */
  readonly kingdom: KingdomNumber;
  /** The latest position read; undefined when it was never read with one. */
  readonly position: Position | undefined;
  /** When position was read; present exactly when position is. */
  readonly positionAt: Date | undefined;
  readonly reason: ExileReason;
  readonly addedAt: Date;
  /** The R5 who added the Exile. Never shown to Members; only the log channel names them. */
  readonly addedBy: MemberId;
}

/** The Alliance Rank and Kingdom of the Member who wants to change REAPER. */
export interface Editor {
  readonly allianceRank: RankOnLink;
  readonly allianceKingdom: KingdomNumber | undefined;
}

/** Only an R5 of an Alliance in the Home Kingdom may add or remove Exiles; the rank may come from the Game API or a Rank Approval. */
export function mayChangeReaper(editor: Editor, homeKingdom: KingdomNumber): boolean {
  if (editor.allianceKingdom !== homeKingdom) return false;
  const { allianceRank } = editor;
  return (allianceRank.source === "game-api" || allianceRank.source === "rank-approval") && allianceRank.rank === "R5";
}

/** The straight-line distance between two points on the map. */
export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** An Exile with the fresh read of its Player, when the Game API gave one this time. */
export interface ExileCandidate {
  readonly exile: Exile;
  readonly player: Player | undefined;
}

/** An Exile ranked by distance. stale is true when the position is the stored one, because the Exile could not be read now. */
export interface RankedExile {
  readonly exile: Exile;
  readonly position: Position;
  readonly distance: number;
  readonly stale: boolean;
}

/** The ranking, closest first, and how many Exiles were left out and why. */
export interface ExileRanking {
  readonly ranking: RankedExile[];
  readonly leftOut: {
    /** Exiles with no position at all, neither read now nor stored. */
    readonly unreadable: number;
    /** Exiles the Game API reports as shielded. */
    readonly shielded: number;
  };
}

/**
 * Ranks the Exiles of one Kingdom by distance from the origin. Leaves out the caller's own Exile (none when the caller has no Link), Exiles now in another
 * Kingdom, shielded Exiles and Exiles with no position. A fresh read of the Player is preferred over the stored position.
 * Ties go to the Exile added earlier.
 */
export function rankExiles(
  origin: Position,
  kingdom: KingdomNumber,
  callerUid: Uid | undefined,
  candidates: readonly ExileCandidate[],
): ExileRanking {
  const ranking: RankedExile[] = [];
  let unreadable = 0;
  let shielded = 0;

  for (const candidate of candidates) {
    const { exile, player } = candidate;
    if (exile.uid === callerUid) continue;
    if ((player?.kingdom ?? exile.kingdom) !== kingdom) continue;
    if (player?.details?.shielded === true) {
      shielded += 1;
      continue;
    }
    const current = currentPositionOf(candidate);
    if (current === undefined) {
      unreadable += 1;
      continue;
    }
    ranking.push({ exile, position: current.position, distance: distance(origin, current.position), stale: current.stale });
  }

  ranking.sort((a, b) => a.distance - b.distance || a.exile.addedAt.getTime() - b.exile.addedAt.getTime());
  return { ranking, leftOut: { unreadable, shielded } };
}

/** The position to measure from: the fresh read when it gives one, else the stored position (stale). */
function currentPositionOf(candidate: ExileCandidate): { readonly position: Position; readonly stale: boolean } | undefined {
  const read = candidate.player?.details?.location;
  if (read !== undefined) return { position: { x: read.x, y: read.y }, stale: false };
  const stored = candidate.exile.position;
  if (stored !== undefined) return { position: stored, stale: true };
  return undefined;
}
