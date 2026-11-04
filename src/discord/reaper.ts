import {
  MessageFlags,
  type InteractionDeferReplyOptions,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";
import {
  exileReasonOf,
  mayChangeReaper,
  rankExiles,
  type Editor,
  type Exile,
  type ExileCandidate,
  type ExileRanking,
  type ExileReason,
  type Position,
  type RankedExile,
} from "../domain/exile.js";
import { parsePlayerName, type KingdomNumber, type PlayerName, type Uid } from "../domain/lookup-input.js";
import type { MemberId } from "../domain/rank-approval.js";
import { listedPlayerMatches, type LookupResult, type Player } from "../domain/player.js";
import type { LinkStore } from "../storage/link-store.js";
import type { ExileRead, ReaperStore } from "../storage/reaper-store.js";
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
import { closestAnswer, CLOSEST_PAGE_SIZE, LIST_PAGE_SIZE, listAnswer, type ReaperAnswer } from "./reaper-cards.js";
import {
  isOwner,
  parseReaperCustomId,
  reaperPageCount,
  type ReaperPageContent,
  type ReaperPages,
} from "./reaper-pages.js";
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
    getBoolean(name: string, required?: false): boolean | null;
  };
  deferReply(options?: InteractionDeferReplyOptions): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** The part of a discord.js button press under a paged /reaper answer that the page handler uses. */
