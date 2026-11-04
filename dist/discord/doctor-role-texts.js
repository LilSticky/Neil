const NO_MENTIONS = { parse: [] };
/** The one line the startup sweep of the Doctor Role posts to the log channel, with the counts. Mentions nobody. */
export function doctorRoleStartupLogLine(counts) {
    return {
        content: `Doctor Role at startup: given to ${String(counts.given)}, taken off ${String(counts.takenOff)}, skipped ${String(counts.skipped)}.`,
        allowedMentions: NO_MENTIONS,
    };
}
/** The line logged when a give or take-off of the Doctor Role outside the startup sweep is skipped. Mentions nobody. */
export function doctorRoleSkippedLogLine(memberId, reason) {
    return {
        content: `Changing the Doctor Role of ${memberId} was skipped: ${reason}.`,
        allowedMentions: NO_MENTIONS,
    };
}
//# sourceMappingURL=doctor-role-texts.js.map