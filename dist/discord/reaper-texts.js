import { utcDayOf } from "../domain/daily-quota.js";
import { escapeText, fitEscaped, utcTime } from "./lookup-cards.js";
/**
 * An escaped Exile name is cut to 50 characters where a line or a confirmation shows it. With a reason of 200 characters
 * escaped to 400, eight list lines of this size stay within a 4,096-character embed description.
 */
const NAME_MAX_LENGTH = 50;
/** The escaped name of an Exile, cut to NAME_MAX_LENGTH. */
function fittedName(name) {
    return fitEscaped(escapeText(name), NAME_MAX_LENGTH);
}
/** The texts of /reaper: add, closest, list, paging and their refusals and answers. Names and reasons are escaped. */
export const reaperMessages = {
    refused: "Only R5s of Home Kingdom Alliances may change REAPER.",
    unknownSubcommand: "Neil does not know this /reaper subcommand.",
    invalidReason: "Give a reason of 1 to 200 characters.",
    added: (name, kingdom, allianceText) => `${fittedName(name)} (Kingdom ${kingdom.toString()}, ${allianceText}) is now an Exile.`,
    alreadyExile: (name, reason) => `${fittedName(name)} is already an Exile: ${escapeText(reason)}`,
    addLog: (name, uid, kingdom, adderId, reason) => `🔥 ${escapeText(name)} (${uid}, Kingdom ${kingdom.toString()}) added to REAPER by <@${adderId}>: ${escapeText(reason)}`,
    removed: (name) => `${escapeText(name)} is no longer an Exile.`,
    notAnExile: "not an Exile",
    removeLog: (name, uid, kingdom, removerId) => `${escapeText(name)} (${uid}, Kingdom ${kingdom.toString()}) removed from REAPER by <@${removerId}>`,
    /** The label of an Exile in the /reaper remove suggestions: the name and the Kingdom. */
    exileChoice: (name, kingdom) => `${name} (Kingdom ${kingdom.toString()})`,
    bothXAndY: "Give both x and y.",
    askXAndY: "Give x and y to measure from. Neil has no position for you.",
    noExilesInKingdom: (kingdom) => `No Exiles in Kingdom ${kingdom.toString()}.`,
    /** Every Exile of the Kingdom was left out, with the count and why. */
    allLeftOut: (leftOut) => {
        const total = leftOut.shielded + leftOut.unreadable;
        const subject = total === 1 ? "The only Exile was" : `All ${total.toString()} Exiles were`;
        return `${subject} left out: ${leftOutCounts(leftOut)}.`;
    },
    /** The header line that says how many Exiles were left out and why. */
    leftOut: (leftOut) => `Left out: ${leftOutCounts(leftOut)}.`,
    closestTitle: (kingdom) => `Closest Exiles in Kingdom ${kingdom.toString()}`,
    closestOrigin: (origin) => `Measured from ${coordinates(origin)}. Neil cannot see shields reliably, so an Exile behind a shield may still show.`,
    fields: {
        coordinates: "Coordinates",
        distance: "Distance",
        reason: "Reason",
        exiledOn: "Exiled on",
    },
    /** Coordinates as "X:3 Y:4"; a stored position also says when it was read. */
    coordinates: (position, readAt) => readAt === undefined
        ? coordinates(position)
        : `${coordinates(position)} (position as of ${utcDayOf(readAt)} ${utcTime(readAt)})`,
    /** A distance rounded to one decimal place, the ".0" dropped. */
    distance: (value) => (Math.round(value * 10) / 10).toString(),
    empty: "REAPER is empty.",
    listTitle: "Exiles in REAPER",
    /** One Exile of the list: name, Kingdom, reason and the day it was added. */
    listLine: (exile) => `**${fittedName(exile.name)}** · Kingdom ${exile.kingdom.toString()} · ${escapeText(exile.reason)} · exiled ${utcDayOf(exile.addedAt)}`,
    pageExpired: "This list has expired, run /reaper again.",
    pageNotYours: "Only the Member who ran /reaper can turn its pages.",
    previous: "◀ Previous",
    next: "Next ▶",
    pageLabel: (page, pageCount) => `Page ${page.toString()}/${pageCount.toString()}`,
};
/** The counts of the Exiles left out, each named only when there is one. */
function leftOutCounts(leftOut) {
    const parts = [];
    if (leftOut.shielded > 0)
        parts.push(`${leftOut.shielded.toString()} shielded`);
    if (leftOut.unreadable > 0)
        parts.push(`${leftOut.unreadable.toString()} could not be read`);
    return parts.join(", ");
}
function coordinates(position) {
    return `X:${position.x.toString()} Y:${position.y.toString()}`;
}
//# sourceMappingURL=reaper-texts.js.map