export interface ReaperPageInteraction {
  readonly customId: string;
  readonly user: { readonly id: string };
  reply(options: InteractionReplyOptions): Promise<unknown>;
  update(options: InteractionUpdateOptions): Promise<unknown>;
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

/** How many Exiles are read from the Game API at once. */
const READS_AT_ONCE = 4;
/** The Daily Quota or the Quota Reserve kept a read from the Game API. */
type QuotaRefusal = Extract<LookupResult<Player>, { readonly kind: "quota-spent" | "reserve-kept" }>;

/** A Player read from the Game API this time, and when it was read. */
export interface FreshRead {
  readonly player: Player;
  readonly fetchedAt: Date;
}

/** The ranking behind /reaper closest: closest first, the reads made to rank it, the Exiles left out, and the refusal that stopped the reads, if any. */
export interface ClosestRanking {
  readonly origin: Position;
  readonly kingdom: KingdomNumber;
  readonly ranking: readonly RankedExile[];
  readonly reads: ReadonlyMap<Uid, FreshRead>;
  readonly leftOut: ExileRanking["leftOut"];
  readonly refusal: QuotaRefusal | undefined;
}

/** What /reaper closest needs: the caller's Link, the Game API, REAPER, the paged answers, the Home Kingdom, the clock and the error log. */
export interface ReaperClosestContext {
  readonly links: Pick<LinkStore, "linkFor">;
  readonly gameApi: Pick<LookupApi, "getPlayer">;
  readonly reaper: Pick<ReaperStore, "inKingdom" | "refresh">;
  readonly pages: Pick<ReaperPages<ReaperPageContent>, "open">;
  readonly homeKingdom: KingdomNumber;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
}

/** What /reaper list needs: REAPER, the paged answers and the clock. */
export interface ReaperListContext {
  readonly reaper: Pick<ReaperStore, "all">;
  readonly pages: Pick<ReaperPages<ReaperPageContent>, "open">;
  readonly now: () => Date;
}

/** What a page button of /reaper needs: the paged answers and the clock the press is answered at. */
export interface ReaperPageContext {
  readonly pages: Pick<ReaperPages<ReaperPageContent>, "get">;
  readonly now: () => Date;
}

/** Reads one Player with the lookup purpose; a read that throws is logged and told as unavailable. */
async function readPlayer(
  uid: Uid,
  context: Pick<ReaperClosestContext, "gameApi" | "logError">,
): Promise<LookupResult<Player>> {
  try {
    return await context.gameApi.getPlayer(uid, "lookup");
  } catch (error) {
    context.logError(`Reading an Exile for REAPER failed: ${errorText(error)}`);
    return { kind: "unavailable", reason: "unexpected" };
  }
}

/** The position of a Player as the Game read it, or undefined when it gave none. */
function positionOf(player: Player): Position | undefined {
  const location = player.details?.location;
  return location === undefined ? undefined : { x: location.x, y: location.y };
}

/** The REAPER row a fresh read of a Player leaves behind. */
function refreshOf(player: Player, fetchedAt: Date): ExileRead {
  return { name: player.name, kingdom: player.kingdom, position: positionOf(player), readAt: fetchedAt };
}

/**
 * Reads the Exiles at most READS_AT_ONCE at a time, from one shared queue. A found read refreshes its row; a quota
 * refusal stops the queue, so the Exiles not yet read keep their stored positions.
 */
async function readExiles(
  exiles: readonly Exile[],
  context: Pick<ReaperClosestContext, "gameApi" | "reaper" | "logError">,
): Promise<{ readonly reads: Map<Uid, FreshRead>; readonly refusal: QuotaRefusal | undefined }> {
  const queue = exiles.values();
  const reads = new Map<Uid, FreshRead>();
  const state: { refusal: QuotaRefusal | undefined } = { refusal: undefined };

  const worker = async (): Promise<void> => {
    while (state.refusal === undefined) {
      const next = queue.next();
      if (next.done === true) return;
      const { uid } = next.value;
      const result = await readPlayer(uid, context);
      if (result.kind === "found") {
        reads.set(uid, { player: result.value, fetchedAt: result.fetchedAt });
        context.reaper.refresh(uid, refreshOf(result.value, result.fetchedAt));
      } else if (result.kind === "quota-spent" || result.kind === "reserve-kept") {
        state.refusal = result;
      }
    }
  };

  await Promise.all(Array.from({ length: READS_AT_ONCE }, worker));
  return { reads, refusal: state.refusal };
}

/**
 * Builds the ranking for /reaper closest without rendering it: the Exiles of one Kingdom read through the Game API,
 * ranked by distance from the origin. The caller's own Exile (when the caller has a Link) is left out.
 */
export async function rankClosest(
  origin: Position,
  kingdom: KingdomNumber,
  callerUid: Uid | undefined,
  context: Pick<ReaperClosestContext, "gameApi" | "reaper" | "logError">,
): Promise<ClosestRanking> {
  const exiles = context.reaper.inKingdom(kingdom);
  const { reads, refusal } = await readExiles(exiles, context);
  const candidates: ExileCandidate[] = exiles.map((exile) => ({ exile, player: reads.get(exile.uid)?.player }));
  const { ranking, leftOut } = rankExiles(origin, kingdom, callerUid, candidates);
  return { origin, kingdom, ranking, reads, leftOut, refusal };
}

/** Where /reaper closest measures from, in which Kingdom, and the caller's uid when the caller has a Link. */
interface ClosestOrigin {
  readonly origin: Position;
  readonly kingdom: KingdomNumber;
  readonly callerUid: Uid | undefined;
}

/**
 * x and y win over the Linked Player's position. Without a Link the Kingdom is the Home Kingdom, and so it is when the
 * Linked Player cannot be read but x and y are given; a caller with no Link and no x and y, or whose Linked Player
 * cannot be read and who gives no x and y, has no origin.
 */
async function closestOriginOf(
  given: Position | undefined,
  memberId: MemberId,
  context: ReaperClosestContext,
): Promise<ClosestOrigin | undefined> {
  const link = context.links.linkFor(memberId);
  if (link === undefined) {
    return given === undefined ? undefined : { origin: given, kingdom: context.homeKingdom, callerUid: undefined };
  }
  const caller = await readPlayer(link.uid, context);
  if (caller.kind !== "found") {
    return given === undefined ? undefined : { origin: given, kingdom: context.homeKingdom, callerUid: link.uid };
  }
  const origin = given ?? positionOf(caller.value);
  return origin === undefined ? undefined : { origin, kingdom: caller.value.kingdom, callerUid: link.uid };
}

/** Answers /reaper closest, privately. Mismatched coordinates are refused before any Game API request. With all, the answer is paged. */
export async function handleReaperClosest(interaction: ReaperInteraction, context: ReaperClosestContext): Promise<void> {
  await answer("/reaper closest", context, async () => {
    const x = interaction.options.getInteger("x");
    const y = interaction.options.getInteger("y");
    if ((x === null) !== (y === null)) {
      await replyPrivately(interaction, reaperMessages.bothXAndY);
      return;
    }
    const given = x === null || y === null ? undefined : { x, y };
    const all = interaction.options.getBoolean("all") === true;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const closestFrom = await closestOriginOf(given, interaction.user.id, context);
    if (closestFrom === undefined) {
      await interaction.editReply({ content: reaperMessages.askXAndY, allowedMentions });
      return;
    }
    const ranking = await rankClosest(closestFrom.origin, closestFrom.kingdom, closestFrom.callerUid, context);
    const now = context.now();
    const paged = all && reaperPageCount(ranking.ranking.length, CLOSEST_PAGE_SIZE) > 1;
    const sessionId = paged ? context.pages.open(interaction.user.id, { kind: "closest", ranking }, now) : undefined;
    await interaction.editReply(closestAnswer(ranking, now, 0, sessionId));
  });
}

/** Answers /reaper list, privately: every Exile of REAPER, newest first, 8 per page. */
export async function handleReaperList(interaction: ReaperInteraction, context: ReaperListContext): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const exiles = context.reaper.all();
  if (exiles.length === 0) {
    await interaction.editReply({ content: reaperMessages.empty, allowedMentions });
    return;
  }
  const paged = reaperPageCount(exiles.length, LIST_PAGE_SIZE) > 1;
  const sessionId = paged ? context.pages.open(interaction.user.id, { kind: "list", exiles }, context.now()) : undefined;
  await interaction.editReply(listAnswer(exiles, 0, sessionId));
}

/**
 * Answers a page button of /reaper: only the Member who ran the answer may turn it, while it is open, and the page is
 * redrawn from what was answered, with no Game API call.
 */
export async function handleReaperPage(interaction: ReaperPageInteraction, context: ReaperPageContext): Promise<void> {
  const parsed = parseReaperCustomId(interaction.customId);
  const session = parsed === undefined ? "expired" : context.pages.get(parsed.sessionId, context.now());
  if (parsed === undefined || session === "expired") {
    await replyPrivately(interaction, reaperMessages.pageExpired);
    return;
  }
  if (!isOwner(session, interaction.user.id)) {
    await replyPrivately(interaction, reaperMessages.pageNotYours);
    return;
  }
  const { content } = session;
  const redraw: ReaperAnswer =
    content.kind === "closest"
      ? closestAnswer(content.ranking, context.now(), parsed.page, parsed.sessionId)
      : listAnswer(content.exiles, parsed.page, parsed.sessionId);
  await interaction.update(redraw);
}
