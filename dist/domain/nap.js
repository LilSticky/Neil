import { sameTag } from "./city-rotation.js";
/** How long a NaP Vote runs: from when it opens until the NaP Council's votes are counted. */
export const NAP_VOTE_MS = 48 * 60 * 60 * 1000;
/** How long a declined Alliance waits before it may ask to join the NaP again: the NaP Cooldown. */
export const NAP_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
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
        if (event.kind === "declined")
            continue;
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
 * The NaP Cooldown of the Alliance with this tag (ignoring letter case): its latest decline plus NAP_COOLDOWN_MS, when it
 * has not joined since. Undefined when it was never declined. Whether the cooldown still runs depends on the time.
 */
export function cooldownEndOf(history, tag) {
    let cooldown;
    for (const event of history) {
        if (!sameTag(event.tag, tag))
            continue;
        if (event.kind === "declined") {
            cooldown = { declinedAt: event.at, endsAt: new Date(event.at.getTime() + NAP_COOLDOWN_MS) };
        }
        else if (event.kind === "joined") {
            cooldown = undefined;
        }
    }
    return cooldown;
}
/** The NaP Cooldown of the Alliance with this tag when it still runs at `now`; undefined otherwise. */
export function runningCooldownOf(history, tag, now) {
    const cooldown = cooldownEndOf(history, tag);
    return cooldown !== undefined && cooldown.endsAt.getTime() > now.getTime() ? cooldown : undefined;
}
/**
 * Whether the Linked R5 of `allianceTag` may ask for it to join: they are a Linked R5, their Alliance is not in the NaP,
 * no NaP Cooldown of it runs at `now`, and no join request for it is open.
 */
export function mayAskToJoin(allianceTag, history, openRequestTags, now) {
    if (allianceTag === undefined || isNapMember(history, allianceTag))
        return false;
    if (runningCooldownOf(history, allianceTag, now) !== undefined)
        return false;
    return !openRequestTags.some((tag) => sameTag(tag, allianceTag));
}
/**
 * Whether, and how, a Member may decide a join request: as `council` (they vote in the NaP Vote) when they are the
 * Linked R5 of an Alliance in the NaP; as `officer` (they decide alone, at once) when they are an Officer and the NaP has
 * no members; undefined when they may not.
 */
export function mayDecide(member, history) {
    if (isNapCouncilMember(member.allianceTag, history))
        return "council";
    if (member.officer && napMembers(history).length === 0)
        return "officer";
    return undefined;
}
/**
 * Counts a NaP Vote: one vote per Alliance, and only the votes of Alliances in the NaP now (votes of Alliances that left
 * are ignored). More Approve than Decline votes approve; a tie or no votes at all decline.
 */
export function voteResult(votes, members) {
    const counted = new Map();
    for (const vote of votes) {
        if (members.some((member) => sameTag(member.tag, vote.allianceTag)))
            counted.set(vote.allianceTag.toLowerCase(), vote.vote);
    }
    const choices = [...counted.values()];
    const approve = choices.filter((choice) => choice === "approve").length;
    const decline = choices.length - approve;
    return { outcome: approve > decline ? "approved" : "declined", approve, decline };
}
/** Whether the Linked R5 of `allianceTag` may take it out of the NaP: it is in the NaP. Nobody else's approval is needed. */
export function mayLeave(allianceTag, history) {
    return isNapCouncilMember(allianceTag, history);
}
/**
 * Whether a Member may keep REAPER (add and remove Exiles): they are on the NaP Council, or they are an Officer while the
 * NaP has no members. The same rule as deciding a join request.
 */
export function mayKeepReaper(member, history) {
    return mayDecide(member, history) !== undefined;
}
//# sourceMappingURL=nap.js.map