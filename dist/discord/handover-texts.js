import { allianceRoleName } from "../domain/managed-roles.js";
import { timestamp } from "./timestamps.js";
/** The siege as Discord timestamps: the full date and time, and how long until it. */
function siegeText(siege) {
    return `${timestamp(siege, "F")} (${timestamp(siege, "R")})`;
}
/**
 * The text of a Handover Reminder in #nap-leaders, without its mentions: the R5s of both Alliances follow it. It names
 * the outgoing and the receiving Alliance and the Royal City siege.
 */
export function handoverReminderText(kind, alliances, siege) {
    const outgoing = allianceRoleName(alliances.outgoing);
    const receiving = allianceRoleName(alliances.receiving);
    const opening = kind === "reminder-1h"
        ? `🏰 **Handover Reminder**: the Royal City siege starts soon, ${siegeText(siege)}.`
        : `🏰 **Handover Reminder**: the Royal City siege is ${siegeText(siege)}.`;
    return [
        opening,
        `${outgoing}, the Holding Alliance, hands the Royal City over to ${receiving}. Please keep the Handover peaceful.`,
        `R5 of ${outgoing} and ${receiving}:`,
    ].join("\n");
}
/** The next-holder announcement in #home-kingdom-announcements. It mentions nobody. */
export function nextHolderAnnouncement(alliances, siege) {
    const content = `📣 **Next Holding Alliance**: at the Royal City siege ${siegeText(siege)}, ${allianceRoleName(alliances.receiving)} takes over the Royal City from ${allianceRoleName(alliances.outgoing)}.`;
    return { content, allowedMentions: { parse: [] } };
}
/** The #neil-log line for an Alliance named in a Handover Reminder without a mention: no Member holds R5 and its role. */
export function noLeaderLogLine(kind, tag) {
    const which = kind === "reminder-1h" ? "1-hour" : "24-hour";
    return `The ${which} Handover Reminder names ${allianceRoleName(tag)} without a mention: no Member holds both R5 and ${allianceRoleName(tag)}.`;
}
//# sourceMappingURL=handover-texts.js.map