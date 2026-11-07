import {
  MessageFlags,
  type InteractionReplyOptions,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { helpReply } from "./help-texts.js";

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
 * Answers /help privately with the commands the caller can use, and what they are for; mentions are switched off. A failed
 * reply is logged, never thrown.
 */
export async function handleHelp(interaction: HelpInteraction, context: HelpContext): Promise<void> {
  const embed = helpReply(context.commands, {
    officer: isOfficer(interaction.memberRoleIds(), context.officerRoleIds),
  });
  try {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (error) {
    context.logError(`Replying to /help failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
