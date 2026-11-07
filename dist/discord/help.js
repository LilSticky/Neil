import { MessageFlags, } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { helpReply } from "./help-texts.js";
/** The answer when the list cannot be built. */
const HELP_UNAVAILABLE = "Help is not available right now. Please tell an Officer.";
/**
 * Answers /help privately with the commands the caller can use, and what they are for; mentions are switched off. An
 * answer that cannot be built is logged and said to be unavailable; a failed reply is logged, never thrown.
 */
export async function handleHelp(interaction, context) {
    let answer;
    try {
        const officer = isOfficer(interaction.memberRoleIds(), context.officerRoleIds);
        answer = { embeds: [helpReply(context.commands, { officer })] };
    }
    catch (error) {
        context.logError(`Building /help failed: ${error instanceof Error ? error.message : String(error)}`);
        answer = { content: HELP_UNAVAILABLE };
    }
    try {
        await interaction.reply({ ...answer, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    catch (error) {
        context.logError(`Replying to /help failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=help.js.map