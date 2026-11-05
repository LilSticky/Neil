import { MessageFlags } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { leftForLookups, nextReset, remaining, utcDayOf } from "../domain/daily-quota.js";
import { lookupMessages, timeLeft, utcTime } from "./lookup-cards.js";
const NOT_OFFICER_TEXT = "/quota is for Officers (Moderator or King).";
/** The most Members the Most requests today list shows. */
const MOST_LISTED = 10;
/** The Daily Allowance lines: the allowance per Member, the Expected Lookup Members, and the Members with the most requests today. */
function renderAllowanceLines(allowance) {
    const header = `Daily Allowance: ${allowance.allowance().toLocaleString("en-US")} per Member (Expected Lookup Members: ${allowance.expected().toLocaleString("en-US", { maximumFractionDigits: 1 })})`;
    const top = allowance.top(MOST_LISTED).slice(0, MOST_LISTED);
    if (top.length === 0)
        return [header, "No lookups yet today."];
    return [
        header,
        "Most requests today:",
        ...top.map((usage, index) => `${(index + 1).toString()}. <@${usage.memberId}> · ${usage.requests.toLocaleString("en-US")}`),
    ];
}
/** The lines of the Daily Quota reply, or variants when the limit is spent or unconfirmed, then the Daily Allowance lines. */
function renderQuotaReply(quota, quotaReserve, now, allowance) {
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
        ...renderAllowanceLines(allowance),
    ].join("\n");
}
/**
 * Answers /quota privately: the Daily Quota for Officers, a refusal for everyone else. A failed read of the figures is
 * logged and answered as unavailable; a failed reply is logged, never thrown.
 */
export async function handleQuota(interaction, context) {
    let content;
    try {
        content = isOfficer(interaction.memberRoleIds(), context.officerRoleIds)
            ? renderQuotaReply(context.quotaToday(), context.quotaReserve, context.now(), context.allowance)
            : NOT_OFFICER_TEXT;
    }
    catch (error) {
        context.logError(`Reading /quota failed: ${error instanceof Error ? error.message : String(error)}`);
        content = lookupMessages.unavailable;
    }
    try {
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