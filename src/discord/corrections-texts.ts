import {
  ButtonStyle,
  ComponentType,
  MessageFlags,
  type APIAllowedMentions,
  type APIButtonComponentWithCustomId,
} from "discord.js";
import { utcTime, timeLeft } from "./lookup-cards.js";
import type { Uid } from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import type { ApprovableRank, MemberId } from "../domain/rank-approval.js";
import { playerCardText, type ButtonMessage, type Message, type PrivateReply } from "./interview-texts.js";
import { playerFailureText, type Failure } from "./lookup.js";

const NO_MENTIONS: APIAllowedMentions = { parse: [] };

/** The text of a reply; the command defers it privately, so only the Member who ran it sees it. */
function replyText(content: string): Message {
  return { content, allowedMentions: NO_MENTIONS };
}

/** The text of a reply to a button press, which only the person who pressed it sees. */
function privateText(content: string): PrivateReply {
  return { ...replyText(content), flags: MessageFlags.Ephemeral };
}

/** The private reply to a command that only an Officer may run. */
export function notOfficerReply(): Message {
  return replyText("Only an Officer can do that.");
}

/** The private reply when the Member has no Link to end or to give a rank to. */
export function notLinkedReply(memberId: MemberId): Message {
  return replyText(`<@${memberId}> is not Linked, so there is no Link to change.`);
}

/** The private reply after the caller's own Link has ended. */
export function unlinkedSelfReply(): Message {
  return replyText("Your Link has ended. To be linked again, run /interview.");
}

/** The private reply to an Officer after they Unlinked a Member. */
export function unlinkedByOfficerReply(memberId: MemberId): Message {
  return replyText(`The Link of <@${memberId}> has ended.`);
}

/** The private reply to /rank when the Officer names their own Linked Member. */
export function ownLinkReply(): Message {
  return replyText("You can't give your own rank: another Officer must.");
}

/** The private reply to /rank for a Linked Member who is in no Alliance. */
export function noAllianceReply(memberId: MemberId): Message {
  return replyText(`<@${memberId}> is in no Alliance, so no rank can be given.`);
}

/** The private reply to /rank when the member or the rank is missing or not R1 to R5. */
export function rankInputReply(): Message {
  return replyText("Name a Member and a rank from R1 to R5.");
}

/**
 * The private reply once an Officer gave a rank. When the Game API lists another rank for the Member, the reply says the
 * next Daily Sync uses that rank instead.
 */
export function rankSetReply(memberId: MemberId, rank: ApprovableRank, gameRank: ApprovableRank | undefined): Message {
  const gameNote =
    gameRank === undefined
      ? ""
      : ` The game lists ${gameRank} for them, so the next Daily Sync uses ${gameRank} instead.`;
  return replyText(`The rank of <@${memberId}> is now ${rank}.${gameNote}`);
}

/** The message in a Rank Approval's thread when an Officer set the rank before the Members of it did. */
export function rankSetInThreadMessage(officerId: MemberId, memberId: MemberId, rank: ApprovableRank): Message {
  return {
    content: `<@${officerId}> set <@${memberId}>'s rank to ${rank}.`,
    allowedMentions: NO_MENTIONS,
  };
}

/** The private reply to /link when the caller names themselves. */
export function selfLinkReply(): Message {
  return replyText("You can't Link yourself: another Officer must.");
}

/** The private reply to /link when the Member is missing, or the uid is not only digits. */
export function linkInputReply(): Message {
  return replyText("Name a Member and a uid: the uid is a number, like 145563254785.");
}

/** The private reply to /link for a Member whose latest Interview is not handed off. */
export function notHandedOffReply(memberId: MemberId): Message {
  return replyText(`<@${memberId}>'s latest interview isn't handed off, so there is nothing to Link.`);
}

/** The private reply to /link for a uid that another Member is Linked to. */
export function uidLinkedElsewhereReply(holder: MemberId): Message {
  return replyText(`That uid is already linked to <@${holder}>.`);
}

/** The private reply to /link for a Member who is not on the server. */
export function memberGoneReply(memberId: MemberId): Message {
  return replyText(`<@${memberId}> is not on the server, so they can't be Linked.`);
}

/** The private reply to /link when the Daily Quota is spent: when lookups work again. */
function quotaSpentReply(resetsAt: Date, now: Date): Message {
  return replyText(
    `I can't look players up again until ${utcTime(resetsAt)} (${timeLeft(resetsAt, now)}). Run /link again then.`,
  );
}

/** The private reply to /link when the Player for the uid could not be fetched: why, and when lookups work again. */
export function linkLookupFailureReply(failure: Failure<Player>, uid: Uid, now: Date): Message {
  return failure.kind === "quota-spent" ? quotaSpentReply(failure.resetsAt, now) : replyText(playerFailureText(failure, uid, now));
}

/** The Officer Link card: the Player shown, and the Confirm and Cancel buttons of this confirmation. */
export function linkCardMessage(confirmationId: string, memberId: MemberId, player: Player): ButtonMessage {
  return {
    content: `${playerCardText(player)}\nLink <@${memberId}> to this player?`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          linkButton(confirmationId, "confirm", "Confirm", ButtonStyle.Success),
          linkButton(confirmationId, "cancel", "Cancel", ButtonStyle.Secondary),
        ],
      },
    ],
    allowedMentions: NO_MENTIONS,
  };
}

function linkButton(
  confirmationId: string,
  action: LinkAction,
  label: string,
  style: ButtonStyle.Success | ButtonStyle.Secondary,
): APIButtonComponentWithCustomId {
  return { type: ComponentType.Button, style, label, custom_id: linkCustomId(confirmationId, action) };
}

/** The Officer Link card once its confirmation is over: the Player and the outcome, without buttons. */
export function linkCardEndedMessage(memberId: MemberId, player: Player, outcome: "linked" | "cancelled"): Message {
  const verdict = outcome === "linked" ? `Linked <@${memberId}>.` : "Cancelled: nothing was linked.";
  return replyText(`${playerCardText(player)}\n${verdict}`);
}

/** The private reply to a Link button whose confirmation has expired, was used, or never existed. */
export function linkEndedReply(): PrivateReply {
  return privateText("This link has ended or expired. Run /link to start again.");
}

/** The private reply to a Link button pressed by someone other than the Officer who asked. */
export function linkNotYoursReply(): PrivateReply {
  return privateText("Only the Officer who asked can use these buttons.");
}

/** The private reply when a confirmed Link is not made: the Member left, or the uid or the Interview changed meanwhile. */
export function linkRefusedReply(): PrivateReply {
  return privateText("Nothing was linked: the Member left, or the uid or the interview changed. Run /link to start again.");
}

/** The custom id of a button of an Officer Link card: link:{confirmationId}:{action}. */
export function linkCustomId(confirmationId: string, action: LinkAction): string {
  return `link:${confirmationId}:${action}`;
}

export type LinkAction = "confirm" | "cancel";

const LINK_CUSTOM_ID = /^link:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(confirm|cancel)$/;

/** Reads an Officer Link button's custom id; undefined when it is not one. */
export function parseLinkCustomId(customId: string): { readonly confirmationId: string; readonly action: LinkAction } | undefined {
  const match = LINK_CUSTOM_ID.exec(customId);
  if (match === null) return undefined;
  return { confirmationId: match[1] ?? "", action: match[2] === "confirm" ? "confirm" : "cancel" };
}
