import { MessageFlags, type InteractionReplyOptions, type InteractionUpdateOptions } from "discord.js";
import { parseAllianceKey, parseKingdom, parseUid, type AllianceKey, type KingdomNumber } from "../domain/lookup-input.js";
import {
  listedAllianceMatches,
  listedPlayerMatches,
  type LookupResult,
  type PickableAllianceMatch,
  type PickablePlayerMatch,
  type RosterEntry,
} from "../domain/player.js";
import { alliancePickLabel, lookupMessages, playerPickLabel, renderRosterComponents } from "./lookup-cards.js";
import {
  allianceCardMessage,
  allianceFailureMessage,
  allowedMentions,
  answer,
  errorText,
  playerCardMessage,
  playerFailureText,
  replyPrivately,
  showLookup,
  type CardMessage,
  type Failure,
  type LookupApi,
  type PlaceholderInteraction,
  type PrivateMessage,
} from "./lookup.js";
import { isOwner, pageOf, parseCustomId, type PickSession, type PickSessions } from "./pick-sessions.js";

/** The part of a discord.js component interaction (a button or a string select menu) that a pick list uses. */
export interface PickInteraction extends PlaceholderInteraction {
  readonly customId: string;
  readonly user: { readonly id: string };
  /** What a string select menu offers the Member picked; a button has none. */
  readonly values?: readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
  update(options: InteractionUpdateOptions): Promise<unknown>;
}

