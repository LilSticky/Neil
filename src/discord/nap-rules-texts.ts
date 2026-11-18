import { ComponentType, TextInputStyle, type APIEmbed, type APIModalInteractionResponseCallbackData } from "discord.js";
import {
  napRulesStateOf,
  NAP_RULES_MAX_CHANGE,
  NAP_RULES_MAX_TEXT,
  type NapRulesState,
  type NapRulesTextProblem,
  type NapRulesVersion,
} from "../domain/nap-rules.js";
import type { MemberId } from "../domain/rank-approval.js";
import { publicText } from "./nap-motion-texts.js";
import { timestamp } from "./timestamps.js";

/** The custom id prefix of the form of /nap rules-propose. */
export const NAP_RULES_PREFIX = "nap-rules:";

/** The custom id of the form of /nap rules-propose. */
export const NAP_RULES_MODAL_ID = `${NAP_RULES_PREFIX}propose`;

/** The ids of the form's fields: the full text and the note on what changed. */
export const NAP_RULES_TEXT_FIELD = "text";
export const NAP_RULES_CHANGE_FIELD = "change";

/** Discord's limit on an embed's description, in characters. */
export const EMBED_DESCRIPTION_LIMIT = 4096;

/** The colour of the NaP Rules embeds, the same as the NaP embeds. */
const NAP_COLOUR = 0x3b88c3;

/** The label of each state, as /nap rules-history shows it. */
const STATE_LABELS: Readonly<Record<NapRulesState, string>> = {
  proposed: "proposed",
  "in-effect": "in effect",
  replaced: "replaced",
  rejected: "rejected",
};

/** The moment a version was decided; undefined while it is proposed. */
function decidedAtOf(version: NapRulesVersion): Date | undefined {
  return version.status.kind === "proposed" ? undefined : version.status.decidedAt;
}

/** A text on one line, for a list. */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/gu, " ");
}

/** The form of /nap rules-propose: the full text, prefilled with the current rules when there are any, and what changed. */
export function napRulesModal(currentText: string | undefined): APIModalInteractionResponseCallbackData {
  return {
    custom_id: NAP_RULES_MODAL_ID,
    title: "Propose new NaP Rules",
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: NAP_RULES_TEXT_FIELD,
            label: "The full NaP Rules",
            style: TextInputStyle.Paragraph,
            required: true,
            min_length: 1,
            max_length: NAP_RULES_MAX_TEXT,
            ...(currentText === undefined ? {} : { value: currentText.slice(0, NAP_RULES_MAX_TEXT) }),
          },
        ],
      },
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: NAP_RULES_CHANGE_FIELD,
            label: "What changed",
            style: TextInputStyle.Paragraph,
            required: true,
            min_length: 1,
            max_length: NAP_RULES_MAX_CHANGE,
          },
        ],
      },
    ],
  };
}

/** The text of the NaP Motion a proposed version is put to: its number, what changed, and where its full text is. */
export function napRulesMotionText(number: number, change: string): string {
  const n = number.toString();
  return `NaP Rules version ${n}: ${change}\nThe full proposed text: \`/nap rules-history version:${n}\`. Approved, version ${n} becomes the NaP Rules; rejected, the current rules stay.`;
}

/** /nap rules: the current version with since when it is in effect, and the open proposal's number, if any. */
export function napRulesEmbed(current: NapRulesVersion, open: NapRulesVersion | undefined): APIEmbed {
  const since = decidedAtOf(current);
  return {
    title: `NaP Rules, version ${current.number.toString()}`,
    color: NAP_COLOUR,
    description: publicText(current.text),
    fields: [
      ...(since === undefined ? [] : [{ name: "In effect since", value: `${timestamp(since, "f")} (${timestamp(since, "R")})` }]),
      ...(open === undefined
        ? []
        : [{ name: "Proposed", value: `Version ${open.number.toString()} waits for its NaP Motion.` }]),
    ],
  };
}

/** One version's line in /nap rules-history: its number, state, dates and what changed. */
export function napRulesHistoryLine(version: NapRulesVersion, versions: readonly NapRulesVersion[]): string {
  const decidedAt = decidedAtOf(version);
  const dates = `proposed ${timestamp(version.proposedAt, "d")}${decidedAt === undefined ? "" : `, decided ${timestamp(decidedAt, "d")}`}`;
  return `**Version ${version.number.toString()}** · ${STATE_LABELS[napRulesStateOf(version, versions)]} · ${dates}\n${oneLine(publicText(version.change))}`;
}

