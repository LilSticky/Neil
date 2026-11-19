import { MessageFlags, type InteractionReplyOptions, type RESTPostAPIApplicationCommandsJSONBody } from "discord.js";
import { isOfficer } from "../domain/officer.js";
import { helpPages } from "./help-texts.js";

/** The answer when the list cannot be built. */
const HELP_UNAVAILABLE = "Help is not available right now. Please tell an Officer.";

/**
 * The part of a discord.js chat-input interaction that /help uses: the caller's roles, the private reply and the
 * private follow-ups.
 */
export interface HelpInteraction {
  memberRoleIds(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
}

export interface HelpContext {
  /** The command definitions as the bot registers them. */
  readonly commands: readonly RESTPostAPIApplicationCommandsJSONBody[];
  readonly officerRoleIds: readonly string[];
  readonly logError: (message: string) => void;
}

/**
 * Answers /help privately with the commands the caller can use, and what they are for; mentions are switched off. The
 * first page goes out as the reply, every further page as a follow-up. An answer that cannot be built is logged and
 * said to be unavailable; a failed send is logged, stops the rest and is never thrown.
 */
export async function handleHelp(interaction: HelpInteraction, context: HelpContext): Promise<void> {
  let answers: readonly Pick<InteractionReplyOptions, "content" | "embeds">[];
  try {
    const officer = isOfficer(interaction.memberRoleIds(), context.officerRoleIds);
    answers = helpPages(context.commands, { officer }).map((embeds) => ({
      embeds: [...embeds],
    }));
  } catch (error) {
    context.logError(`Building /help failed: ${error instanceof Error ? error.message : String(error)}`);
    answers = [{ content: HELP_UNAVAILABLE }];
  }
  for (const [index, answer] of answers.entries()) {
    const options: InteractionReplyOptions = {
      ...answer,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    };
    try {
      await (index === 0 ? interaction.reply(options) : interaction.followUp(options));
    } catch (error) {
      context.logError(`Replying to /help failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
  }
}
