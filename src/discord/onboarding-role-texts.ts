import type { APIAllowedMentions, BaseMessageOptions } from "discord.js";

const NO_MENTIONS: APIAllowedMentions = { parse: [] };

/** What the startup sweep of the Onboarding Role did: roles given, taken off, and changes refused (skipped). */
export interface OnboardingRoleCounts {
  readonly given: number;
  readonly takenOff: number;
  readonly skipped: number;
}

/** The one line the startup sweep posts to the log channel, with the counts. Mentions nobody. */
export function onboardingRoleStartupLogLine(counts: OnboardingRoleCounts): BaseMessageOptions {
  return {
    content: `Onboarding Role at startup: given to ${String(counts.given)}, taken off ${String(counts.takenOff)}, skipped ${String(counts.skipped)}.`,
    allowedMentions: NO_MENTIONS,
  };
}
