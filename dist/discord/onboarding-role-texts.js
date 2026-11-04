const NO_MENTIONS = { parse: [] };
/** The one line the startup sweep posts to the log channel, with the counts. Mentions nobody. */
export function onboardingRoleStartupLogLine(counts) {
    return {
        content: `Onboarding Role at startup: given to ${String(counts.given)}, taken off ${String(counts.takenOff)}, skipped ${String(counts.skipped)}.`,
        allowedMentions: NO_MENTIONS,
    };
}
//# sourceMappingURL=onboarding-role-texts.js.map