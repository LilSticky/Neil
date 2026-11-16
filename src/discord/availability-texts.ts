import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
} from "discord.js";
import {
  FIGHTER_CLASSES,
  type AvailabilityAnswer,
  type AvailabilityCounts,
  type AvailabilityTotals,
  type FighterClass,
} from "../domain/availability.js";
import type { Raid } from "../domain/raid.js";
import type { TroopBracket } from "../domain/troop-bracket.js";
import { timeLine } from "./raid-texts.js";

/** The custom id prefix of every Availability Poll button. */
export const AVAILABILITY_PREFIX = "avail:";

/** What a poll card or the summary shows: the open poll, or the final numbers after the start or a cancel. */
export type PollCardState = "open" | "started" | "cancelled";

/** A pressed Availability Poll button, read from its custom id. */
export type AvailabilityButton =
  | { readonly kind: "available" | "not-available"; readonly raidId: string; readonly tag: string }
  | { readonly kind: "class"; readonly fighterClass: FighterClass; readonly raidId: string; readonly tag: string };

export function availableButtonId(raidId: string, tag: string): string {
  return `${AVAILABILITY_PREFIX}yes:${raidId}:${tag}`;
}

export function notAvailableButtonId(raidId: string, tag: string): string {
  return `${AVAILABILITY_PREFIX}no:${raidId}:${tag}`;
}

export function classButtonId(fighterClass: FighterClass, raidId: string, tag: string): string {
  return `${AVAILABILITY_PREFIX}class:${fighterClass}:${raidId}:${tag}`;
}

const ANSWER_ID = /^avail:(yes|no):(\d{4}-\d{2}-\d{2}):(.+)$/;
const CLASS_ID = /^avail:class:(whale|dolphin|seal|small-fry):(\d{4}-\d{2}-\d{2}):(.+)$/;

/** The button a custom id names; undefined when it is not an Availability Poll button. */
export function parseAvailabilityButton(customId: string): AvailabilityButton | undefined {
  const answer = ANSWER_ID.exec(customId);
  if (answer !== null) {
    const [, kind, raidId, tag] = answer;
    if (raidId === undefined || tag === undefined) return undefined;
    return { kind: kind === "yes" ? "available" : "not-available", raidId, tag };
  }
  const chosen = CLASS_ID.exec(customId);
  if (chosen === null) return undefined;
  const [, name, raidId, tag] = chosen;
  const fighterClass = FIGHTER_CLASSES.find((candidate) => candidate === name);
  if (fighterClass === undefined || raidId === undefined || tag === undefined) return undefined;
  return { kind: "class", fighterClass, raidId, tag };
}

/** A Fighter Class as Members read it. */
export function fighterClassName(fighterClass: FighterClass): string {
  switch (fighterClass) {
    case "whale":
      return "Whale";
    case "dolphin":
      return "Dolphin";
    case "seal":
      return "Seal";
    case "small-fry":
      return "Small Fry";
  }
}

const POLL_COLOR = 0x2e86c1;
const CLOSED_COLOR = 0x808080;

/** The counts as lines: the strategy classes and their sum, then Small Fry and Not available apart. */
function countLines(counts: AvailabilityCounts): string {
  return [
    `Whales: ${counts.whale.toString()}`,
    `Dolphins: ${counts.dolphin.toString()}`,
    `Seals: ${counts.seal.toString()}`,
    `**Fighters (Whales, Dolphins, Seals): ${counts.strategy.toString()}**`,
    `Small Fry (counted apart): ${counts.smallFry.toString()}`,
    `Not available: ${counts.notAvailable.toString()}`,
  ].join("\n");
}

/** The counts on one line, for the summary. */
function countLine(counts: AvailabilityCounts): string {
  return `Whales ${counts.whale.toString()} · Dolphins ${counts.dolphin.toString()} · Seals ${counts.seal.toString()} · **Fighters ${counts.strategy.toString()}** · Small Fry ${counts.smallFry.toString()} · Not available ${counts.notAvailable.toString()}`;
}

function closedLine(raid: Raid, state: PollCardState): string | undefined {
  if (state === "started") return `**Closed**: the Raid of Saturday ${timeLine(raid.start)} has started. These are the final numbers.`;
  if (state === "cancelled") return `**Cancelled**: the Raid of Saturday ${timeLine(raid.start)} will not take place. The poll is closed.`;
  return undefined;
}

/** An Alliance's poll card in its alliance-chat: the question while open, and its counts. Counts only, never names. */
export function pollCard(raid: Raid, tag: string, counts: AvailabilityCounts, state: PollCardState): APIEmbed {
  const description =
    closedLine(raid, state) ??
    [
      `Will you fight in the Raid of Saturday ${timeLine(raid.start)}?`,
      `Linked Members of [${tag}]: press **Available** or **Not available**. If you are available, Neil suggests a Fighter Class and you confirm it or pick another.`,
      "You can change your answer until the Raid starts. Only the counts below are shown.",
    ].join("\n");
  return {
    title: state === "open" ? `Availability Poll [${tag}]` : `Availability Poll [${tag}] (closed)`,
    color: state === "open" ? POLL_COLOR : CLOSED_COLOR,
    description,
    fields: [{ name: `[${tag}]`, value: countLines(counts) }],
  };
}

