import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { leftForLookups, nextReset, remaining, utcDayOf, type DailyQuota } from "../domain/daily-quota.js";
import { timeLeft, utcTime } from "./lookup-cards.js";

const NOT_OFFICER_TEXT = "/quota is for Officers (Moderator or King).";

/** The lines of the Daily Quota reply, or variants when the limit is spent or unconfirmed. */
function renderQuotaReply(quota: DailyQuota, quotaReserve: number, now: Date): string {
  const spent = quota.limitReached ? " · Spent: the Game API reported the limit reached" : "";
  const reset = nextReset(now);
  const confirmed =
    quota.confirmedAt === undefined
      ? "Not confirmed by the Game API yet today."
      : `Last confirmed by the Game API at ${utcTime(quota.confirmedAt)}.`;
  return [
    `Daily Quota for ${utcDayOf(now)} (UTC)`,
    `Used: ${quota.used.toLocaleString("en-US")} · Remaining: ${remaining(quota).toLocaleString("en-US")} · Limit: ${quota.limit.toLocaleString("en-US")}${spent}`,
    `Quota Reserve: ${quotaReserve.toLocaleString("en-US")} (for Onboarding Interviews) · Left for lookups: ${leftForLookups(quota, quotaReserve).toLocaleString("en-US")}`,
    `Resets at 00:00 UTC (${timeLeft(reset, now)}).`,
    confirmed,
  ].join("\n");
}

/** The part of a discord.js chat-input interaction that /quota uses. */
export interface QuotaInteraction {
  memberRoleIds(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface QuotaContext {
  readonly quotaToday: () => DailyQuota;
  /** Requests kept back for Onboarding Interviews; from GAME_API_QUOTA_RESERVE. */
  readonly quotaReserve: number;
  readonly officerRoleIds: readonly string[];
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/** Answers /quota privately: the Daily Quota for Officers, a refusal for everyone else. A failed reply is logged, never thrown. */
export async function handleQuota(interaction: QuotaInteraction, context: QuotaContext): Promise<void> {
  try {
    const content = isOfficer(interaction.memberRoleIds(), context.officerRoleIds)
      ? renderQuotaReply(context.quotaToday(), context.quotaReserve, context.now())
      : NOT_OFFICER_TEXT;
    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    context.logError(`Replying to /quota failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
