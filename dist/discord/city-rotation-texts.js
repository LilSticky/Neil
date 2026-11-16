import { ButtonStyle, ComponentType, } from "discord.js";
import { timestamp } from "./timestamps.js";
/** The custom id prefix of the Confirm handover button. */
export const ROTATION_CONFIRM_PREFIX = "rotation-confirm:";
/** The colour of the City Rotation card. */
const CARD_COLOUR = 0xc9a227;
/** An Alliance as the card names it: `[TAG] name`, or `[TAG]` when the name is not known. */
export function allianceLabel(tag, name) {
    return name === undefined ? `[${tag}]` : `[${tag}] ${name}`;
}
/** The City Rotation card, pinned in nap-announcements and shown by /rotation show. Timestamps only in the description. */
export function cityRotationCard(content) {
    const { mode, state, label, next, nextSiege } = content;
    const lines = [];
    if (mode === "contested") {
        lines.push("**Mode**: Contested. Alliances fight over the Royal City; an Officer names each new Holding Alliance.");
        lines.push(`**Holding Alliance**: ${state.holding === undefined ? "not named yet" : label(state.holding)}`);
    }
    else if (state.order === undefined) {
        lines.push("No City Rotation is set yet. The R5s of the Alliances in it set it with `/rotation set`.");
    }
    else {
        lines.push("**Mode**: Rotation. The Alliances take the Royal City in this order, one Turn each.");
        lines.push(`**Holding Alliance**: ${state.holding === undefined ? "not named yet" : label(state.holding)}`);
        if (next !== undefined)
            lines.push(`**Next Holding Alliance**: ${label(next)}`);
        lines.push("", "**Order**", ...state.order.map((tag, index) => `${(index + 1).toString()}. ${label(tag)}`));
    }
    if (state.handover !== undefined) {
        lines.push("", `**Handover**: waiting for ${label(state.handover.expected)} to confirm.`);
    }
    lines.push("", nextSiege === undefined
        ? "**Next Royal City siege**: the siege time is not set."
        : `**Next Royal City siege**: ${timestamp(nextSiege, "F")} (${timestamp(nextSiege, "R")})`);
    return { title: "City Rotation", color: CARD_COLOUR, description: lines.join("\n") };
}
/** The Confirm handover button of a Handover after the siege at `siegeAt`, to `tag`. */
export function confirmHandoverRow(siegeAt, tag) {
    return {
        type: ComponentType.ActionRow,
        components: [
            {
                type: ComponentType.Button,
                style: ButtonStyle.Success,
                label: "Confirm handover",
                custom_id: `${ROTATION_CONFIRM_PREFIX}${siegeAt.getTime().toString()}:${tag}`,
            },
        ],
    };
}
/** The siege and the tag a Confirm handover button names; undefined for a custom id Neil did not make. */
export function confirmHandoverOf(customId) {
    if (!customId.startsWith(ROTATION_CONFIRM_PREFIX))
        return undefined;
    const rest = customId.slice(ROTATION_CONFIRM_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon <= 0)
        return undefined;
    const siegeAt = Number(rest.slice(0, colon));
    const tag = rest.slice(colon + 1);
    if (!Number.isSafeInteger(siegeAt) || tag === "")
        return undefined;
    return { siegeAt, tag };
}
/** The texts of the City Rotation; every answer to a command is private. */
export const cityRotationMessages = {
    unknownSubcommand: "Neil does not know this /rotation command.",
    contested: "This Kingdom is Contested: there is no City Rotation order. An Officer names the Holding Alliance with `/rotation holder`.",
    refusedSet: "Only a Member Linked to the R5 of a Home Kingdom Alliance in the City Rotation may set it (while none is set, of an Alliance in the new order).",
    refusedHolder: "Only Officers may name the Holding Alliance.",
    noOrderTags: "Name the Alliances of the City Rotation by tag, separated by commas or spaces, e.g. `NML, ABC, XYZ`.",
    unknownTags: (tags) => `Neil does not know ${tags.map((tag) => `[${tag}]`).join(", ")} as ${tags.length === 1 ? "an Alliance" : "Alliances"} of the Home Kingdom. Look ${tags.length === 1 ? "it" : "them"} up with \`/alliance\` first, then try again.`,
    problem: (problem) => {
        switch (problem.kind) {
            case "too-short":
                return "A City Rotation needs at least 2 Alliances.";
            case "too-long":
                return "A City Rotation holds at most 10 Alliances.";
            case "duplicate":
                return `[${problem.tag}] is named twice; each Alliance takes one Turn.`;
            case "holder-not-in-order":
                return `[${problem.tag}] is not in the order, so it cannot be the Holding Alliance.`;
        }
    },
    noRotationForHolder: "No City Rotation is set yet. The R5s set it with `/rotation set` first.",
    holderNotInOrder: (tag) => `[${tag}] is not in the City Rotation, so it cannot be the Holding Alliance.`,
    unknownHolder: (tag) => `Neil does not know [${tag}] as an Alliance of the Home Kingdom. Look it up with \`/alliance\` first, then try again.`,
    set: (holding) => `The City Rotation is set. ${holding} holds the Royal City this Turn.`,
    holderNamed: (holding) => `${holding} is now the Holding Alliance.`,
    confirmRefused: "Only the R5 of the receiving Alliance, or an Officer, may confirm this Handover.",
    notOpen: "This Handover is no longer open.",
    confirmed: (alliance, memberId) => `The Handover is confirmed by <@${memberId}>: ${alliance} now holds the Royal City.`,
    /** The confirmation request in nap-leaders after a Royal City siege, in Rotation mode. */
    confirmRequest: (alliance, leader, readFailed) => {
        const head = `The Royal City siege is over. By the City Rotation, ${alliance} takes the Royal City this Turn.`;
        if (leader.kind === "linked") {
            const name = leader.playerName === undefined ? "" : ` (${leader.playerName})`;
            return `${head}\n<@${leader.memberId}>${name}, as its R5, please confirm the Handover. An Officer may confirm too.`;
        }
        if (leader.kind === "unlinked") {
            const name = leader.playerName === undefined ? "Its R5" : `Its R5, ${leader.playerName},`;
            return `${head}\n${name} has no Link on this server, so an Officer confirms the Handover.`;
        }
        return readFailed
            ? `${head}\nNeil could not read its R5 from the Game API, so an Officer confirms the Handover.`
            : `${head}\nThe Game API names no R5 for it, so an Officer confirms the Handover.`;
    },
    /** The line in nap-leaders after a Royal City siege, in Contested mode. */
    contestedSiegeOver: "The Royal City siege is over. An Officer names the new Holding Alliance with `/rotation holder`.",
    logSet: (memberId, oldOrder, oldHolding, newOrder, newHolding) => `<@${memberId}> set the City Rotation: ${oldOrder} (holding ${oldHolding}) → ${newOrder} (holding ${newHolding}).`,
    logHolder: (memberId, holding) => `Officer <@${memberId}> named ${holding} the Holding Alliance.`,
    logExpected: (alliance, leaderUid) => `After the Royal City siege, Neil expects ${alliance} to take the Royal City; its R5 is ${leaderUid === undefined ? "unknown" : `uid ${leaderUid}`}. Waiting for confirmation.`,
    logStillWaiting: (alliance) => `A Royal City siege passed while the Handover to ${alliance} still waits for confirmation; Neil asks nothing new.`,
    logConfirmed: (memberId, by, alliance) => `${by === "R5" ? "The R5" : "Officer"} <@${memberId}> confirmed the Handover: ${alliance} is the Holding Alliance.`,
    logNoAnnouncements: "The City Rotation card was not posted: the server has no #nap-announcements.",
    logNoLeaders: "The Royal City siege message was not posted: the server has no #nap-leaders.",
    logCardFailed: (reason) => `Updating the City Rotation card in #nap-announcements failed: ${reason}`,
    logPinFailed: (reason) => `Pinning the City Rotation card in #nap-announcements failed: ${reason}`,
    logSiegePostFailed: (reason) => `Posting the Royal City siege message in #nap-leaders failed: ${reason}`,
};
/** An order as the log shows it: the tags in brackets, or "none". */
export function orderText(order) {
    return order === undefined ? "none" : order.map((tag) => `[${tag}]`).join(" → ");
}
//# sourceMappingURL=city-rotation-texts.js.map