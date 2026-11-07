import {
  MessageFlags,
  type InteractionReplyOptions,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { helpReply } from "./help-texts.js";

/** The answer when the list cannot be built. */
const HELP_UNAVAILABLE = "Help is not available right now. Please tell an Officer.";

/** The part of a discord.js chat-input interaction that /help uses: the caller's roles and the private reply. */
export interface HelpInteraction {
  memberRoleIds(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface HelpContext {
  /** The command definitions as the bot registers them. */
  readonly commands: readonly RESTPostAPIApplicationCommandsJSONBody[];
  readonly officerRoleIds: readonly string[];
  readonly logError: (message: string) => void;
}

/**
 * Answers /help privately with the commands the caller can use, and what they are for; mentions are switched off. An
 * answer that cannot be built is logged and said to be unavailable; a failed reply is logged, never thrown.
 */
export async function handleHelp(interaction: HelpInteraction, context: HelpContext): Promise<void> {
  let answer: Pick<InteractionReplyOptions, "content" | "embeds">;
  try {
    const officer = isOfficer(interaction.memberRoleIds(), context.officerRoleIds);
    answer = { embeds: [helpReply(context.commands, { officer })] };
  } catch (error) {
    context.logError(`Building /help failed: ${error instanceof Error ? error.message : String(error)}`);
    answer = { content: HELP_UNAVAILABLE };
  }
  try {
    await interaction.reply({ ...answer, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (error) {
    context.logError(`Replying to /help failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
