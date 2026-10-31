import { MessageFlags } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { leftForLookups, nextReset, remaining, utcDayOf } from "../domain/daily-quota.js";
import { timeLeft, utcTime } from "./lookup-cards.js";
const NOT_OFFICER_TEXT = "/quota is for Officers (Moderator or King).";
/** The lines of the Daily Quota reply, or variants when the limit is spent or unconfirmed. */
function renderQuotaReply(quota, quotaReserve, now) {
    const spent = quota.limitReached ? " · Spent: the Game API reported the limit reached" : "";
    const reset = nextReset(now);
    const confirmed = quota.confirmedAt === undefined
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
/** Answers /quota privately: the Daily Quota for Officers, a refusal for everyone else. A failed reply is logged, never thrown. */
export async function handleQuota(interaction, context) {
    try {
        const content = isOfficer(interaction.memberRoleIds(), context.officerRoleIds)
            ? renderQuotaReply(context.quotaToday(), context.quotaReserve, context.now())
            : NOT_OFFICER_TEXT;
        await interaction.reply({
            content,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
        });
    }
    catch (error) {
        context.logError(`Replying to /quota failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=quota.js.map