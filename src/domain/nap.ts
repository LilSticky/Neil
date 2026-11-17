import { sameTag } from "./city-rotation.js";
import type { Editor } from "./exile.js";
import type { KingdomNumber } from "./lookup-input.js";
import type { MemberId } from "./rank-approval.js";

/** Who approved a join: a member of the NaP Council, or an Officer while the NaP had no members. */
export type ApprovedAs = "council" | "officer";

/** One entry of the NaP's history: an Alliance joined, or left. Members are named only by their Discord user id. */
export type NapEvent =
  | {
      readonly kind: "joined";
      readonly tag: string;
      readonly requestedBy: MemberId;
      readonly requestedAt: Date;
      readonly approvedBy: MemberId;
      readonly approvedAs: ApprovedAs;
      readonly at: Date;
    }
  | { readonly kind: "left"; readonly tag: string; readonly leftBy: MemberId; readonly at: Date };

/** An Alliance in the NaP, and when it last joined. */
export interface NapMember {
  readonly tag: string;
  readonly since: Date;
}

/**
 * The Alliances in the NaP: those whose latest event in the history (oldest first) is a join. Tags are compared ignoring
 * letter case; the members are listed in the order they joined.
 */
export function napMembers(history: readonly NapEvent[]): readonly NapMember[] {
  return latestEvents(history)
    .filter((event) => event.kind === "joined")
    .map((event) => ({ tag: event.tag, since: event.at }))
    .sort((a, b) => a.since.getTime() - b.since.getTime());
}

/** An Alliance that left the NaP and has not joined again, and when it last left. */
export interface NapFormerMember {
  readonly tag: string;
  readonly leftAt: Date;
}

/** Where an Alliance stands in the NaP: a member since when, or not a member, with when it last left if it ever did. */
export type NapStatus =
  | { readonly kind: "member"; readonly since: Date }
  | { readonly kind: "not-member"; readonly leftAt: Date | undefined };

/** The latest event of every Alliance in the history (oldest first), tags compared ignoring letter case. */
function latestEvents(history: readonly NapEvent[]): readonly NapEvent[] {
  const latest = new Map<string, NapEvent>();
  for (const event of history) {
    const key = event.tag.toLowerCase();
    latest.delete(key);
    latest.set(key, event);
  }
  return [...latest.values()];
}

/** The Alliances whose latest event in the history is a leave, the newest leave first. */
export function napFormerMembers(history: readonly NapEvent[]): readonly NapFormerMember[] {
  return latestEvents(history)
    .filter((event) => event.kind === "left")
    .map((event) => ({ tag: event.tag, leftAt: event.at }))
    .sort((a, b) => b.leftAt.getTime() - a.leftAt.getTime());
}

/**
 * Where a Home Kingdom Alliance stands in the NaP. Undefined for an Alliance of another Kingdom: the register knows
 * Alliances only by tag, so another Kingdom's Alliance with the same tag must never match.
 */
export function napStatusOf(
  history: readonly NapEvent[],
  homeKingdom: KingdomNumber,
  alliance: { readonly kingdom: KingdomNumber; readonly tag: string },
): NapStatus | undefined {
  if (alliance.kingdom !== homeKingdom) return undefined;
  const member = napMembers(history).find((entry) => sameTag(entry.tag, alliance.tag));
  if (member !== undefined) return { kind: "member", since: member.since };
  const former = napFormerMembers(history).find((entry) => sameTag(entry.tag, alliance.tag));
  return { kind: "not-member", leftAt: former?.leftAt };
}

/** Whether the Alliance with this tag is in the NaP. */
export function isNapMember(history: readonly NapEvent[], tag: string): boolean {
  return napMembers(history).some((member) => sameTag(member.tag, tag));
}

/**
 * The tag of the Home Kingdom Alliance the Member is Linked R5 of: their rank is R5 from the Game API or a Rank Approval,
 * their Alliance is in the Home Kingdom and its tag is known. Undefined otherwise (the same rule as the City Rotation's
 * editors).
 */
export function linkedR5AllianceOf(editor: Editor, homeKingdom: KingdomNumber): string | undefined {
  const { allianceRank, allianceKingdom, allianceTag } = editor;
  if (allianceKingdom !== homeKingdom || allianceTag === undefined || allianceTag === "") return undefined;
  if (allianceRank.source !== "game-api" && allianceRank.source !== "rank-approval") return undefined;
  return allianceRank.rank === "R5" ? allianceTag : undefined;
}

/** Whether a Member is on the NaP Council: they are the Linked R5 of an Alliance in the NaP. */
export function isNapCouncilMember(allianceTag: string | undefined, history: readonly NapEvent[]): boolean {
  return allianceTag !== undefined && isNapMember(history, allianceTag);
}

/**
 * Whether the Linked R5 of `allianceTag` may ask for it to join: they are a Linked R5, their Alliance is not in the NaP,
 * and no join request for it is open.
 */
export function mayAskToJoin(
  allianceTag: string | undefined,
  history: readonly NapEvent[],
  openRequestTags: readonly string[],
): boolean {
  if (allianceTag === undefined || isNapMember(history, allianceTag)) return false;
  return !openRequestTags.some((tag) => sameTag(tag, allianceTag));
}

/**
 * Whether, and as whom, a Member may approve a join request: as `council` when they are the Linked R5 of an Alliance in
 * the NaP; as `officer` when they are an Officer and the NaP has no members; undefined when they may not.
 */
export function mayApprove(
  approver: { readonly allianceTag: string | undefined; readonly officer: boolean },
  history: readonly NapEvent[],
): ApprovedAs | undefined {
  if (isNapCouncilMember(approver.allianceTag, history)) return "council";
  if (approver.officer && napMembers(history).length === 0) return "officer";
  return undefined;
}

/** Whether the Linked R5 of `allianceTag` may take it out of the NaP: it is in the NaP. Nobody else's approval is needed. */
export function mayLeave(allianceTag: string | undefined, history: readonly NapEvent[]): boolean {
  return isNapCouncilMember(allianceTag, history);
}
