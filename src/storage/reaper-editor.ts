import type { Editor } from "../domain/exile.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { AppliedStore } from "./applied-store.js";
import type { LinkStore } from "./link-store.js";

/** The stores the editor check reads; it makes no Game API request. */
export interface EditorStores {
  readonly links: Pick<LinkStore, "linkFor">;
  readonly applied: Pick<AppliedStore, "get">;
}

/**
 * The Member as the editor checks of REAPER (the NaP Council), the City Rotation and the NaP see them: the Alliance Rank on their Link and the Kingdom
 * and tag of the Alliance they were last applied in. Undefined without a Link; the Kingdom and tag are undefined when no
 * Alliance is recorded.
 */
export function editorOf(stores: EditorStores, memberId: MemberId): Editor | undefined {
  const link = stores.links.linkFor(memberId);
  if (link === undefined) return undefined;
  const alliance = stores.applied.get(memberId)?.alliance;
  const recorded = alliance === undefined || alliance === "unrecorded" ? undefined : alliance;
  return { allianceRank: link.allianceRank, allianceKingdom: recorded?.kingdom, allianceTag: recorded?.tag };
}
