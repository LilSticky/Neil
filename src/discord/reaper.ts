import {
  MessageFlags,
  type InteractionDeferReplyOptions,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from "discord.js";
import { exileReasonOf, mayChangeReaper, type Editor, type Exile, type ExileReason } from "../domain/exile.js";
import { parsePlayerName, type KingdomNumber, type PlayerName } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { listedPlayerMatches, type LookupResult, type Player } from "../domain/player.js";
import type { ReaperStore } from "../storage/reaper-store.js";
import {
  answer,
  allowedMentions,
  errorText,
  parseOptionalKingdom,
  replyPrivately,
  sharedPlayerFailureText,
  type Failure,
  type LookupApi,
  type PrivateMessage,
} from "./lookup.js";
import { escapeText, lookupMessages, renderPlayerPickList } from "./lookup-cards.js";
import type { OnboardingChannels } from "./onboarding-channels.js";
import type { PickSessions } from "./pick-sessions.js";
import { reaperMessages } from "./reaper-texts.js";

/** What storing an Exile needs: REAPER, the log channel, the clock and the error log. */
export interface ReaperRecordContext {
  readonly reaper: Pick<ReaperStore, "find" | "add">;
  readonly channels: Pick<OnboardingChannels, "log">;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/** What /reaper add needs on top of storing: the Editor check, the Game API name lookup and the pick lists it may open. */
export interface ReaperAddContext extends ReaperRecordContext {
  readonly editorOf: (memberId: MemberId) => Editor | undefined;
  readonly homeKingdom: KingdomNumber;
  readonly gameApi: Pick<LookupApi, "findPlayer">;
  readonly pickSessions: Pick<PickSessions, "open">;
}

/** The part of a discord.js chat-input interaction of /reaper that add uses. */
export interface ReaperInteraction {
  readonly user: { readonly id: string };
  readonly options: {
    getString(name: string, required?: false): string | null;
    getInteger(name: string, required?: false): number | null;
  };
  deferReply(options?: InteractionDeferReplyOptions): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** The Exile a found Player makes: its position when the Game read one, the reason and the adder. */
function exileOf(player: Player, fetchedAt: Date, reason: ExileReason, adderId: MemberId, addedAt: Date): Exile {
  const location = player.details?.location;
  return {
    uid: player.uid,
    name: player.name,
    kingdom: player.kingdom,
    position: location === undefined ? undefined : { x: location.x, y: location.y },
    positionAt: location === undefined ? undefined : fetchedAt,
    reason,
    addedAt,
    addedBy: adderId,
  };
}

/** The Alliance as the confirmation shows it: "[TAG]", or "no alliance" for a Player with none. */
function allianceText(player: Player): string {
  return player.alliance === undefined ? "no alliance" : `[${escapeText(player.alliance.tag)}]`;
}

/**
 * Stores a found Player as an Exile and logs the addition. Returns the private answer: the confirmation, or the stored
 * reason when the Player already is an Exile, in which case nothing is changed or logged. The check and the store run
 * without an await between them, so no other write can come in between.
 */
export async function recordFoundExile(
  player: Player,
  fetchedAt: Date,
  reason: ExileReason,
  adderId: MemberId,
  context: ReaperRecordContext,
): Promise<string> {
  const existing = context.reaper.find(player.uid);
  if (existing !== undefined) return reaperMessages.alreadyExile(existing.name, existing.reason);

  const exile = exileOf(player, fetchedAt, reason, adderId, context.now());
  context.reaper.add(exile);
  const logged = reaperMessages.addLog(player.name, player.uid, player.kingdom, adderId, reason);
  await answer("the log line of a REAPER change", context, () => context.channels.log({ content: logged }));
  return reaperMessages.added(player.name, player.kingdom, allianceText(player));
}

/** The private pick list for an ambiguous name of /reaper add, which carries the reason to the pick. */
function exilePickList(
  result: Extract<Failure<Player>, { readonly kind: "ambiguous" }>,
  name: PlayerName,
  adderId: MemberId,
  reason: ExileReason,
  context: ReaperAddContext,
): PrivateMessage {
  const { listed } = listedPlayerMatches(result.matches);
  if (listed.length === 0) return { content: lookupMessages.unavailable };
  const sessionId = context.pickSessions.open(adderId, { kind: "exile", matches: result.matches, reason }, context.now());
  return renderPlayerPickList(name, result.matches, sessionId);
}

/** The private answer to a name of /reaper add that gave no Player: a pick list when ambiguous, else the reason. */
function nameFailureMessage(
  failure: Failure<Player>,
  name: PlayerName,
  kingdom: KingdomNumber | undefined,
  adderId: MemberId,
  reason: ExileReason,
  context: ReaperAddContext,
): PrivateMessage {
  switch (failure.kind) {
    case "ambiguous":
      return exilePickList(failure, name, adderId, reason, context);
    case "not-found":
      return { content: lookupMessages.playerNameNotFound(name, kingdom) };
    case "not-prepared":
      return { content: lookupMessages.playerNameNotPrepared(name) };
    default:
      return { content: sharedPlayerFailureText(failure, context.now()) };
  }
}

/** Looks the name up for /reaper add; a refused or broken lookup is logged and told as unavailable. */
async function findNamed(
  name: PlayerName,
  kingdom: KingdomNumber | undefined,
  context: ReaperAddContext,
): Promise<LookupResult<Player> | undefined> {
  try {
    return await context.gameApi.findPlayer(name, kingdom, "lookup");
  } catch (error) {
    context.logError(`Looking up the name for REAPER failed: ${errorText(error)}`);
    return undefined;
  }
}

/** Answers /reaper add: only Home Kingdom R5s, the reason and the name checked before any Game API request. */
export async function handleReaperAdd(interaction: ReaperInteraction, context: ReaperAddContext): Promise<void> {
  await answer("/reaper add", context, async () => {
    const editor = context.editorOf(interaction.user.id);
    if (editor === undefined || !mayChangeReaper(editor, context.homeKingdom)) {
      await replyPrivately(interaction, reaperMessages.refused);
      return;
    }
    const reason = exileReasonOf(interaction.options.getString("reason") ?? "");
    if (!reason.ok) {
      await replyPrivately(interaction, reaperMessages.invalidReason);
      return;
    }
    const name = parsePlayerName(interaction.options.getString("name") ?? "");
    if (!name.ok) {
      await replyPrivately(interaction, lookupMessages.invalidPlayerName);
      return;
    }
    const kingdom = parseOptionalKingdom(interaction.options.getInteger("kingdom"));
    if (!kingdom.ok) {
      await replyPrivately(interaction, lookupMessages.invalidKingdom);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await findNamed(name.value, kingdom.value, context);
    if (result === undefined) {
      await interaction.editReply({ content: lookupMessages.unavailable, allowedMentions });
      return;
    }
    if (result.kind === "found") {
      const content = await recordFoundExile(result.value, result.fetchedAt, reason.value, interaction.user.id, context);
      await interaction.editReply({ content, allowedMentions });
      return;
    }
    const answerText = nameFailureMessage(result, name.value, kingdom.value, interaction.user.id, reason.value, context);
    await interaction.editReply({ ...answerText, allowedMentions });
  });
}
