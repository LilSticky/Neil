import { ButtonStyle, ComponentType, } from "discord.js";
import { NAP_COOLDOWN_MS, } from "../domain/nap.js";
import { timestamp } from "./timestamps.js";
/** The custom id prefix of the Approve button of a NaP join request (also on requests posted before NaP Votes). */
export const NAP_APPROVE_PREFIX = "nap-approve:";
/** The custom id prefix of the Decline button of a NaP join request. */
export const NAP_DECLINE_PREFIX = "nap-decline:";
/** The most history entries /nap history shows. */
export const MAX_HISTORY_ENTRIES = 20;
/** The most former members the NaP list shows. */
export const MAX_FORMER_MEMBERS = 20;
/** The colour of the NaP embeds. */
const NAP_COLOUR = 0x3b88c3;
/** The Approve and Decline buttons of the join request of `tag`, made at `requestedAt`. */
export function napVoteRow(tag, requestedAt) {
    const suffix = `${tag}:${requestedAt.getTime().toString()}`;
    return {
        type: ComponentType.ActionRow,
        components: [
            { type: ComponentType.Button, style: ButtonStyle.Success, label: "Approve", custom_id: `${NAP_APPROVE_PREFIX}${suffix}` },
            { type: ComponentType.Button, style: ButtonStyle.Danger, label: "Decline", custom_id: `${NAP_DECLINE_PREFIX}${suffix}` },
        ],
    };
}
/** The vote, tag and request time an Approve or Decline button names; undefined for a custom id Neil did not make. */
export function napVoteOf(customId) {
    const vote = customId.startsWith(NAP_APPROVE_PREFIX)
        ? "approve"
        : customId.startsWith(NAP_DECLINE_PREFIX)
            ? "decline"
            : undefined;
    if (vote === undefined)
        return undefined;
    const rest = customId.slice((vote === "approve" ? NAP_APPROVE_PREFIX : NAP_DECLINE_PREFIX).length);
    const colon = rest.lastIndexOf(":");
    if (colon <= 0)
        return undefined;
    const tag = rest.slice(0, colon);
    const requestedAt = Number(rest.slice(colon + 1));
    if (!Number.isSafeInteger(requestedAt) || rest.slice(colon + 1) === "")
        return undefined;
    return { vote, tag, requestedAt };
}
/** A vote as its button names it. */
function voteName(vote) {
    return vote === "approve" ? "Approve" : "Decline";
}
/** The counts of a NaP Vote. */
function countsOf(approve, decline) {
    return `${approve.toString()} Approve, ${decline.toString()} Decline`;
}
/** Who decided, for /nap history: the vote with its counts, or the Member (an Officer marked as such). */
function decidedBy(decision) {
    if (decision.as === "vote")
        return `by vote (${countsOf(decision.approve, decision.decline)})`;
    return `by <@${decision.by}>${decision.as === "officer" ? " (Officer)" : ""}`;
}
/**
 * The NaP list, pinned in #nap-announcements and shown by /nap show: the Alliances in the NaP since when, then the former
 * members with when each left, newest first, at most MAX_FORMER_MEMBERS. Only Alliances and times; no Members are named.
 */
export function napListEmbed(members, former, label) {
    return { title: "NaP", color: NAP_COLOUR, description: napListLines(members, former, label).join("\n") };
}
function napListLines(members, former, label) {
    const lines = [];
    if (members.length === 0) {
        lines.push("No Alliance is in the NaP yet.");
    }
    else {
        lines.push("**Members**", ...members.map((member) => `- ${label(member.tag)}, since ${timestamp(member.since, "D")}`));
    }
    if (former.length > 0) {
        const shown = former.slice(0, MAX_FORMER_MEMBERS);
        lines.push("", "**Former members**", ...shown.map((entry) => `- ${label(entry.tag)}, left ${timestamp(entry.leftAt, "D")}`));
        if (former.length > shown.length)
            lines.push(`…and ${(former.length - shown.length).toString()} more.`);
    }
    return lines;
}
/**
 * /nap show: the NaP list, then the open join requests by tag with when their NaP Vote ends, or that an Officer decides
 * while the NaP has no members. No Members are named.
 */
export function napShowEmbed(members, former, requests, label) {
    const list = napListEmbed(members, former, label);
    if (requests.length === 0)
        return list;
    const lines = ["", "**Waiting for a decision**", ...requests.map((request) => `- [${request.tag}], ${waiting(request)}`)];
    return { ...list, description: [list.description ?? "", ...lines].join("\n") };
    function waiting(request) {
        if (members.length === 0)
            return "an Officer decides";
        return request.voteEndsAt === undefined ? "the vote opens within a minute" : `vote ends ${timestamp(request.voteEndsAt, "R")}`;
    }
}
/**
 * One history entry: when, which Alliance, joined, declined or left, the Members behind it as mentions, and for a vote
 * only its counts. A decline says when the Alliance may ask again.
 */
