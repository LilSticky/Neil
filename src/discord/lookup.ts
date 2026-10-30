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
  parsePlayerName,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type ParseResult,
  type PlayerName,
  type Uid,
} from "../domain/lookup-input.js";
import { listedPlayerMatches, type Alliance, type LookupResult, type Match, type Player } from "../domain/player.js";
import { lookupMessages, renderAllianceCard, renderPlayerCard, renderPlayerPickList } from "./lookup-cards.js";
import type { PickSessions } from "./pick-sessions.js";

/** The part of the Game API client the lookup commands use. */
export type LookupApi = Pick<GameApiClient, "getPlayer" | "findPlayer" | "getAlliance">;

/** The part of a discord.js chat-input interaction that /player and /alliance use. */
export interface LookupInteraction {
  readonly user: { readonly id: string };
  readonly options: {
    getString(name: string, required?: false): string | null;
    getInteger(name: string, required?: false): number | null;
  };
  reply(options: InteractionReplyOptions): Promise<unknown>;
  deferReply(): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  deleteReply(): Promise<unknown>;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
}

/** What one command needs: its own Game API methods, the pick lists it may open, and where to log a failure. */
export interface LookupContext<Method extends keyof LookupApi> {
  readonly gameApi: Pick<LookupApi, Method>;
  readonly pickSessions: Pick<PickSessions, "open">;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/** A private message: its text and, for a pick list, its select menu. */
type PrivateMessage = Pick<InteractionReplyOptions, "content" | "components">;

/** Lookups never mention anyone, whatever the Game API or the Member typed. */
export const allowedMentions: MessageMentionOptions = { parse: [] };

/** Every result that gives no card. */
type Failure<T> = Exclude<LookupResult<T>, { readonly kind: "found" }>;

/** The texts every Player lookup shares: the quota, a busy tracker and a broken lookup. */
function sharedPlayerFailureText(
  failure: Exclude<Failure<Player>, { readonly kind: "not-found" | "not-prepared" }>,
  now: Date,
): string {
  switch (failure.kind) {
    case "quota-spent":
    case "reserve-kept":
      return lookupMessages.quotaSpent(failure.resetsAt, now);
    case "try-again":
      return lookupMessages.tryAgain;
    case "unavailable":
    case "ambiguous":
      // A Player lookup never gives "ambiguous" by uid; if it ever did, the honest answer is a broken lookup.
      return lookupMessages.unavailable;
  }
}

/** The private text for a Player looked up by uid that gave no card. */
export function playerFailureText(failure: Failure<Player>, uid: Uid, now: Date): string {
  switch (failure.kind) {
    case "not-found":
      return lookupMessages.playerNotFound(uid);
    case "not-prepared":
      // The tracker's answer for an unknown uid, but also for its own trouble (research R11).
      return lookupMessages.playerNotPrepared(uid);
    default:
      return sharedPlayerFailureText(failure, now);
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

/** The private pick list for an ambiguous Player name, opened for the caller; with nothing to pick, a broken lookup. */
function playerPickList(
  matches: readonly Match[],
  name: PlayerName,
  ownerId: string,
  pickSessions: Pick<PickSessions, "open">,
  now: Date,
): PrivateMessage {
  const { listed } = listedPlayerMatches(matches);
  if (listed.length === 0) return { content: lookupMessages.unavailable };
  const sessionId = pickSessions.open(ownerId, { kind: "players", matches: listed }, now);
  return renderPlayerPickList(name, matches, sessionId);
}

/** The private answer to a Player name that gave no card; an ambiguous name becomes a pick list. */
function playerNameFailureMessage(
  failure: Failure<Player>,
  name: PlayerName,
  kingdom: KingdomNumber | undefined,
  ownerId: string,
  pickSessions: Pick<PickSessions, "open">,
  now: Date,
): PrivateMessage {
  switch (failure.kind) {
    case "ambiguous":
      return playerPickList(failure.matches, name, ownerId, pickSessions, now);
    case "not-found":
      return { content: lookupMessages.playerNameNotFound(name, kingdom) };
    case "not-prepared":
      return { content: lookupMessages.playerNameNotPrepared(name) };
    default:
      return { content: sharedPlayerFailureText(failure, now) };
  }
}

/** The text of a thrown value, for a log line. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Keeps a failed Discord call from escaping the handler; the failure is logged instead. */
export async function answer(
  command: string,
  context: { readonly logError: (message: string) => void },
  respond: () => Promise<void>,
): Promise<void> {
  try {
    await respond();
  } catch (error) {
    context.logError(`Answering ${command} failed: ${errorText(error)}`);
  }
}

/** Invalid input is answered privately at once, before any Game API call. */
export async function replyPrivately(
  interaction: { reply(options: InteractionReplyOptions): Promise<unknown> },
  content: string,
): Promise<void> {
  await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions });
}

/** Removes the thinking placeholder and tells the caller the message privately. */
async function removePlaceholderAndTell(interaction: LookupInteraction, message: PrivateMessage): Promise<void> {
  await interaction.deleteReply();
  await interaction.followUp({ ...message, flags: MessageFlags.Ephemeral, allowedMentions });
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
  failureMessage: (failure: Failure<T>, now: Date) => PrivateMessage,
): Promise<void> {
  await interaction.deferReply();
  let result: LookupResult<T>;
  try {
    result = await ask();
  } catch (error) {
    context.logError(`Looking up failed: ${errorText(error)}`);
    await removePlaceholderAndTell(interaction, { content: lookupMessages.unavailable });
    return;
  }
  if (result.kind !== "found") {
    await removePlaceholderAndTell(interaction, failureMessage(result, context.now()));
    return;
  }

  try {
    const embed = render(result.value, result.fetchedAt, context.now());
    await interaction.editReply({ embeds: [embed], allowedMentions });
  } catch (error) {
    context.logError(`Showing the card failed: ${errorText(error)}`);
    await removePlaceholderAndTell(interaction, { content: lookupMessages.unavailable });
  }
}

/** A Kingdom option that must be there: a missing or invalid one is invalid input. */
function parseKingdomOption(value: number | null): ParseResult<KingdomNumber> {
  return value === null ? { ok: false } : parseKingdom(value);
}

/** A Kingdom option that may be left out: none is valid, an invalid one is not. */
function parseOptionalKingdom(value: number | null): ParseResult<KingdomNumber | undefined> {
  if (value === null) return { ok: true, value: undefined };
  const parsed = parseKingdom(value);
  return parsed.ok ? parsed : { ok: false };
}

async function lookUpPlayerByUid(
  interaction: LookupInteraction,
  context: LookupContext<"getPlayer" | "findPlayer">,
  text: string,
): Promise<void> {
  const parsed = parseUid(text);
  if (!parsed.ok) {
    await replyPrivately(interaction, lookupMessages.invalidUid);
    return;
  }

  const uid = parsed.value;
  await showLookup(
    interaction,
    context,
    () => context.gameApi.getPlayer(uid, "lookup"),
    renderPlayerCard,
    (failure, now) => ({ content: playerFailureText(failure, uid, now) }),
  );
}

async function lookUpPlayerByName(
  interaction: LookupInteraction,
  context: LookupContext<"getPlayer" | "findPlayer">,
  text: string,
): Promise<void> {
  const name = parsePlayerName(text);
  if (!name.ok) {
    await replyPrivately(interaction, lookupMessages.invalidPlayerName);
    return;
  }
  const kingdom = parseOptionalKingdom(interaction.options.getInteger("kingdom"));
  if (!kingdom.ok) {
    await replyPrivately(interaction, lookupMessages.invalidKingdom);
    return;
  }

  const playerName = name.value;
  const playerKingdom = kingdom.value;
  await showLookup(
    interaction,
    context,
    () => context.gameApi.findPlayer(playerName, playerKingdom, "lookup"),
    renderPlayerCard,
    (failure, now) =>
      playerNameFailureMessage(failure, playerName, playerKingdom, interaction.user.id, context.pickSessions, now),
  );
}

/**
 * Answers /player: a uid or a name (with an optional Kingdom), never both. Invalid input is answered privately at
 * once; otherwise a public card, a private pick list for an ambiguous name, or the reason in private.
 */
export async function handlePlayer(
  interaction: LookupInteraction,
  context: LookupContext<"getPlayer" | "findPlayer">,
): Promise<void> {
  await answer("/player", context, async () => {
    const uidText = interaction.options.getString("uid");
    const nameText = interaction.options.getString("name");
    if (uidText !== null && nameText === null) {
      await lookUpPlayerByUid(interaction, context, uidText);
      return;
    }
    if (uidText === null && nameText !== null) {
      await lookUpPlayerByName(interaction, context, nameText);
      return;
    }
    await replyPrivately(interaction, lookupMessages.giveUidOrName);
  });
}

/** Answers /alliance: invalid input privately at once, otherwise a public card or the reason in private. */
export async function handleAlliance(
  interaction: LookupInteraction,
  context: LookupContext<"getAlliance">,
): Promise<void> {
  await answer("/alliance", context, async () => {
    const kingdom = parseKingdomOption(interaction.options.getInteger("kingdom"));
    if (!kingdom.ok) {
      await replyPrivately(interaction, lookupMessages.invalidKingdom);
      return;
    }

    const keyText = interaction.options.getString("alliance");
    const key = keyText === null ? { ok: false as const } : parseAllianceKey(keyText);
    if (!key.ok) {
      await replyPrivately(interaction, lookupMessages.invalidAlliance);
      return;
    }

    const kingdomNumber = kingdom.value;
    const allianceKey = key.value;
    await showLookup(
      interaction,
      context,
      () => context.gameApi.getAlliance(kingdomNumber, allianceKey, "lookup"),
      renderAllianceCard,
      (failure, now) => ({ content: allianceFailureText(failure, kingdomNumber, allianceKey, now) }),
    );
  });
}