/** /nap rules-history: every version, newest first, cut to fit the embed, with how many older ones are left out. */
export function napRulesHistoryEmbed(versions: readonly NapRulesVersion[]): APIEmbed {
  if (versions.length === 0) {
    return { title: "NaP Rules history", color: NAP_COLOUR, description: "The NaP has no rules yet." };
  }
  const newest = [...versions].sort((a, b) => b.number - a.number);
  const footer = "\n\nSee a version's full text with `/nap rules-history version:<number>`.";
  const leftOutNote = (count: number): string => `\n\n${count.toString()} older versions are not shown.`;
  const budget = EMBED_DESCRIPTION_LIMIT - footer.length - leftOutNote(newest.length).length;
  const shown: string[] = [];
  let length = 0;
  for (const version of newest) {
    const line = napRulesHistoryLine(version, versions);
    const added = (shown.length === 0 ? 0 : 2) + line.length;
    if (length + added > budget) break;
    shown.push(line);
    length += added;
  }
  const leftOut = newest.length - shown.length;
  return {
    title: "NaP Rules history",
    color: NAP_COLOUR,
    description: `${shown.join("\n\n")}${leftOut === 0 ? "" : leftOutNote(leftOut)}${footer}`,
  };
}

/** /nap rules-history version: one version's full text, its state, dates and what changed. */
export function napRulesVersionEmbed(version: NapRulesVersion, versions: readonly NapRulesVersion[]): APIEmbed {
  const decidedAt = decidedAtOf(version);
  return {
    title: `NaP Rules, version ${version.number.toString()} (${STATE_LABELS[napRulesStateOf(version, versions)]})`,
    color: NAP_COLOUR,
    description: publicText(version.text),
    fields: [
      { name: "What changed", value: publicText(version.change) },
      { name: "Proposed", value: timestamp(version.proposedAt, "f"), inline: true },
      ...(decidedAt === undefined ? [] : [{ name: "Decided", value: timestamp(decidedAt, "f"), inline: true }]),
    ],
  };
}

/**
 * The announcement in #nap-announcements when a version takes effect, as lines: the header with since when, what
 * changed, and the full text. Plain content, so the Interaction Bot's translated copies carry it. No Member is named.
 */
export function napRulesAnnouncementLines(version: NapRulesVersion, at: Date): string[] {
  return [
    `📜 **NaP Rules version ${version.number.toString()} are now in effect** (since ${timestamp(at, "f")})`,
    "**What changed:**",
    ...publicText(version.change).split("\n"),
    "**The NaP Rules:**",
    ...publicText(version.text).split("\n"),
  ];
}

/** The private answer to a proposal refused for its text. */
const TEXT_PROBLEMS: Readonly<Record<NapRulesTextProblem, string>> = {
  "blank-text": "The NaP Rules need a text.",
  "blank-change": "Say what changed in this version.",
  "text-too-long": `The NaP Rules may be at most ${NAP_RULES_MAX_TEXT.toString()} characters long.`,
  "change-too-long": `What changed may be at most ${NAP_RULES_MAX_CHANGE.toString()} characters long.`,
  unchanged: "This text is the same as the NaP Rules in effect. Change something first.",
};

/** The texts of the NaP Rules; every answer to a command or form is private. */
export const napRulesMessages = {
  refusedPropose: "Only a member of the NaP Council (a Linked R5 of an Alliance in the NaP) may propose NaP Rules.",
  proposalOpen: (number: number): string =>
    `NaP Rules version ${number.toString()} still waits for its NaP Motion. Propose a new version once it is decided.`,
  textProblem: (problem: NapRulesTextProblem): string => TEXT_PROBLEMS[problem],
  noLeaders: "Neil could not put the NaP Rules to a NaP Motion: the server has no #nap-leaders. Ask an Officer.",
  postFailed: "Neil could not post the NaP Motion in #nap-leaders, so nothing was proposed. Try again later, or ask an Officer.",
  proposed: (number: number, motion: number, endsAt: Date): string =>
    `Neil saved NaP Rules version ${number.toString()} and opened NaP Motion #${motion.toString()} on it in #nap-leaders. The NaP Council votes until ${timestamp(endsAt, "f")} (${timestamp(endsAt, "R")}).`,
  noRules: "The NaP has no rules yet. A member of the NaP Council can propose them with `/nap rules-propose`.",
  noRulesButProposal: (number: number): string =>
    `The NaP has no rules yet. Version ${number.toString()} waits for its NaP Motion: \`/nap rules-history version:${number.toString()}\`.`,
  noSuchVersion: (number: number): string => `There is no NaP Rules version ${number.toString()}.`,

  logProposed: (memberId: MemberId, number: number, motion: number): string =>
    `NaP Council member <@${memberId}> proposed NaP Rules version ${number.toString()}, put to NaP Motion #${motion.toString()}.`,
  logNotProposed: (memberId: MemberId, reason: string): string =>
    `The NaP Rules proposed by <@${memberId}> were not saved: the NaP Motion could not be opened (${reason}).`,
  logApproved: (number: number, motion: number): string =>
    `NaP Rules version ${number.toString()} were approved by NaP Motion #${motion.toString()} and are now in effect.`,
  logRejected: (number: number, motion: number): string =>
    `NaP Rules version ${number.toString()} were rejected by NaP Motion #${motion.toString()}; the rules in effect stay.`,
  logNoAnnouncements: (number: number): string =>
    `NaP Rules version ${number.toString()} were not announced: the server has no #nap-announcements.`,
  logAnnouncementFailed: (number: number, reason: string): string =>
    `Announcing NaP Rules version ${number.toString()} in #nap-announcements failed: ${reason}`,
} as const;
