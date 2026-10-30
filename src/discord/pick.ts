import {
  MessageFlags,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";
import { parseUid } from "../domain/lookup-input.js";
import { listedPlayerMatches, type LookupResult, type Match, type PickablePlayerMatch, type Player } from "../domain/player.js";
import { lookupMessages, playerPickLabel, renderPlayerCard } from "./lookup-cards.js";
import {
  allowedMentions,
  answer,
  errorText,
  playerFailureText,
  replyPrivately,
  type LookupApi,
} from "./lookup.js";
import { isOwner, parseCustomId, type PickSession, type PickSessions } from "./pick-sessions.js";

/** The part of a discord.js component interaction (a button or a string select menu) that a pick list uses. */
export interface PickInteraction {
  readonly customId: string;
  readonly user: { readonly id: string };
  /** What a string select menu offers the Member picked; a button has none. */
  readonly values?: readonly string[];
  deferUpdate(): Promise<unknown>;
  reply(options: InteractionReplyOptions): Promise<unknown>;
  update(options: InteractionUpdateOptions): Promise<unknown>;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
}

/** What the pick handler needs: the Player lookup, the open pick lists, and where to log a failure. */
export interface PickContext {
  readonly gameApi: Pick<LookupApi, "getPlayer">;
  readonly pickSessions: Pick<PickSessions, "get">;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

const pickMessages = {
  notOwner: "Only the Member who ran this command can use this menu. Run /player or /alliance yourself.",
  expired: "This menu has expired. Run the command again.",
} as const;

/** The Player match the Member picked from the list, found by its index in the list the pick list showed. */
function pickedPlayer(matches: readonly Match[], value: string | undefined): PickablePlayerMatch | undefined {
  if (value === undefined) return undefined;
  return listedPlayerMatches(matches).listed[Number(value)];
}

/** Privately tells the caller a follow-up; the public card is the only message the others see. */
async function followUpPrivately(interaction: PickInteraction, content: string): Promise<void> {
  await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions });
}

/**
 * The owner's pick: the private menu is updated first, so Discord's three-second limit is met before the Game API
 * is asked; then the Player's card is posted publicly, or the reason is told privately.
 */
async function pickPlayer(interaction: PickInteraction, session: PickSession, context: PickContext): Promise<void> {
  const { choice } = session;
  const match = choice.kind === "players" ? pickedPlayer(choice.matches, interaction.values?.[0]) : undefined;
  const parsedUid = match === undefined ? undefined : parseUid(match.uid);
  if (match === undefined || parsedUid === undefined || !parsedUid.ok) {
    await replyPrivately(interaction, lookupMessages.unavailable);
    return;
  }

  await interaction.update({
    content: lookupMessages.showing(playerPickLabel(match)),
    components: [],
    allowedMentions,
  });

  const uid = parsedUid.value;
  let result: LookupResult<Player>;
  try {
    result = await context.gameApi.getPlayer(uid, "lookup");
  } catch (error) {
    context.logError(`Looking up the picked player failed: ${errorText(error)}`);
    await followUpPrivately(interaction, lookupMessages.unavailable);
    return;
  }

  if (result.kind !== "found") {
    await followUpPrivately(interaction, playerFailureText(result, uid, context.now()));
    return;
  }
  const embed = renderPlayerCard(result.value, result.fetchedAt, context.now());
  await interaction.followUp({ embeds: [embed], allowedMentions });
}

/** Answers a button or select menu of a pick list: only its owner, only while it is open, the rest privately. */
export async function handlePick(interaction: PickInteraction, context: PickContext): Promise<void> {
  await answer("a pick list", context, async () => {
    const parsed = parseCustomId(interaction.customId);
    const session = parsed === undefined ? "expired" : context.pickSessions.get(parsed.sessionId, context.now());
    if (parsed === undefined || session === "expired") {
      await replyPrivately(interaction, pickMessages.expired);
      return;
    }
    if (!isOwner(session, interaction.user.id)) {
      await replyPrivately(interaction, pickMessages.notOwner);
      return;
    }
    if (parsed.action === "page") {
      // Page turns belong to the roster menu (a later task); acknowledging keeps Discord from showing a failure.
      await interaction.deferUpdate();
      return;
    }
    await pickPlayer(interaction, session, context);
  });
}
