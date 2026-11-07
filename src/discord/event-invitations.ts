import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import type { EventStore } from "../storage/event-store.js";
import type { LinkStore } from "../storage/link-store.js";

/** The part of a discord.js chat-input interaction that /event-invitations uses: who ran it, the option and the private reply. */
export interface EventInvitationsInteraction {
  readonly user: { readonly id: string };
  readonly options: { getString(name: string, required?: false): string | null };
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface EventInvitationsContext {
  /** Only a Linked Member chooses Event Invitations; the choice is forgotten at Unlink. */
  readonly links: Pick<LinkStore, "linkFor">;
  readonly events: Pick<EventStore, "setInvitationsOff" | "clearInvitationsOff" | "hasInvitationsOff">;
  readonly logError: (message: string) => void;
}

const messages = {
  unavailable: "Event Invitations are not available right now. Please tell an Officer.",
  notLinked: "Only a Linked Member can choose Event Invitations. Neil has changed nothing.",
  invalidChoice: "Choose on or off. Neil has changed nothing.",
  shown: (on: boolean): string =>
    on
      ? "Your Event Invitations are on: you are mentioned in them."
      : "Your Event Invitations are off: you are not mentioned in them.",
  switched: (on: boolean): string =>
    `Neil has switched your Event Invitations ${on ? "on" : "off"}. Reminders for Events you marked Interested still come.`,
};

/**
 * Answers /event-invitations privately. Without the `invitations` option it shows the Member's choice; with `on` or `off`
 * it switches the choice. Only a Linked Member may choose, and a refusal changes nothing. A failed read or write is logged
 * and answered as unavailable; a failed reply is logged, never thrown.
 */
export async function handleEventInvitations(
  interaction: EventInvitationsInteraction,
  context: EventInvitationsContext,
): Promise<void> {
  let content: string;
  try {
    content = answerFor(interaction, context);
  } catch (error) {
    context.logError(`Event Invitations failed: ${errorMessage(error)}`);
    content = messages.unavailable;
  }
  try {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    context.logError(`Replying to /event-invitations failed: ${errorMessage(error)}`);
  }
}

function answerFor(interaction: EventInvitationsInteraction, context: EventInvitationsContext): string {
  const memberId = interaction.user.id;
  if (context.links.linkFor(memberId) === undefined) return messages.notLinked;
  const choice = interaction.options.getString("invitations");
  if (choice === null) return messages.shown(!context.events.hasInvitationsOff(memberId));
  if (choice === "off") {
    context.events.setInvitationsOff(memberId);
    return messages.switched(false);
  }
  if (choice === "on") {
    context.events.clearInvitationsOff(memberId);
    return messages.switched(true);
  }
  return messages.invalidChoice;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
