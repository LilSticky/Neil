/**
 * The Member as REAPER's editor check sees them: the Alliance Rank on their Link and the Kingdom of the Alliance they
 * were last applied in. Undefined without a Link; the Kingdom is undefined when no Alliance is recorded.
 */
export function editorOf(stores, memberId) {
    const link = stores.links.linkFor(memberId);
    if (link === undefined)
        return undefined;
    const alliance = stores.applied.get(memberId)?.alliance;
    const allianceKingdom = alliance === undefined || alliance === "unrecorded" ? undefined : alliance.kingdom;
    return { allianceRank: link.allianceRank, allianceKingdom };
}
//# sourceMappingURL=reaper-editor.js.map