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
 * The Member as REAPER's editor check sees them: the Alliance Rank on their Link and the Kingdom of the Alliance they
 * were last applied in. Undefined without a Link; the Kingdom is undefined when no Alliance is recorded.
 */
export function editorOf(stores: EditorStores, memberId: MemberId): Editor | undefined {
  const link = stores.links.linkFor(memberId);
  if (link === undefined) return undefined;
  const alliance = stores.applied.get(memberId)?.alliance;
  const allianceKingdom = alliance === undefined || alliance === "unrecorded" ? undefined : alliance.kingdom;
  return { allianceRank: link.allianceRank, allianceKingdom };
}
