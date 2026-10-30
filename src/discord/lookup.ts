import {
  MessageFlags,
  type APIEmbed,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type MessageMentionOptions,
} from "discord.js";
import type { GameApiClient } from "../game-api/client.js";
import {
  parseAllianceKey,
  parseKingdom,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type Uid,
} from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../domain/player.js";
import { lookupMessages, renderAllianceCard, renderPlayerCard } from "./lookup-cards.js";

/** The part of the Game API client the lookup commands use. */
export type LookupApi = Pick<GameApiClient, "getPlayer" | "getAlliance">;

/** The part of a discord.js chat-input interaction that /player and /alliance use. */
export interface LookupInteraction {
  readonly options: {
    getString(name: string, required: true): string;
    getInteger(name: string, required: true): number;
  };
  reply(options: InteractionReplyOptions): Promise<unknown>;
  deferReply(): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  deleteReply(): Promise<unknown>;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
}

/** What one command needs: its own Game API method, and where to log a failure. */
export interface LookupContext<Method extends keyof LookupApi> {
  readonly gameApi: Pick<LookupApi, Method>;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/** Lookups never mention anyone, whatever the Game API or the Member typed. */
const allowedMentions: MessageMentionOptions = { parse: [] };

/** Every result that gives no card. */
type Failure<T> = Exclude<LookupResult<T>, { readonly kind: "found" }>;

function playerFailureText(failure: Failure<Player>, uid: Uid, now: Date): string {
  switch (failure.kind) {
    case "not-found":
      return lookupMessages.playerNotFound(uid);
    case "not-prepared":
      // The tracker's answer for an unknown uid, but also for its own trouble (research R11).
      return lookupMessages.playerNotPrepared(uid);
    case "quota-spent":
    case "reserve-kept":
      return lookupMessages.quotaSpent(failure.resetsAt, now);
    case "try-again":
      return lookupMessages.tryAgain;
    case "unavailable":
    case "ambiguous":
      // A Player lookup never gives "ambiguous"; if it ever did, the honest answer is the same as a broken lookup.
      return lookupMessages.unavailable;
  }
}

function allianceFailureText(
  failure: Failure<Alliance>,
  kingdom: KingdomNumber,
  key: AllianceKey,
  now: Date,
): string {
  switch (failure.kind) {
    case "not-found":
      return lookupMessages.allianceNotFound(key, kingdom);
    case "ambiguous":
      return lookupMessages.ambiguous(key, failure.matches);
    case "quota-spent":
    case "reserve-kept":
      return lookupMessages.quotaSpent(failure.resetsAt, now);
    case "not-prepared":
    case "try-again":
      return lookupMessages.tryAgain;
    case "unavailable":
      return lookupMessages.unavailable;
  }
}

/** The text of a thrown value, for a log line. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Keeps a failed Discord call from escaping the handler; the failure is logged instead. */
async function answer(
  command: string,
  context: { readonly logError: (message: string) => void },
  respond: () => Promise<void>): Promise<void> {
  try {
    await respond();
  } catch (error) {
    context.logError(`Answering ${command} failed: ${errorText(error)}`);
  }
}

/** Invalid input is answered privately at once, before any Game API call. */
async function replyPrivately(interaction: LookupInteraction, content: string): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
}

/** Removes the thinking placeholder and tells the caller the text privately. */
async function removePlaceholderAndTell(interaction: LookupInteraction, content: string): Promise<void> {
  await interaction.deleteReply();
  await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions });
}

/**
 * The shared lookup flow: a public thinking placeholder, then the card. When the lookup gives no card, or the card
 * cannot be sent, the placeholder is removed and the reason is told privately; a failed send is logged, and a lookup
 * that throws is logged and told as unavailable.
 */
async function showLookup<T>(
  interaction: LookupInteraction,
  context: { readonly now: () => Date; readonly logError: (message: string) => void },
  ask: () => Promise<LookupResult<T>>,
  render: (value: T, fetchedAt: Date, now: Date) => APIEmbed,
  failureText: (failure: Failure<T>, now: Date) => string,
): Promise<void> {
  await interaction.deferReply();
  let result: LookupResult<T>;
  try {
    result = await ask();
  } catch (error) {
    context.logError(`Looking up failed: ${errorText(error)}`);
    await removePlaceholderAndTell(interaction, lookupMessages.unavailable);
    return;
  }
  if (result.kind !== "found") {
    await removePlaceholderAndTell(interaction, failureText(result, context.now()));
    return;
  }

  try {
    const embed = render(result.value, result.fetchedAt, context.now());
    await interaction.editReply({ embeds: [embed], allowedMentions });
  } catch (error) {
    context.logError(`Showing the card failed: ${errorText(error)}`);
    await removePlaceholderAndTell(interaction, lookupMessages.unavailable);
  }
}

/** Answers /player: invalid input privately at once, otherwise a public card or the reason in private. */
export async function handlePlayer(interaction: LookupInteraction, context: LookupContext<"getPlayer">): Promise<void> {
  await answer("/player", context, async () => {
    const parsed = parseUid(interaction.options.getString("uid", true));
    if (!parsed.ok) {
      await replyPrivately(interaction, lookupMessages.invalidUid);
      return;
    }

    const uid = parsed.value;
    await showLookup(
      interaction,
      context,
      () => context.gameApi.getPlayer(uid),
      renderPlayerCard,
      (failure, now) => playerFailureText(failure, uid, now),
    );
  });
}

/** Answers /alliance: invalid input privately at once, otherwise a public card or the reason in private. */
export async function handleAlliance(
  interaction: LookupInteraction,
  context: LookupContext<"getAlliance">,
): Promise<void> {
  await answer("/alliance", context, async () => {
    const kingdom = parseKingdom(interaction.options.getInteger("kingdom", true));
    if (!kingdom.ok) {
      await replyPrivately(interaction, lookupMessages.invalidKingdom);
      return;
    }

    const key = parseAllianceKey(interaction.options.getString("alliance", true));
    if (!key.ok) {
      await replyPrivately(interaction, lookupMessages.invalidAlliance);
      return;
    }

    const kingdomNumber = kingdom.value;
    const allianceKey = key.value;
    await showLookup(
      interaction,
      context,
      () => context.gameApi.getAlliance(kingdomNumber, allianceKey),
      renderAllianceCard,
      (failure, now) => allianceFailureText(failure, kingdomNumber, allianceKey, now),
    );
  });
}