/** What the pick handler needs: the Game API lookups, the pick lists, and where to log a failure. */
export interface PickContext {
  readonly gameApi: Pick<LookupApi, "getPlayer" | "getAlliance">;
  readonly pickSessions: Pick<PickSessions, "get" | "open" | "turnPage">;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

const pickMessages = {
  notOwner: "Only the Member who ran this command can use this menu. Run /player or /alliance yourself.",
  expired: "This menu has expired. Run the command again.",
} as const;

/** The entry a select menu value picked, by its index in the list shown; undefined when no entry has that index. */
function pickedAt<T>(entries: readonly T[], value: string | undefined): T | undefined {
  return value === undefined ? undefined : entries[Number(value)];
}

/** The Kingdom and tag an Alliance match is looked up by. */
interface AllianceTarget {
  readonly kingdom: KingdomNumber;
  readonly key: AllianceKey;
}

/** The Kingdom and tag an Alliance match is looked up by; undefined when the Game gave values that are not valid. */
function allianceToLookUp(match: PickableAllianceMatch): AllianceTarget | undefined {
  const key = parseAllianceKey(match.tag);
  const kingdom = parseKingdom(match.kingdom);
  return key.ok && kingdom.ok ? { kingdom: kingdom.value, key: key.value } : undefined;
}

/** Privately tells the caller a follow-up; the public card is the only message the others see. */
async function followUpPrivately(interaction: PickInteraction, message: PrivateMessage): Promise<void> {
  await interaction.followUp({ ...message, flags: MessageFlags.Ephemeral, allowedMentions });
}

/** The private menu now says what is shown, without its menu; the Game API is asked after this, so Discord's limit holds. */
async function showPicked(interaction: PickInteraction, label: string): Promise<void> {
  await interaction.update({ content: lookupMessages.showing(label), components: [], allowedMentions });
}

/**
 * Answers a pick from a pick list once the menu says what is shown: a card is posted publicly as a follow-up, the
 * reason privately. A lookup that throws is logged and told as unavailable.
 */
async function answerPick<T>(
  interaction: PickInteraction,
  context: PickContext,
  ask: () => Promise<LookupResult<T>>,
  card: (value: T, fetchedAt: Date, now: Date) => CardMessage,
  failureMessage: (failure: Failure<T>, now: Date) => PrivateMessage,
): Promise<void> {
  let result: LookupResult<T>;
  try {
    result = await ask();
  } catch (error) {
    context.logError(`Looking up the picked match failed: ${errorText(error)}`);
    await followUpPrivately(interaction, { content: lookupMessages.unavailable });
    return;
  }
  if (result.kind !== "found") {
    await followUpPrivately(interaction, failureMessage(result, context.now()));
    return;
  }
  await interaction.followUp({ ...card(result.value, result.fetchedAt, context.now()), allowedMentions });
}

/** The owner picked a Player match: the Player's card is posted publicly, looked up by uid for the lookup. */
async function pickPlayerMatch(
  interaction: PickInteraction,
  match: PickablePlayerMatch | undefined,
  context: PickContext,
): Promise<void> {
  const parsedUid = match === undefined ? undefined : parseUid(match.uid);
  if (match === undefined || parsedUid === undefined || !parsedUid.ok) {
    await replyPrivately(interaction, lookupMessages.unavailable);
    return;
  }

  await showPicked(interaction, playerPickLabel(match));
  const uid = parsedUid.value;
  await answerPick(
    interaction,
    context,
    () => context.gameApi.getPlayer(uid, "lookup"),
    playerCardMessage,
    (failure, now) => ({ content: playerFailureText(failure, uid, now) }),
  );
}

/**
 * The owner picked an Alliance match: its card is posted publicly with its roster menu, looked up by tag and Kingdom.
 * An ambiguous answer opens a pick list for the owner, as the command does.
 */
async function pickAllianceMatch(
  interaction: PickInteraction,
  match: PickableAllianceMatch | undefined,
  context: PickContext,
): Promise<void> {
  const target = match === undefined ? undefined : allianceToLookUp(match);
  if (match === undefined || target === undefined) {
    await replyPrivately(interaction, lookupMessages.unavailable);
    return;
  }

  await showPicked(interaction, alliancePickLabel(match));
  const { kingdom, key } = target;
  const ownerId = interaction.user.id;
  await answerPick(
    interaction,
    context,
    () => context.gameApi.getAlliance(kingdom, key, "lookup"),
    (alliance, fetchedAt, now) => allianceCardMessage(alliance, fetchedAt, now, ownerId, context.pickSessions),
    (failure, now) =>
      allianceFailureMessage(
        failure,
        key,
        lookupMessages.allianceNotFound(key, kingdom),
        ownerId,
        context.pickSessions,
        now,
      ),
  );
}

/**
 * The owner picked a member of the roster menu's page: the member's Player card is posted publicly as a reply under
 * the thinking placeholder, and the Alliance card stays as it is.
 */
async function pickRosterMember(
  interaction: PickInteraction,
  shownEntries: readonly RosterEntry[],
  value: string | undefined,
  context: PickContext,
): Promise<void> {
  const entry = pickedAt(shownEntries, value);
  if (entry === undefined) {
    await replyPrivately(interaction, lookupMessages.unavailable);
    return;
  }

  await showLookup(
    interaction,
    context,
    () => context.gameApi.getPlayer(entry.uid, "lookup"),
    playerCardMessage,
    (failure, now) => ({ content: playerFailureText(failure, entry.uid, now) }),
  );
}

/** Answers a select menu of a pick list: the match or roster member the value names, by the kind of pick list. */
async function pickFrom(interaction: PickInteraction, session: PickSession, context: PickContext): Promise<void> {
  const value = interaction.values?.[0];
  const { choice } = session;
  switch (choice.kind) {
    case "players":
      await pickPlayerMatch(interaction, pickedAt(listedPlayerMatches(choice.matches).listed, value), context);
      return;
    case "alliances":
      await pickAllianceMatch(interaction, pickedAt(listedAllianceMatches(choice.matches).listed, value), context);
      return;
    case "roster":
      await pickRosterMember(interaction, pageOf(choice.entries, session.page), value, context);
      return;
  }
}

/** Turns a roster menu to a page: the menu of that page replaces the old one; the Game API is not asked. */
async function turnRosterPage(
  interaction: PickInteraction,
  session: PickSession,
  page: number,
  context: PickContext,
): Promise<void> {
  const { choice } = session;
  if (choice.kind !== "roster") {
    await replyPrivately(interaction, lookupMessages.unavailable);
    return;
  }
  context.pickSessions.turnPage(session.id, page);
  await interaction.update({ components: renderRosterComponents(choice.entries, page, session.id) });
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
      await turnRosterPage(interaction, session, parsed.page, context);
      return;
    }
    await pickFrom(interaction, session, context);
  });
}
