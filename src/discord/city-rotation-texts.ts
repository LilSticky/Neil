import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
} from "discord.js";
import type { CityRotationMode, RotationChangeProblem, RotationProblem } from "../domain/city-rotation.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { CityRotationState } from "../storage/city-rotation-store.js";
import { timestamp } from "./timestamps.js";

/** The custom id prefix of the Confirm handover button. */
export const ROTATION_CONFIRM_PREFIX = "rotation-confirm:";

/** The colour of the City Rotation card. */
const CARD_COLOUR = 0xc9a227;

/** An Alliance as the card names it: `[TAG] name`, or `[TAG]` when the name is not known. */
export function allianceLabel(tag: string, name: string | undefined): string {
  return name === undefined ? `[${tag}]` : `[${tag}] ${name}`;
}

/** What the City Rotation card shows, with every Alliance already named. */
export interface CardContent {
  readonly mode: CityRotationMode;
  readonly state: CityRotationState;
  /** The label of an Alliance tag: `[TAG] name` when it is a Known Alliance. */
  readonly label: (tag: string) => string;
  /** The tag whose Turn follows the Holding Alliance's; undefined in Contested or without an order. */
  readonly next: string | undefined;
  /** The next Royal City siege. */
  readonly nextSiege: Date;
}

/** The City Rotation card, pinned in nap-announcements and shown by /rotation show. Timestamps only in the description. */
export function cityRotationCard(content: CardContent): APIEmbed {
  const { mode, state, label, next, nextSiege } = content;
  const lines: string[] = [];
  if (mode === "contested") {
    lines.push("**Mode**: Contested. Alliances fight over the Royal City; an Officer names each new Holding Alliance.");
    lines.push(`**Holding Alliance**: ${state.holding === undefined ? "not named yet" : label(state.holding)}`);
  } else if (state.order === undefined) {
    lines.push("No City Rotation is set yet. The R5s of the Alliances in it set it with `/rotation set`.");
  } else {
    lines.push("**Mode**: Rotation. The Alliances take the Royal City in this order, one Turn each.");
    if (state.paused) {
      lines.push("**Paused**: Neil names no new Holding Alliance after a Royal City siege until an R5 resumes it with `/rotation resume`.");
    }
    lines.push(`**Holding Alliance**: ${state.holding === undefined ? "not named yet" : label(state.holding)}`);
    if (next !== undefined) lines.push(`**Next Holding Alliance**: ${label(next)}`);
    lines.push("", "**Order**", ...state.order.map((tag, index) => `${(index + 1).toString()}. ${label(tag)}`));
  }
  if (state.handover !== undefined) {
    lines.push("", `**Handover**: waiting for ${label(state.handover.expected)} to confirm.`);
  }
  lines.push("", `**Next Royal City siege**: ${timestamp(nextSiege, "F")} (${timestamp(nextSiege, "R")})`);
  return { title: "City Rotation", color: CARD_COLOUR, description: lines.join("\n") };
}

/** The Confirm handover button of a Handover after the siege at `siegeAt`, to `tag`. */
export function confirmHandoverRow(siegeAt: Date, tag: string): APIActionRowComponent<APIButtonComponentWithCustomId> {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Success,
        label: "Confirm handover",
        custom_id: `${ROTATION_CONFIRM_PREFIX}${siegeAt.getTime().toString()}:${tag}`,
      },
    ],
  };
}

/** The siege and the tag a Confirm handover button names; undefined for a custom id Neil did not make. */
export function confirmHandoverOf(customId: string): { readonly siegeAt: number; readonly tag: string } | undefined {
  if (!customId.startsWith(ROTATION_CONFIRM_PREFIX)) return undefined;
  const rest = customId.slice(ROTATION_CONFIRM_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) return undefined;
  const siegeAt = Number(rest.slice(0, colon));
  const tag = rest.slice(colon + 1);
  if (!Number.isSafeInteger(siegeAt) || tag === "") return undefined;
  return { siegeAt, tag };
}

/** Who the R5 of the expected Alliance is, as far as Neil could find out. */
export type ExpectedLeader =
  | { readonly kind: "linked"; readonly playerName: string | undefined; readonly memberId: MemberId }
  | { readonly kind: "unlinked"; readonly playerName: string | undefined }
  | { readonly kind: "unknown" };