export function napHistoryLine(event) {
    const when = timestamp(event.at, "f");
    if (event.kind === "left")
        return `${when} [${event.tag}] left, by <@${event.leftBy}>`;
    const asked = `asked by <@${event.requestedBy}> ${timestamp(event.requestedAt, "f")}`;
    if (event.kind === "joined")
        return `${when} [${event.tag}] joined, ${asked}, approved ${decidedBy(event.decision)}`;
    const askAgain = timestamp(new Date(event.at.getTime() + NAP_COOLDOWN_MS), "D");
    return `${when} [${event.tag}] declined, ${asked}, ${decidedBy(event.decision)}, may ask again ${askAgain}`;
}
/** /nap history: the newest entries first, at most MAX_HISTORY_ENTRIES. */
export function napHistoryEmbed(history) {
    const newest = [...history].reverse().slice(0, MAX_HISTORY_ENTRIES);
    const description = newest.length === 0 ? "The NaP has no history yet." : newest.map((event) => napHistoryLine(event)).join("\n");
    return { title: "NaP history", color: NAP_COLOUR, description };
}
/** The texts of the NaP register; every answer to a command is private. */
export const napMessages = {
    unknownSubcommand: "Neil does not know this /nap command.",
    refusedNotR5: "Only a Member Linked to the R5 of a Home Kingdom Alliance may ask for it to join the NaP.",
    alreadyMember: (alliance) => `${alliance} is already in the NaP.`,
    requestOpen: (alliance) => `A join request for ${alliance} already waits for a decision in #nap-leaders.`,
    asked: (alliance) => `Neil asked the NaP Council in #nap-leaders to decide on ${alliance} joining the NaP.`,
    cooldown: (alliance, declinedAt, endsAt) => `${alliance} was declined on ${timestamp(declinedAt, "D")} and may ask to join the NaP again ${timestamp(endsAt, "f")} (${timestamp(endsAt, "R")}).`,
    noLeaders: "Neil could not ask the NaP Council: the server has no #nap-leaders. Ask an Officer.",
    reposted: (alliance) => `The join request for ${alliance} was missing in #nap-leaders, so Neil posted it again.`,
    postFailed: "Neil could not post the join request in #nap-leaders. Try again later, or ask an Officer.",
    refusedLeave: "Only a Member Linked to the R5 of an Alliance in the NaP may take it out of the NaP.",
    leftReply: (alliance) => `${alliance} has left the NaP. It may ask to join again with \`/nap join\`.`,
    refusedHistory: "Only the NaP Council and Officers may see the NaP history.",
    notOpen: "This join request is no longer open.",
    refusedVote: "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may vote on this, or an Officer decide it while the NaP has no members.",
    voteEnded: "The vote on this join request has ended; Neil counts it within a minute.",
    /** The private answer to a vote of the NaP Council. */
    voted: (vote, voterAlliance, alliance, endsAt, previous) => `Neil recorded ${voteName(vote)} as the vote of ${voterAlliance} on ${alliance} joining the NaP${previous === undefined || previous === vote ? "" : ` (it was ${voteName(previous)})`}. You can change it until ${timestamp(endsAt, "f")}.`,
    /**
     * The join request in #nap-leaders, with the Approve and Decline buttons: the NaP Vote and until when it runs, or, with
     * no end (the NaP has no members), that an Officer decides.
     */
    joinRequest: (alliance, asker, voteEndsAt) => `<@${asker}> asks for ${alliance} to join the NaP.\n${voteEndsAt === undefined
        ? "The NaP has no members yet, so an Officer approves or declines it with the buttons."
        : `The NaP Council votes with the buttons until ${timestamp(voteEndsAt, "f")} (${timestamp(voteEndsAt, "R")}): one vote per Alliance in the NaP, which can be changed until then. More Approve than Decline votes let ${alliance} in; otherwise it is declined and may ask again after 30 days.`}`,
    /** The join request once an Officer approved it, without its buttons. */
    approved: (alliance, asker, officer) => `${alliance} is now in the NaP: asked by <@${asker}>, approved by <@${officer}> (Officer).`,
    /** The join request once an Officer declined it, without its buttons. */
    declinedByOfficer: (alliance, asker, officer, askAgain) => `${alliance} was declined: asked by <@${asker}>, declined by <@${officer}> (Officer). It may ask again ${timestamp(askAgain, "f")}.`,
    /** The join request once the NaP Vote approved it, without its buttons. */
    approvedByVote: (alliance, asker, approve, decline) => `${alliance} is now in the NaP: asked by <@${asker}>, approved by the NaP Council's vote (${countsOf(approve, decline)}).`,
    /** The join request once the NaP Vote declined it, without its buttons. */
    declinedByVote: (alliance, asker, approve, decline, askAgain) => `${alliance} was declined by the NaP Council's vote (${countsOf(approve, decline)}): asked by <@${asker}>. It may ask again ${timestamp(askAgain, "f")}.`,
    /** The line in #nap-leaders when an Alliance leaves. */
    leftNotice: (alliance, member) => `${alliance} has left the NaP, by its R5 <@${member}>.`,
    /** The announcement in #nap-announcements when an Alliance joins: the Alliance and the time, no Member. */
    joinedAnnouncement: (alliance, at) => `🤝 ${alliance} has joined the NaP (${timestamp(at, "f")}).`,
    /** The line in #nap-leaders when a NaP Motion removed an Alliance from the NaP (a NaP Report's expulsion), no Member. */
    expelledNotice: (alliance, motion) => `${alliance} was removed from the NaP by NaP Motion #${motion.toString()}.`,
    /** The announcement in #nap-announcements when a NaP Motion removed an Alliance: the Alliance, the motion and the time. */
    expelledAnnouncement: (alliance, motion, at) => `${alliance} was removed from the NaP by NaP Motion #${motion.toString()} (${timestamp(at, "f")}).`,
    /** The announcement in #nap-announcements when an Alliance leaves: the Alliance and the time, no Member. */
    leftAnnouncement: (alliance, at) => `${alliance} has left the NaP (${timestamp(at, "f")}).`,
    logRequested: (memberId, tag) => `<@${memberId}> asked for [${tag}] to join the NaP.`,
    logApproved: (memberId, tag, asker) => `Officer <@${memberId}> approved [${tag}] joining the NaP (asked by <@${asker}>).`,
    logDeclined: (memberId, tag, asker, askAgain) => `Officer <@${memberId}> declined [${tag}] joining the NaP (asked by <@${asker}>); it may ask again ${timestamp(askAgain, "f")}.`,
    logVoted: (memberId, vote, voterTag, tag, previous) => `NaP Council member <@${memberId}> voted ${voteName(vote)} for [${voterTag}] on [${tag}] joining the NaP${previous === undefined ? "" : `, changed from ${voteName(previous)}`}.`,
    logVoteResult: (tag, asker, result, askAgain) => `The NaP Council's vote ${result.outcome} [${tag}] joining the NaP (asked by <@${asker}>): ${countsOf(result.approve, result.decline)}${result.outcome === "declined" ? `; it may ask again ${timestamp(askAgain, "f")}` : ""}.`,
    logVoteOpened: (tag, endsAt) => `The NaP Council's vote on [${tag}] joining the NaP is open until ${timestamp(endsAt, "f")}.`,
    logEditFailed: (tag, reason) => `Editing the NaP join request for [${tag}] in #nap-leaders failed: ${reason}`,
    logLeft: (memberId, tag) => `<@${memberId}> took [${tag}] out of the NaP.`,
    logExpelled: (tag, motion, proposer) => `[${tag}] was removed from the NaP by NaP Motion #${motion.toString()}, proposed by <@${proposer}>.`,
    logExpelSkipped: (tag, motion) => `[${tag}] was not removed from the NaP by NaP Motion #${motion.toString()}: it is no longer in the NaP.`,
    logNoLeaders: (tag) => `The NaP join request for [${tag}] was not posted: the server has no #nap-leaders.`,
    logRequestPostFailed: (tag, reason) => `Posting the NaP join request for [${tag}] in #nap-leaders failed: ${reason}`,
    logReposted: (memberId, tag) => `<@${memberId}> had the NaP join request for [${tag}] posted again in #nap-leaders.`,
    logRepostNoLeaders: (tag) => `The NaP join request for [${tag}] was not posted again: the server has no #nap-leaders.`,
    logRepostFailed: (tag, reason) => `Posting the NaP join request for [${tag}] in #nap-leaders again failed: ${reason}`,
    logLeaveNoLeaders: (tag) => `The NaP leave of [${tag}] was not posted: the server has no #nap-leaders.`,
    logLeavePostFailed: (tag, reason) => `Posting the NaP leave of [${tag}] in #nap-leaders failed: ${reason}`,
    logNoAnnouncements: (tag) => `The NaP change of [${tag}] was not announced: the server has no #nap-announcements.`,
    logAnnouncementFailed: (tag, reason) => `Announcing the NaP change of [${tag}] in #nap-announcements failed: ${reason}`,
    logListNoAnnouncements: "The NaP list was not posted: the server has no #nap-announcements.",
    logListFailed: (reason) => `Updating the NaP list in #nap-announcements failed: ${reason}`,
    logListPinFailed: (reason) => `Pinning the NaP list in #nap-announcements failed: ${reason}`,
};
//# sourceMappingURL=nap-texts.js.map