/** A Member came online when they were offline, or had no presence yet, and now are not offline. */
export function cameOnline(before, after) {
    return (before === undefined || before === "offline") && after !== "offline";
}
/** A Member wants an Interview when they are not a bot, not Linked, have no open Interview and were not handed off. */
export function wantsInterview(wish) {
    return !wish.bot && !wish.linked && !wish.open && !wish.handedOff;
}
//# sourceMappingURL=interview-start.js.map