/** The texts of the City Rotation; every answer to a command is private. */
export const cityRotationMessages = {
  unknownSubcommand: "Neil does not know this /rotation command.",
  contested:
    "This Kingdom is Contested: there is no City Rotation order. An Officer names the Holding Alliance with `/rotation holder`.",
  refusedSet:
    "Only a Member Linked to the R5 of a Home Kingdom Alliance in the City Rotation may set it (while none is set, of an Alliance in the new order).",
  refusedHolder: "Only Officers may name the Holding Alliance.",
  noOrderTags: "Name the Alliances of the City Rotation by tag, separated by commas or spaces, e.g. `NML, ABC, XYZ`.",
  unknownTags: (tags: readonly string[]): string =>
    `Neil does not know ${tags.map((tag) => `[${tag}]`).join(", ")} as ${tags.length === 1 ? "an Alliance" : "Alliances"} of the Home Kingdom. Look ${tags.length === 1 ? "it" : "them"} up with \`/alliance\` first, then try again.`,
  problem: (problem: RotationProblem): string => {
    switch (problem.kind) {
      case "too-short":
        return "A City Rotation needs at least 2 Alliances.";
      case "too-long":
        return "A City Rotation holds at most 10 Alliances.";
      case "duplicate":
        return `[${problem.tag}] is named twice; each Alliance takes one Turn.`;
      case "holder-not-in-order":
        return `[${problem.tag}] is not in the order, so it cannot be the Holding Alliance.`;
    }
  },
  noRotationForHolder: "No City Rotation is set yet. The R5s set it with `/rotation set` first.",
  holderNotInOrder: (tag: string): string => `[${tag}] is not in the City Rotation, so it cannot be the Holding Alliance.`,
  unknownHolder: (tag: string): string =>
    `Neil does not know [${tag}] as an Alliance of the Home Kingdom. Look it up with \`/alliance\` first, then try again.`,
  set: (holding: string): string => `The City Rotation is set. ${holding} holds the Royal City this Turn.`,
  holderNamed: (holding: string): string => `${holding} is now the Holding Alliance.`,
  confirmRefused: "Only the R5 of the receiving Alliance, or an Officer, may confirm this Handover.",
  notOpen: "This Handover is no longer open.",
  confirmed: (alliance: string, memberId: MemberId): string =>
    `The Handover is confirmed by <@${memberId}>: ${alliance} now holds the Royal City.`,

  /** The confirmation request in nap-leaders after a Royal City siege, in Rotation mode. */
  confirmRequest: (alliance: string, leader: ExpectedLeader, readFailed: boolean): string => {
    const head = `The Royal City siege is over. By the City Rotation, ${alliance} takes the Royal City this Turn.`;
    if (leader.kind === "linked") {
      const name = leader.playerName === undefined ? "" : ` (${leader.playerName})`;
      return `${head}\n<@${leader.memberId}>${name}, as its R5, please confirm the Handover. An Officer may confirm too.`;
    }
    if (leader.kind === "unlinked") {
      const name = leader.playerName === undefined ? "Its R5" : `Its R5, ${leader.playerName},`;
      return `${head}\n${name} has no Link on this server, so an Officer confirms the Handover.`;
    }
    return readFailed
      ? `${head}\nNeil could not read its R5 from the Game API, so an Officer confirms the Handover.`
      : `${head}\nThe Game API names no R5 for it, so an Officer confirms the Handover.`;
  },
  /** The line in nap-leaders after a Royal City siege, in Contested mode. */
  contestedSiegeOver:
    "The Royal City siege is over. An Officer names the new Holding Alliance with `/rotation holder`.",

  noRotationToChange: "No City Rotation is set yet. The R5s set it with `/rotation set` first.",
  refusedChange: "Only a Member Linked to the R5 of an Alliance in the City Rotation may change it.",
  changeProblem: (problem: RotationChangeProblem): string => {
    switch (problem.kind) {
      case "not-in-rotation":
        return `[${problem.tag}] is not in the City Rotation.`;
      case "position-out-of-range":
        return `Choose a place from 1 to ${problem.length.toString()}.`;
      case "no-change":
        return "Nothing changes: the Alliance is already in that place.";
      case "too-short":
        return "A City Rotation of one Alliance has no Turn to skip.";
      case "last-alliance":
        return "The last Alliance cannot be taken out of the City Rotation.";
    }
  },
  alreadyPaused: "Nothing changes: the City Rotation is already paused.",
  notPaused: "Nothing changes: the City Rotation is not paused.",
  moved: (alliance: string, position: number, next: string | undefined): string =>
    `${alliance} is now in place ${position.toString()} of the City Rotation.${nextSentence(next)}`,
  skipped: (skipped: string, next: string): string =>
    `${skipped}'s Turn is skipped by the NaP Council's decision. ${next} is the next Holding Alliance.`,
  left: (alliance: string, next: string | undefined): string =>
    `${alliance} is out of the City Rotation.${nextSentence(next)}`,
  pausedReply: "The City Rotation is paused. Neil names no new Holding Alliance after a Royal City siege until it is resumed.",
  resumedReply: (next: string | undefined): string => `The City Rotation runs again.${nextSentence(next)}`,

  /** The news in home-kingdom-announcements after each change; it mentions nobody. */
  announceMoved: (alliance: string, position: number, order: string, next: string | undefined): string =>
    `**City Rotation**: ${alliance} moves to place ${position.toString()}. The order is now ${order}.${nextSentence(next)}`,
  announceSkipped: (skipped: string, next: string): string =>
    `**City Rotation**: by the NaP Council's decision, ${skipped} skips its Turn and keeps its place. ${next} is the next Holding Alliance.`,
  announceLeft: (alliance: string, holding: boolean, order: string, next: string | undefined): string =>
    `**City Rotation**: ${alliance} left the NaP and is out of the City Rotation.${holding ? " It holds the Royal City until the next Handover." : ""} The order is now ${order}.${nextSentence(next)}`,
  announcePaused:
    "**City Rotation**: the rotation is paused. Neil names no new Holding Alliance after a Royal City siege until it is resumed.",
  announceResumed: (next: string | undefined): string => `**City Rotation**: the rotation runs again.${nextSentence(next)}`,

  /** The old confirmation request in nap-leaders, once a skip or a leave hands the open Turn to another Alliance. */
  turnMovedOn: (alliance: string): string =>
    `This Turn moved on by the NaP Council's decision: Neil now asks ${alliance} to confirm the Handover.`,
  /** The head of a new confirmation request after a skip or a leave. */
  turnMovedOnHead: "The NaP Council's decision moved this Turn on.",

  logMoved: (memberId: MemberId, alliance: string, position: number, before: string, after: string, next: string): string =>
    `<@${memberId}> moved ${alliance} to place ${position.toString()} of the City Rotation: ${before} becomes ${after}; next is ${next}.`,
  logSkipped: (memberId: MemberId, skipped: string, order: string, next: string, asked: string | undefined): string =>
    `<@${memberId}> skipped the Turn of ${skipped} in the City Rotation (order ${order}, unchanged); next is ${next}.${askedSentence(asked)}`,
  logLeft: (memberId: MemberId, alliance: string, before: string, after: string, next: string, asked: string | undefined): string =>
    `<@${memberId}> recorded that ${alliance} left the NaP: the City Rotation ${before} becomes ${after}; next is ${next}.${askedSentence(asked)}`,
  logPaused: (memberId: MemberId, order: string): string => `<@${memberId}> paused the City Rotation (order ${order}, unchanged).`,
  logResumed: (memberId: MemberId, order: string, next: string): string =>
    `<@${memberId}> resumed the City Rotation (order ${order}, unchanged); next is ${next}.`,
  logPausedSiege: "A Royal City siege passed while the City Rotation is paused; Neil names no Holding Alliance and asks nobody.",
  logNoKingdomAnnouncements: "The City Rotation news was not posted: the server has no #home-kingdom-announcements.",
  logKingdomAnnouncementFailed: (reason: string): string =>
    `Posting the City Rotation news in #home-kingdom-announcements failed: ${reason}`,
  logSet: (memberId: MemberId, oldOrder: string, oldHolding: string, newOrder: string, newHolding: string): string =>
    `<@${memberId}> set the City Rotation: ${oldOrder} (holding ${oldHolding}) → ${newOrder} (holding ${newHolding}).`,
  logHolder: (memberId: MemberId, holding: string): string =>
    `Officer <@${memberId}> named ${holding} the Holding Alliance.`,
  logExpected: (alliance: string, leaderUid: string | undefined): string =>
    `After the Royal City siege, Neil expects ${alliance} to take the Royal City; its R5 is ${leaderUid === undefined ? "unknown" : `uid ${leaderUid}`}. Waiting for confirmation.`,
  logStillWaiting: (alliance: string): string =>
    `A Royal City siege passed while the Handover to ${alliance} still waits for confirmation; Neil asks nothing new.`,
  logConfirmed: (memberId: MemberId, by: "R5" | "Officer", alliance: string): string =>
    `${by === "R5" ? "The R5" : "Officer"} <@${memberId}> confirmed the Handover: ${alliance} is the Holding Alliance.`,
  logNoAnnouncements: "The City Rotation card was not posted: the server has no #nap-announcements.",
  logNoLeaders: "The Royal City siege message was not posted: the server has no #nap-leaders.",
  logCardFailed: (reason: string): string => `Updating the City Rotation card in #nap-announcements failed: ${reason}`,
  logPinFailed: (reason: string): string => `Pinning the City Rotation card in #nap-announcements failed: ${reason}`,
  logSiegePostFailed: (reason: string): string => `Posting the Royal City siege message in #nap-leaders failed: ${reason}`,
} as const;

function nextSentence(next: string | undefined): string {
  return next === undefined ? "" : ` ${next} is the next Holding Alliance.`;
}

/** `leader` is set only when the open Turn now waits for another Alliance: its R5's uid, or "unknown". */
function askedSentence(leader: string | undefined): string {
  return leader === undefined ? "" : ` The open Turn now waits for its confirmation; its R5 is ${leader}.`;
}

/** An order as the log shows it: the tags in brackets, or "none". */
export function orderText(order: readonly string[] | undefined): string {
  return order === undefined ? "none" : order.map((tag) => `[${tag}]`).join(" → ");
}
