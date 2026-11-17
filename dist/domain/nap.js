import { sameTag } from "./city-rotation.js";
/**
 * The Alliances in the NaP: those whose latest event in the history (oldest first) is a join. Tags are compared ignoring
 * letter case; the members are listed in the order they joined.
 */
export function napMembers(history) {
    return latestEvents(history)
        .filter((event) => event.kind === "joined")
        .map((event) => ({ tag: event.tag, since: event.at }))
        .sort((a, b) => a.since.getTime() - b.since.getTime());
}
/** The latest event of every Alliance in the history (oldest first), tags compared ignoring letter case. */
function latestEvents(history) {
    const latest = new Map();
    for (const event of history) {
        const key = event.tag.toLowerCase();
        latest.delete(key);
        latest.set(key, event);
    }
    return [...latest.values()];
}
/** The Alliances whose latest event in the history is a leave, the newest leave first. */
export function napFormerMembers(history) {
    return latestEvents(history)
        .filter((event) => event.kind === "left")
        .map((event) => ({ tag: event.tag, leftAt: event.at }))
        .sort((a, b) => b.leftAt.getTime() - a.leftAt.getTime());
}
/**
 * Where a Home Kingdom Alliance stands in the NaP. Undefined for an Alliance of another Kingdom: the register knows
 * Alliances only by tag, so another Kingdom's Alliance with the same tag must never match.
 */
export function napStatusOf(history, homeKingdom, alliance) {
    if (alliance.kingdom !== homeKingdom)
        return undefined;
    const member = napMembers(history).find((entry) => sameTag(entry.tag, alliance.tag));
    if (member !== undefined)
        return { kind: "member", since: member.since };
    const former = napFormerMembers(history).find((entry) => sameTag(entry.tag, alliance.tag));
    return { kind: "not-member", leftAt: former?.leftAt };
}
/** Whether the Alliance with this tag is in the NaP. */
export function isNapMember(history, tag) {
    return napMembers(history).some((member) => sameTag(member.tag, tag));
}
/**
 * The tag of the Home Kingdom Alliance the Member is Linked R5 of: their rank is R5 from the Game API or a Rank Approval,
 * their Alliance is in the Home Kingdom and its tag is known. Undefined otherwise (the same rule as the City Rotation's
 * editors).
 */
export function linkedR5AllianceOf(editor, homeKingdom) {
    const { allianceRank, allianceKingdom, allianceTag } = editor;
    if (allianceKingdom !== homeKingdom || allianceTag === undefined || allianceTag === "")
        return undefined;
    if (allianceRank.source !== "game-api" && allianceRank.source !== "rank-approval")
        return undefined;
    return allianceRank.rank === "R5" ? allianceTag : undefined;
}
/** Whether a Member is on the NaP Council: they are the Linked R5 of an Alliance in the NaP. */
export function isNapCouncilMember(allianceTag, history) {
    return allianceTag !== undefined && isNapMember(history, allianceTag);
}
/**
 * Whether the Linked R5 of `allianceTag` may ask for it to join: they are a Linked R5, their Alliance is not in the NaP,
 * and no join request for it is open.
 */
export function mayAskToJoin(allianceTag, history, openRequestTags) {
    if (allianceTag === undefined || isNapMember(history, allianceTag))
        return false;
    return !openRequestTags.some((tag) => sameTag(tag, allianceTag));
}
/**
 * Whether, and as whom, a Member may approve a join request: as `council` when they are the Linked R5 of an Alliance in
 * the NaP; as `officer` when they are an Officer and the NaP has no members; undefined when they may not.
 */
export function mayApprove(approver, history) {
    if (isNapCouncilMember(approver.allianceTag, history))
        return "council";
    if (approver.officer && napMembers(history).length === 0)
        return "officer";
    return undefined;
}
/** Whether the Linked R5 of `allianceTag` may take it out of the NaP: it is in the NaP. Nobody else's approval is needed. */
export function mayLeave(allianceTag, history) {
    return isNapCouncilMember(allianceTag, history);
}
//# sourceMappingURL=nap.js.map