import { MessageFlags } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { lookupMessages } from "./lookup-cards.js";
import { usageReply } from "./usage-texts.js";
/**
 * Answers /usage privately with the caller's requests today; no Game API request is made. A failed read of the figures is
 * logged and answered as unavailable; a failed reply is logged, never thrown.
 */
export async function handleUsage(interaction, context) {
    let content;
    try {
        content = usageReply({
            used: context.allowance.usageOf(interaction.callerId),
            allowance: context.allowance.allowance(),
            officer: isOfficer(interaction.memberRoleIds(), context.officerRoleIds),
            now: context.now(),
        });
    }
    catch (error) {
        context.logError(`Reading /usage failed: ${error instanceof Error ? error.message : String(error)}`);
        content = lookupMessages.unavailable;
    }
    try {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    catch (error) {
        context.logError(`Replying to /usage failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=usage.js.map