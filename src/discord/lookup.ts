import {
  MessageFlags,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type MessageMentionOptions,
} from "discord.js";
import type { GameApiClient } from "../game-api/client.js";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import type { LookupResult, Player } from "../domain/player.js";
import { lookupMessages, renderPlayerCard } from "./lookup-cards.js";

/** The part of the Game API client that /player uses. */
export type PlayerLookupApi = Pick<GameApiClient, "getPlayer">;

/** The part of a discord.js chat-input interaction that /player uses. */
export interface PlayerInteraction {
  readonly options: { getString(name: string, required: true): string };
  reply(options: InteractionReplyOptions): Promise<unknown>;
  deferReply(): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  deleteReply(): Promise<unknown>;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
}

export interface PlayerContext {
  readonly gameApi: PlayerLookupApi;
  readonly logError: (message: string) => void;
}

/** Lookups never mention anyone, whatever the Game API or the Member typed. */
const allowedMentions: MessageMentionOptions = { parse: [] };

type PlayerFailure = Exclude<LookupResult<Player>, { readonly kind: "found" }>;

function playerFailureText(failure: PlayerFailure, uid: Uid): string {
  switch (failure.kind) {
    case "not-found":
      return lookupMessages.playerNotFound(uid);
    case "quota-spent":
      return lookupMessages.quotaSpent;
    case "try-again":
      return lookupMessages.tryAgain;
    case "unavailable":
    case "ambiguous":
      // A Player lookup never gives "ambiguous"; if it ever did, the honest answer is the same as a broken lookup.
      return lookupMessages.unavailable;
  }
}

/**
 * Answers /player: invalid input privately at once; otherwise a public card, or the thinking
 * placeholder is removed and the reason is told privately. A failed Discord call is logged, never thrown.
 */
export async function handlePlayer(interaction: PlayerInteraction, context: PlayerContext): Promise<void> {
  try {
    const parsed = parseUid(interaction.options.getString("uid", true));
    if (!parsed.ok) {
      await interaction.reply({
        content: lookupMessages.invalidUid,
        flags: MessageFlags.Ephemeral,
        allowedMentions,
      });
      return;
    }

    await interaction.deferReply();
    const result = await context.gameApi.getPlayer(parsed.value);
    if (result.kind === "found") {
      await interaction.editReply({ embeds: [renderPlayerCard(result.value)], allowedMentions });
      return;
    }

    await interaction.deleteReply();
    await interaction.followUp({
      content: playerFailureText(result, parsed.value),
      flags: MessageFlags.Ephemeral,
      allowedMentions,
    });
  } catch (error) {
    context.logError(`Answering /player failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
