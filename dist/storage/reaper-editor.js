/**
 * The Member as REAPER's and the City Rotation's editor check sees them: the Alliance Rank on their Link and the Kingdom
 * and tag of the Alliance they were last applied in. Undefined without a Link; the Kingdom and tag are undefined when no
 * Alliance is recorded.
 */
export function editorOf(stores, memberId) {
    const link = stores.links.linkFor(memberId);
    if (link === undefined)
        return undefined;
    const alliance = stores.applied.get(memberId)?.alliance;
    const recorded = alliance === undefined || alliance === "unrecorded" ? undefined : alliance;
    return { allianceRank: link.allianceRank, allianceKingdom: recorded?.kingdom, allianceTag: recorded?.tag };
}
//# sourceMappingURL=reaper-editor.js.map