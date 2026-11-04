import type { APIAllowedMentions, BaseMessageOptions } from "discord.js";
import type { RoleCounts } from "./link-state-role.js";

const NO_MENTIONS: APIAllowedMentions = { parse: [] };

/** The one line the startup sweep of the Onboarding Role posts to the log channel, with the counts. Mentions nobody. */
export function onboardingRoleStartupLogLine(counts: RoleCounts): BaseMessageOptions {
  return {
    content: `Onboarding Role at startup: given to ${String(counts.given)}, taken off ${String(counts.takenOff)}, skipped ${String(counts.skipped)}.`,
    allowedMentions: NO_MENTIONS,
  };
}
