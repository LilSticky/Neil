import { parseAllianceKey } from "../domain/lookup-input.js";
import { tagOfAllianceRole } from "../domain/managed-roles.js";
/** The Alliance tags the Member's Alliance roles name. A Member with none, or with several, has no Alliance Neil can tell. */
export function allianceTagsOf(roles) {
    return roles.flatMap((role) => {
        const tag = tagOfAllianceRole(role.name);
        if (tag === undefined)
            return [];
        const key = parseAllianceKey(tag);
        return key.ok ? [key.value] : [];
    });
}
/** The Alliance Rank a Link carries, when the Game API or a Rank Approval gave it; else unknown. */
export function rankOf(allianceRank) {
    if (allianceRank?.source === "game-api" || allianceRank?.source === "rank-approval")
        return allianceRank.rank;
    return "unknown";
}
/**
 * The Alliance a Member leads as its R4 or R5: they hold exactly one Alliance role and are Linked with rank R4 or R5.
 * Undefined otherwise.
 */
export function ledAllianceOf(roles, allianceRank) {
    const tags = allianceTagsOf(roles);
    const rank = rankOf(allianceRank);
    return tags.length === 1 && (rank === "R4" || rank === "R5") ? tags[0] : undefined;
}
//# sourceMappingURL=alliance-standing.js.map