/** The Available and Not available buttons of an open poll card; a closed card has none. */
export function pollRows(raidId: string, tag: string, state: PollCardState): APIActionRowComponent<APIButtonComponentWithCustomId>[] {
  if (state !== "open") return [];
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        { type: ComponentType.Button, style: ButtonStyle.Success, label: "Available", custom_id: availableButtonId(raidId, tag) },
        { type: ComponentType.Button, style: ButtonStyle.Secondary, label: "Not available", custom_id: notAvailableButtonId(raidId, tag) },
      ],
    },
  ];
}

/** The Availability Summary in #kvk-leaders: each Alliance's counts and the Kingdom total. */
export function summaryCard(raid: Raid, totals: AvailabilityTotals, state: PollCardState): APIEmbed {
  const head =
    closedLine(raid, state) ??
    `Availability for the Raid of Saturday ${timeLine(raid.start)}, as the Members answer in their alliance-chat. Small Fry are counted apart and are not part of the Fighters.`;
  const alliances =
    totals.alliances.length === 0 ? ["No Alliances."] : totals.alliances.map((alliance) => `[${alliance.tag}] ${countLine(alliance.counts)}`);
  return {
    title: state === "open" ? "Availability Summary" : "Availability Summary (closed)",
    color: state === "open" ? POLL_COLOR : CLOSED_COLOR,
    description: [head, "", ...alliances].join("\n"),
    fields: [{ name: "Kingdom total", value: countLines(totals.kingdom) }],
  };
}

/** The four class buttons of the private reply; the suggested one is highlighted and marked. */
export function classRows(raidId: string, tag: string, suggested: FighterClass): APIActionRowComponent<APIButtonComponentWithCustomId>[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: FIGHTER_CLASSES.map((fighterClass) => ({
        type: ComponentType.Button,
        style: fighterClass === suggested ? ButtonStyle.Primary : ButtonStyle.Secondary,
        label: fighterClass === suggested ? `${fighterClassName(fighterClass)} (suggested)` : fighterClassName(fighterClass),
        custom_id: classButtonId(fighterClass, raidId, tag),
      })),
    },
  ];
}

/** What the suggestion was read from: the Linked Player's Troop Bracket and Might, or that they are unknown. */
export interface SuggestionBasis {
  readonly read: boolean;
  readonly bracket: TroopBracket | undefined;
  readonly might: number | undefined;
}

function answerText(answer: AvailabilityAnswer): string {
  const where = `on the poll of [${answer.tag}]`;
  return answer.availability.kind === "available"
    ? `available as ${fighterClassName(answer.availability.fighterClass)} ${where}`
    : `not available ${where}`;
}

export const availabilityMessages = {
  notSetUp: "The Availability Poll is not set up on this server.",
  unavailable: "The Availability Poll is not available right now. Please tell an Officer.",
  unknownPoll: "This Availability Poll is not open any more.",
  closed: "This Availability Poll is closed: the Raid has started. Answers can't change any more.",
  cancelled: "This Raid is cancelled, so the Availability Poll takes no answers.",
  notLinked: "Only Linked Members answer the Availability Poll. Link your Player first, then press the button again.",
  notInAlliance: (tag: string): string => `Only Members of [${tag}] answer this poll. Use the poll in your own Alliance's alliance-chat.`,
  suggestion: (tag: string, suggested: FighterClass, basis: SuggestionBasis, current: AvailabilityAnswer | undefined): string => {
    const read = basis.read
      ? `Your Troop Bracket is ${basis.bracket ?? "unknown"} and your Might is ${basis.might === undefined ? "unknown" : basis.might.toLocaleString("en-US")}.`
      : "Neil could not read your Player from the game right now, so it counts your Troop Bracket and Might as unknown.";
    return [
      `Available for [${tag}]. As which Fighter Class will you fight?`,
      `${read} Neil suggests **${fighterClassName(suggested)}**: confirm it or pick another.`,
      ...(current === undefined ? [] : [`Your answer so far: ${answerText(current)}.`]),
    ].join("\n");
  },
  recordedAvailable: (tag: string, fighterClass: FighterClass, start: Date): string =>
    `Recorded: available as **${fighterClassName(fighterClass)}** for [${tag}]. You can change it until the Raid starts: ${timeLine(start)}.`,
  recordedNotAvailable: (tag: string, start: Date): string =>
    `Recorded: **not available** for [${tag}]. You can change it until the Raid starts: ${timeLine(start)}.`,
};
