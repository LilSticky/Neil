import { MessageFlags, type InteractionEditReplyOptions, type InteractionReplyOptions } from "discord.js";
import type { Position } from "../domain/exile.js";
import { parseAllianceKey, parseKingdom, parseUid, type AllianceKey, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { LookupCaller } from "../game-api/allowance-keeper.js";
import type { ChargedResult } from "../game-api/client.js";
import type { LinkStore } from "../storage/link-store.js";
import type { ReaperStore } from "../storage/reaper-store.js";
import {
  allianceCardMessage,
  napStatusFor,
  type NapStatusOf,
  allianceFailureMessage,
  allowedMentions,
  answer,
  callerOf,
  errorText,
  playerCardMessage,
  playerFailureText,
  replyPrivately,
  withCallerUsage,
  type CardMessage,
  type Failure,
  type LookupApi,
  type PrivateMessage,
} from "./lookup.js";
import { lookupMessages } from "./lookup-cards.js";
import { openOverviewSession } from "./pick.js";
import type { PickSessions } from "./pick-sessions.js";
import { renderOverview } from "./overview-texts.js";
import { closestAnswer, type ReaperAnswer } from "./reaper-cards.js";
import { closestSessionOf, rankClosestFor } from "./reaper.js";
import type { ReaperPageContent, ReaperPages } from "./reaper-pages.js";
import { refusalMessage } from "./usage-texts.js";

/** The part of a discord.js button press under a card that the Look again button reads and answers. */
export interface LookAgainInteraction {
  readonly customId: string;
  readonly user: { readonly id: string };
  memberRoleIds(): readonly string[];
  deferUpdate(): Promise<unknown>;
  editReply(options: InteractionEditReplyOptions): Promise<unknown>;
  followUp(options: InteractionReplyOptions): Promise<unknown>;
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/**
 * What a Look again press needs: the Game API, charged to the Member who pressed, the Links and REAPER for /reaper closest,
 * the pick lists a card may open, the paged answers a /reaper closest press keeps, the Daily Allowance and usage line, the
 * clock and the error log.
 */
export interface LookAgainContext {
  readonly gameApi: Pick<LookupApi, "getPlayer" | "getAlliance" | "chargedTo">;
  readonly pickSessions: Pick<PickSessions, "open">;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly reaper: Pick<ReaperStore, "inKingdom" | "refresh">;
  readonly pages: Pick<ReaperPages<ReaperPageContent>, "open">;
  readonly homeKingdom: KingdomNumber;
  readonly now: () => Date;
  readonly logError: (message: string) => void;
  /** The Discord role ids that make a Member an Officer; an Officer's lookups are not limited. */
  readonly officerRoleIds: readonly string[];
  /** The Daily Allowance of today: the requests one Member's lookups may cause. */
  readonly allowance: () => number;
  /** The usage line of a caller, read after the request, so the count includes it. */
  readonly usage: (caller: LookupCaller) => string;
  /** Where an Alliance stands in the NaP, for the NaP line of its card; undefined for an Alliance outside the Home Kingdom. */
  readonly napStatusOf?: NapStatusOf;
}

const againMessages = {
  notOwner: "Only the Member who ran this command can use this button. Run it yourself.",
} as const;

/** Privately tells the Member a follow-up; the card the Member pressed stays as it was. */
async function followUpPrivately(press: LookAgainInteraction, message: PrivateMessage): Promise<void> {
  await press.followUp({ ...message, flags: MessageFlags.Ephemeral, allowedMentions });
}

/**
 * Asks the Game API again for a card, live and charged to the caller, and shows the answer in place of the pressed card.
 * A refusal or a failure is told privately, and the card stays as it was. The reply is always shown with the usage line
 * of the caller, the same as the lookup that made the card.
 */
async function refreshCard<T>(
  press: LookAgainInteraction,
  context: LookAgainContext,
  caller: LookupCaller,
  ask: () => Promise<ChargedResult<T>>,
  card: (value: T, asOf: Date | undefined, now: Date) => CardMessage,
  failureMessage: (failure: Failure<T>, now: Date) => PrivateMessage,
): Promise<void> {
  let result: ChargedResult<T>;
  try {
    result = await ask();
  } catch (error) {
    context.logError(`Looking up again failed: ${errorText(error)}`);
    await followUpPrivately(press, withCallerUsage(context, caller, { content: lookupMessages.unavailable }));
    return;
  }
  if (result.kind === "allowance-spent") {
    await followUpPrivately(press, { content: refusalMessage(result.resetsAt, context.allowance()) });
    return;
  }
  if (result.kind !== "found") {
    await followUpPrivately(press, withCallerUsage(context, caller, failureMessage(result, context.now())));
    return;
  }
  try {
    const message = withCallerUsage(context, caller, card(result.value, result.asOf, context.now()));
    await press.editReply({ ...message, components: message.components ?? [], allowedMentions });
  } catch (error) {
    context.logError(`Showing the card again failed: ${errorText(error)}`);
    await followUpPrivately(press, withCallerUsage(context, caller, { content: lookupMessages.unavailable }));
  }
}

/** The /reaper closest target of a Look again button. */
type ClosestTarget = Extract<LookAgainTarget, { readonly kind: "reaper" }>;

/**
 * Ranks /reaper closest again from the x and y the command gave (or the caller's Linked Player), with live reads charged to
 * the Member who pressed, and edits the pressed answer with the result, as the command answers it: the cards, paged again
 * when the press keeps all, or the text that says why there are none. The usage line of the caller is shown with it. A
 * failed ranking is told privately.
 */
async function refreshClosest(
  press: LookAgainInteraction,
  context: LookAgainContext,
  caller: LookupCaller,
  target: ClosestTarget,
): Promise<void> {
  const ownerId = press.user.id;
  let redrawn: ReaperAnswer;
  try {
    const lookups = context.gameApi.chargedTo(caller);
    const outcome = await rankClosestFor(target.origin, ownerId, context, (uid) => lookups.getPlayer(uid, "live"));
    if (outcome.kind === "text") {
      redrawn = { content: outcome.content, allowedMentions };
    } else {
      const now = context.now();
      const sessionId = closestSessionOf(outcome.ranking, target.all === true, ownerId, context.pages, now);
      redrawn = closestAnswer(outcome.ranking, now, 0, sessionId, ownerId);
    }
    redrawn = withCallerUsage(context, caller, redrawn);
  } catch (error) {
    context.logError(`Ranking REAPER again failed: ${errorText(error)}`);
    await followUpPrivately(press, { content: lookupMessages.unavailable });
    return;
  }
  try {
    await press.editReply({ embeds: [], components: [], ...redrawn });
  } catch (error) {
    context.logError(`Showing REAPER again failed: ${errorText(error)}`);
    await followUpPrivately(press, { content: lookupMessages.unavailable });
  }
}

/** Repeats the lookup a Look again button stands for, as the Member who pressed it. */
async function repeatTarget(
  press: LookAgainInteraction,
  target: LookAgainTarget,
  context: LookAgainContext,
  caller: LookupCaller,
  ownerId: string,
): Promise<void> {
  switch (target.kind) {
    case "player": {
      const { uid } = target;
      await refreshCard(
        press,
        context,
        caller,
        () => context.gameApi.chargedTo(caller).getPlayer(uid, "live"),
        (player, asOf, now) => playerCardMessage(player, asOf, now, ownerId),
        (failure) => ({ content: playerFailureText(failure, uid) }),
      );
      return;
    }
    case "alliance": {
      const { kingdom, tag } = target;
      await refreshCard(
        press,
        context,
        caller,
        () => context.gameApi.chargedTo(caller).getAlliance(kingdom, tag, "live"),
        (alliance, asOf, now) =>
          allianceCardMessage(alliance, asOf, now, ownerId, context.pickSessions, napStatusFor(context, alliance)),
        (failure, now) =>
          allianceFailureMessage(
            failure,
            tag,
            lookupMessages.allianceNotFound(tag, kingdom),
            ownerId,
            context.pickSessions,
            now,
          ),
      );
      return;
    }
    case "overview": {
      const { kingdom, tag } = target;
      await refreshCard(
        press,
        context,
        caller,
        () => context.gameApi.chargedTo(caller).getAlliance(kingdom, tag, "live"),
        (alliance, asOf, now) =>
          renderOverview(alliance, asOf, now, ownerId, openOverviewSession(alliance, asOf, ownerId, context.pickSessions, now), 0),
        (failure, now) =>
          failure.kind === "ambiguous"
            ? { content: lookupMessages.tryAgain }
            : allianceFailureMessage(
                failure,
                tag,
                lookupMessages.allianceNotFound(tag, kingdom),
                ownerId,
                context.pickSessions,
                now,
              ),
      );
      return;
    }
    case "reaper":
      await refreshClosest(press, context, caller, target);
      return;
  }
}

/**
 * Answers a press of a Look again button: only the Member who ran the lookup may press it, and a custom id that cannot be
 * read is told as unavailable. Otherwise the card is deferred at once (Discord's three seconds), then repeated live.
 */
export async function handleLookAgain(press: LookAgainInteraction, context: LookAgainContext): Promise<void> {
  await answer("the Look again button", context, async () => {
    const parsed = parseLookAgainCustomId(press.customId);
    if (parsed === undefined) {
      await replyPrivately(press, lookupMessages.unavailable);
      return;
    }
    if (parsed.ownerId !== press.user.id) {
      await replyPrivately(press, againMessages.notOwner);
      return;
    }
    await press.deferUpdate();
    const caller = callerOf(press, context.officerRoleIds);
    await repeatTarget(press, parsed.target, context, caller, parsed.ownerId);
  });
}

/**
 * What a Look again button repeats: a Player card, an Alliance card, an Alliance Overview, or /reaper closest (measured
 * from `origin` when the command gave one, and paged when `all` is set).
 */
export type LookAgainTarget =
  | { readonly kind: "player"; readonly uid: Uid }
  | { readonly kind: "alliance"; readonly kingdom: KingdomNumber; readonly tag: AllianceKey }
  | { readonly kind: "overview"; readonly kingdom: KingdomNumber; readonly tag: AllianceKey }
  | { readonly kind: "reaper"; readonly origin?: Position; readonly all?: boolean };

/** A Look again button read back from its custom id: the Member who may press it, and what it repeats. */
export interface LookAgainPress {
  readonly ownerId: string;
  readonly target: LookAgainTarget;
}

const PREFIX = "again";
/** `again:{owner}:p:{uid}`: a Player card. The uid's digits are checked by parseUid. */
const PLAYER_ID = /^again:(\d+):p:(\d+)$/;
/** `again:{owner}:a:{kingdom}:{tag}`: an Alliance card. The tag is the rest of the id, checked by parseAllianceKey. */
const ALLIANCE_ID = /^again:(\d+):a:(\d+):(.+)$/;
/** `again:{owner}:o:{kingdom}:{tag}`: an Alliance Overview. */
const OVERVIEW_ID = /^again:(\d+):o:(\d+):(.+)$/;
/** `again:{owner}:r` or `again:{owner}:ra` (all pages), each with or without `:{x}:{y}`: /reaper closest. */
const REAPER_ID = /^again:(\d+):r(a?)(?::(-?\d+):(-?\d+))?$/;

/** The custom id of a Look again button: `again:<ownerId>:<kind>...`, short enough for Discord's 100 characters. */
export function lookAgainCustomId(ownerId: string, target: LookAgainTarget): string {
  switch (target.kind) {
    case "player":
      return `${PREFIX}:${ownerId}:p:${target.uid}`;
    case "alliance":
      return `${PREFIX}:${ownerId}:a:${target.kingdom.toString()}:${target.tag}`;
    case "overview":
      return `${PREFIX}:${ownerId}:o:${target.kingdom.toString()}:${target.tag}`;
    case "reaper": {
      const head = `${PREFIX}:${ownerId}:r${target.all === true ? "a" : ""}`;
      return target.origin === undefined ? head : `${head}:${target.origin.x.toString()}:${target.origin.y.toString()}`;
    }
  }
}

/** Reads a Look again button's custom id back; undefined for any other id, or one whose parts are not valid. */
export function parseLookAgainCustomId(customId: string): LookAgainPress | undefined {
  const player = PLAYER_ID.exec(customId);
  if (player !== null) return playerPressOf(player[1], player[2]);
  const alliance = ALLIANCE_ID.exec(customId);
  if (alliance !== null) return alliancePressOf("alliance", alliance[1], alliance[2], alliance[3]);
  const overview = OVERVIEW_ID.exec(customId);
  if (overview !== null) return alliancePressOf("overview", overview[1], overview[2], overview[3]);
  const reaper = REAPER_ID.exec(customId);
  if (reaper !== null) return reaperPressOf(reaper[1], reaper[2], reaper[3], reaper[4]);
  return undefined;
}

function playerPressOf(ownerId: string | undefined, uidText: string | undefined): LookAgainPress | undefined {
  const uid = uidText === undefined ? undefined : parseUid(uidText);
  if (ownerId === undefined || uid === undefined || !uid.ok) return undefined;
  return { ownerId, target: { kind: "player", uid: uid.value } };
}

function alliancePressOf(
  kind: "alliance" | "overview",
  ownerId: string | undefined,
  kingdomText: string | undefined,
  tagText: string | undefined,
): LookAgainPress | undefined {
  const kingdom = kingdomText === undefined ? undefined : parseKingdom(Number(kingdomText));
  const tag = tagText === undefined ? undefined : parseAllianceKey(tagText);
  if (ownerId === undefined || kingdom === undefined || tag === undefined || !kingdom.ok || !tag.ok) return undefined;
  return { ownerId, target: { kind, kingdom: kingdom.value, tag: tag.value } };
}

function reaperPressOf(
  ownerId: string | undefined,
  allText: string | undefined,
  xText: string | undefined,
  yText: string | undefined,
): LookAgainPress | undefined {
  if (ownerId === undefined) return undefined;
  const all = allText === "a";
  if (xText === undefined || yText === undefined) return { ownerId, target: reaperTargetOf(all, undefined) };
  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
  return { ownerId, target: reaperTargetOf(all, { x, y }) };
}

/** The /reaper closest target, with `all` and the origin only when they are set. */
function reaperTargetOf(all: boolean, origin: Position | undefined): LookAgainTarget {
  return {
    kind: "reaper",
    ...(all ? { all } : {}),
    ...(origin === undefined ? {} : { origin }),
  };
}
