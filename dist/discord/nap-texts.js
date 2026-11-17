import { ButtonStyle, ComponentType, } from "discord.js";
import { timestamp } from "./timestamps.js";
/** The custom id prefix of the Approve button of a NaP join request. */
export const NAP_APPROVE_PREFIX = "nap-approve:";
/** The most history entries /nap history shows. */
export const MAX_HISTORY_ENTRIES = 20;
/** The most former members the NaP list shows. */
export const MAX_FORMER_MEMBERS = 20;
/** The colour of the NaP embeds. */
const NAP_COLOUR = 0x3b88c3;
/** The Approve button of the join request of `tag`, made at `requestedAt`. */
export function napApproveRow(tag, requestedAt) {
    return {
        type: ComponentType.ActionRow,
        components: [
            {
                type: ComponentType.Button,
                style: ButtonStyle.Success,
                label: "Approve",
                custom_id: `${NAP_APPROVE_PREFIX}${tag}:${requestedAt.getTime().toString()}`,
            },
        ],
    };
}
/** The tag and request time an Approve button names; undefined for a custom id Neil did not make. */
export function napApproveOf(customId) {
    if (!customId.startsWith(NAP_APPROVE_PREFIX))
        return undefined;
    const rest = customId.slice(NAP_APPROVE_PREFIX.length);
    const colon = rest.lastIndexOf(":");
    if (colon <= 0)
        return undefined;
    const tag = rest.slice(0, colon);
    const requestedAt = Number(rest.slice(colon + 1));
    if (!Number.isSafeInteger(requestedAt) || rest.slice(colon + 1) === "")
        return undefined;
    return { tag, requestedAt };
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
/** /nap show: the NaP list, then the open join requests by tag. No Members are named. */
export function napShowEmbed(members, former, requests, label) {
    const list = napListEmbed(members, former, label);
    if (requests.length === 0)
        return list;
    const waiting = ["", "**Waiting for approval**", ...requests.map((request) => `- [${request.tag}]`)];
    return { ...list, description: [list.description ?? "", ...waiting].join("\n") };
}
/** One history entry: when, which Alliance, joined or left, and the Members behind it as mentions. */
export function napHistoryLine(event) {
    const when = timestamp(event.at, "f");
    if (event.kind === "left")
        return `${when} [${event.tag}] left, by <@${event.leftBy}>`;
    const officer = event.approvedAs === "officer" ? " (Officer)" : "";
    return `${when} [${event.tag}] joined, asked by <@${event.requestedBy}> ${timestamp(event.requestedAt, "f")}, approved by <@${event.approvedBy}>${officer}`;
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
    requestOpen: (alliance) => `A join request for ${alliance} already waits for approval in #nap-leaders.`,
    asked: (alliance) => `Neil asked the NaP Council in #nap-leaders to approve ${alliance} joining the NaP.`,
    noLeaders: "Neil could not ask the NaP Council: the server has no #nap-leaders. Ask an Officer.",
    reposted: (alliance) => `The join request for ${alliance} was missing in #nap-leaders, so Neil posted it again.`,
    postFailed: "Neil could not post the join request in #nap-leaders. Try again later, or ask an Officer.",
    refusedLeave: "Only a Member Linked to the R5 of an Alliance in the NaP may take it out of the NaP.",
    leftReply: (alliance) => `${alliance} has left the NaP. It may ask to join again with \`/nap join\`.`,
    refusedHistory: "Only the NaP Council and Officers may see the NaP history.",
    notOpen: "This join request is no longer open.",
    refusedApprove: "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may approve this, or an Officer while the NaP has no members.",
    /** The join request in #nap-leaders, with the Approve button. */
    joinRequest: (alliance, asker, napEmpty) => `<@${asker}> asks for ${alliance} to join the NaP.\n${napEmpty
        ? "The NaP has no members yet, so an Officer approves it."
        : "A member of the NaP Council approves it with the button."}`,
    /** The join request once approved, without its button. */
    approved: (alliance, asker, approver, as) => `${alliance} is now in the NaP: asked by <@${asker}>, approved by <@${approver}>${as === "officer" ? " (Officer)" : ""}.`,
    /** The line in #nap-leaders when an Alliance leaves. */
    leftNotice: (alliance, member) => `${alliance} has left the NaP, by its R5 <@${member}>.`,
    /** The announcement in #nap-announcements when an Alliance joins: the Alliance and the time, no Member. */
    joinedAnnouncement: (alliance, at) => `🤝 ${alliance} has joined the NaP (${timestamp(at, "f")}).`,
    /** The announcement in #nap-announcements when an Alliance leaves: the Alliance and the time, no Member. */
    leftAnnouncement: (alliance, at) => `${alliance} has left the NaP (${timestamp(at, "f")}).`,
    logRequested: (memberId, tag) => `<@${memberId}> asked for [${tag}] to join the NaP.`,
    logApproved: (memberId, as, tag, asker) => `${as === "officer" ? "Officer" : "NaP Council member"} <@${memberId}> approved [${tag}] joining the NaP (asked by <@${asker}>).`,
    logLeft: (memberId, tag) => `<@${memberId}> took [${tag}] out of the NaP.`,
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