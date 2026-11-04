import type { APIAllowedMentions, BaseMessageOptions } from "discord.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { RoleCounts } from "./link-state-role.js";
import type { SkipReason } from "./member-roles.js";

const NO_MENTIONS: APIAllowedMentions = { parse: [] };

/** The one line the startup sweep of the Onboarding Role posts to the log channel, with the counts. Mentions nobody. */
export function onboardingRoleStartupLogLine(counts: RoleCounts): BaseMessageOptions {
  return {
    content: `Onboarding Role at startup: given to ${String(counts.given)}, taken off ${String(counts.takenOff)}, skipped ${String(counts.skipped)}.`,
    allowedMentions: NO_MENTIONS,
  };
}

/** The line logged when a give or take-off of the Onboarding Role outside the startup sweep is skipped. Mentions nobody. */
export function onboardingRoleSkippedLogLine(memberId: MemberId, reason: SkipReason): BaseMessageOptions {
  return {
    content: `Changing the Onboarding Role of ${memberId} was skipped: ${reason}.`,
    allowedMentions: NO_MENTIONS,
  };
}
