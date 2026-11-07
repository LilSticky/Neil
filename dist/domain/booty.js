import { lastSeen } from "./alliance-overview.js";
const MINUTES_PER_DAY = 1440;
const ONE_MINUTE_MS = 60_000;
const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
function isMinuteOfDay(value) {
    return Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;
}
export function parseBootyWindow(startMinute, endMinute) {
    if (!isMinuteOfDay(startMinute) || !isMinuteOfDay(endMinute))
        return { ok: false };
    return { ok: true, value: { startMinute, endMinute } };
}
/** Equal start and end cover the whole day; a start after the end runs over midnight. */
export function isInsideBootyWindow(window, minute) {
    const { startMinute, endMinute } = window;
    if (startMinute === endMinute)
        return true;
    if (startMinute < endMinute)
        return minute >= startMinute && minute < endMinute;
    return minute >= startMinute || minute < endMinute;
}
/** Reads an HH:MM time as the minute after midnight. */
export function parseBootyTime(input) {
    const match = HH_MM_PATTERN.exec(input);
    if (match === null)
        return { ok: false };
    const [, hours, minutes] = match;
    if (hours === undefined || minutes === undefined)
        return { ok: false };
    return { ok: true, value: Number(hours) * 60 + Number(minutes) };
}
export function isBootyMatch(bootyAlerts, presence) {
    if (bootyAlerts.mode === "off")
        return false;
    if (!isInsideBootyWindow(bootyAlerts.window, presence.localMinute))
        return false;
    switch (bootyAlerts.mode) {
        case "always":
            return true;
        case "online":
            return presence.online;
        case "offline":
            return !presence.online;
    }
}
/**
 * Whether a Member counts as online for a Booty Call: Discord shows them not offline, or the game does, by the rule of
 * `lastSeen` (a Player without a Last Online is online now). Without any game reading, Discord alone decides.
 */
export function isBootyOnline(game, discordOnline) {
    if (discordOnline)
        return true;
    return game !== undefined && lastSeen(game).kind === "online";
}
export function isConfirmationExpired(requestedAt, now) {
    return now - requestedAt >= ONE_MINUTE_MS;
}
export function isBootyCallCoolingDown(calledAt, now) {
    return now - calledAt < ONE_MINUTE_MS;
}
//# sourceMappingURL=booty.js.map