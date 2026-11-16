import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIEmbed,
  type APIEmbedField,
} from "discord.js";
import {
  MAX_ASSIGNMENTS,
  MAX_CUSTOM_OBJECTIVES,
  MAX_NOTES_LENGTH,
  MAX_PHASES,
  MAX_TASK_LENGTH,
  objectivesOf,
  onPlan,
  type Assignment,
  type ConfirmRefusal,
  type PlanConfirmation,
  type Raid,
  type RaidRefusal,
} from "../domain/raid.js";
import { serverClockOf } from "../domain/server-time.js";
import { timestamp } from "./timestamps.js";

/** The custom id prefix of the confirmation card's button. */
export const RAID_PREFIX = "raid:";

/** The custom id of the confirmation card's button for a Raid. */
export function confirmButtonId(raidId: string): string {
  return `${RAID_PREFIX}confirm:${raidId}`;
}

/** The Raid id a confirm button names; undefined when the custom id is not one. */
export function raidIdOfButton(customId: string): string | undefined {
  return /^raid:confirm:(\d{4}-\d{2}-\d{2})$/.exec(customId)?.[1];
}

/** Discord's embed limits (documentation/DISCORD-PLATFORM.md). */
const FIELD_VALUE_LIMIT = 1024;
const FIELD_LIMIT = 25;
const EMBED_TOTAL_LIMIT = 6000;
const DESCRIPTION_LIMIT = 4096;

const PLAN_COLOR = 0xb02e26;
const CANCELLED_COLOR = 0x808080;

/** A moment as Server Time and as a Discord timestamp, for content, descriptions and field values only. */
export function timeLine(moment: Date): string {
  return `${serverClockOf(moment)} Server Time, ${timestamp(moment, "f")} (${timestamp(moment, "R")})`;
}

function assignmentLine(assignment: Assignment): string {
  const task = assignment.task === undefined ? "" : ` (${assignment.task})`;
  return `[${assignment.tag}] -> ${assignment.objective}${task}`;
}

/** The plan card: the Raid start, the Objectives, each Phase with its Assignments, the whole-Raid Assignments and the notes. */
export function planCard(raid: Raid): APIEmbed {
  const { plan, state } = raid;
  const description = [`Raid start: Saturday ${timeLine(raid.start)}`];
  if (state.kind === "published" && state.amendedAt !== undefined) description.push(`Amended ${timestamp(state.amendedAt, "f")}`);
  if (state.kind === "cancelled") {
    description.unshift(`**Cancelled** ${timestamp(state.cancelledAt, "f")}: this Raid will not take place.`);
  }
  const fields: APIEmbedField[] = [{ name: "Objectives", value: objectivesOf(plan).join("\n") }];
  for (const phase of plan.phases) {
    const lines = plan.assignments.filter((assignment) => assignment.phase === phase.name).map(assignmentLine);
    fields.push({
      name: `Phase: ${phase.name}`,
      value: [timeLine(phase.at), ...(lines.length === 0 ? ["No Assignments"] : lines)].join("\n"),
    });
  }
  const wholeRaid = plan.assignments.filter((assignment) => assignment.phase === undefined).map(assignmentLine);
  if (wholeRaid.length > 0) fields.push({ name: "Whole Raid", value: wholeRaid.join("\n") });
  if (plan.notes.length > 0) fields.push({ name: "Notes", value: plan.notes });
  return {
    title: state.kind === "cancelled" ? "Battle Plan (cancelled)" : "Battle Plan",
    color: state.kind === "cancelled" ? CANCELLED_COLOR : PLAN_COLOR,
    description: description.join("\n"),
    fields,
  };
}

/** Whether an embed keeps within Discord's limits: 25 fields, 1024 per field value, 4096 description, 6000 in all. */
export function fitsDiscord(embed: APIEmbed): boolean {
  const fields = embed.fields ?? [];
  const description = embed.description ?? "";
  const total =
    (embed.title ?? "").length +
    description.length +
    (embed.footer?.text ?? "").length +
    fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
  return (
    fields.length <= FIELD_LIMIT &&
    fields.every((field) => field.value.length >= 1 && field.value.length <= FIELD_VALUE_LIMIT) &&
    description.length <= DESCRIPTION_LIMIT &&
    total <= EMBED_TOTAL_LIMIT
  );
}

/** Lines as fields of one name, split so no value passes Discord's limit; later ones are named "(continued)". */
function linesAsFields(name: string, lines: readonly string[]): APIEmbedField[] {
  const values: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current.length === 0 ? line : `${current}\n${line}`;
    if (next.length > FIELD_VALUE_LIMIT && current.length > 0) {
      values.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current.length > 0) values.push(current);
  return values.map((value, index) => ({ name: index === 0 ? name : `${name} (continued)`, value }));
}

function confirmationLine(tag: string, confirmation: PlanConfirmation | undefined, missing: string): string {
  return confirmation === undefined
    ? `[${tag}]: ${missing}`
    : `[${tag}]: confirmed by <@${confirmation.memberId}> ${timestamp(confirmation.at, "f")}`;
}

/** The confirmation card: who confirmed for each on-plan Alliance, or is missing, then the Alliances asked but not on the plan. */
export function confirmationCard(
  raid: Raid,
  confirmations: readonly PlanConfirmation[],
  allianceTags: readonly string[],
  confirmationDeadline: Date,
): APIEmbed {
  const byTag = new Map(confirmations.map((confirmation) => [confirmation.tag, confirmation]));
  const planned = onPlan(raid);
  const offPlan = [...new Set([...allianceTags, ...confirmations.map((confirmation) => confirmation.tag)])]
    .filter((tag) => !planned.includes(tag))
    .sort((a, b) => a.localeCompare(b));
  const cancelled = raid.state.kind === "cancelled";
  const description = cancelled
    ? `**Cancelled**: the Raid of Saturday ${timeLine(raid.start)} will not take place. Nothing to confirm.`
    : [
        `Raid start: Saturday ${timeLine(raid.start)}`,
        `Confirmation Deadline: ${timestamp(confirmationDeadline, "f")} (${timestamp(confirmationDeadline, "R")})`,
        "R5 or R4: read the Battle Plan in #kvk-announcements, then press **Read and confirmed** for your Alliance.",
      ].join("\n");
  const offPlanFields =
    offPlan.length === 0
      ? []
      : linesAsFields(
          "Asked, not on the plan",
          offPlan.map((tag) => confirmationLine(tag, byTag.get(tag), "not confirmed")),
        );
  return {
    title: "Plan Confirmations",
    color: cancelled ? CANCELLED_COLOR : PLAN_COLOR,
    description,
    fields: [
      ...linesAsFields(
        "On the plan",
        planned.length === 0 ? ["None"] : planned.map((tag) => confirmationLine(tag, byTag.get(tag), "**missing**")),
      ),
      ...offPlanFields,
    ],
  };
}

/** The "Read and confirmed" button; disabled once the Raid is cancelled. */
export function confirmRow(raid: Raid): APIActionRowComponent<APIButtonComponentWithCustomId> {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Success,
        label: "Read and confirmed",
        custom_id: confirmButtonId(raid.id),
        disabled: raid.state.kind === "cancelled",
      },
    ],
  };
}

function tagList(tags: readonly string[]): string {
  return tags.map((tag) => `[${tag}]`).join(", ");
}

/** The answer to a refused change of the plan. */
export function refusalText(refusal: RaidRefusal): string {
  switch (refusal.kind) {
    case "cancelled":
      return "This week's Raid is cancelled; its plan can't change any more.";
    case "invalid-name":
      return "Give a name of 1 to 50 characters.";
    case "objective-exists":
      return `The plan already has the Objective "${refusal.name}".`;
    case "too-many-objectives":
      return `The plan already has ${MAX_CUSTOM_OBJECTIVES.toString()} Objectives of your own. Remove one first.`;
    case "fixed-objective":
      return `"${refusal.name}" is one of the fixed Objectives and stays on every plan.`;
    case "unknown-objective":
      return `The plan has no Objective "${refusal.name}".`;
    case "still-assigned":
      return `"${refusal.name}" still has Assignments: ${refusal.assignments.map(assignmentLine).join(", ")}. Unassign them first.`;
    case "invalid-time":
      return "Write the time as HH:MM in Server Time, e.g. 20:30.";
    case "phase-before-start":
      return `A Phase can't start before the Raid: ${timeLine(refusal.start)}.`;
    case "phase-exists":
      return `The plan already has the Phase "${refusal.name}".`;
    case "too-many-phases":
      return `The plan already has ${MAX_PHASES.toString()} Phases. Remove one first.`;
    case "unknown-phase":
      return `The plan has no Phase "${refusal.name}".`;
    case "unknown-alliance":
      return `"${refusal.tag}" is not an Alliance of the Home Kingdom (no [TAG] role on the server).`;
    case "task-too-long":
      return `A task is at most ${MAX_TASK_LENGTH.toString()} characters.`;
    case "assignment-exists":
      return "That Alliance already has this Objective for this Phase.";
    case "too-many-assignments":
      return `The plan already has ${MAX_ASSIGNMENTS.toString()} Assignments. Remove one first.`;
    case "no-such-assignment":
      return "The plan has no such Assignment.";
    case "notes-too-long":
      return `Notes are at most ${MAX_NOTES_LENGTH.toString()} characters.`;
    case "nothing-to-publish":
      return "Publishing needs at least one Phase and one Assignment.";
    case "start-passed":
      return "This week's Raid has already started; it can't be published any more.";
  }
}

/** The answer to a press of the confirm button that is not taken. */
export function confirmRefusalText(refusal: ConfirmRefusal): string {
  switch (refusal.kind) {
    case "not-published":
      return "This Battle Plan is not published.";
    case "cancelled":
      return "This Raid is cancelled; there is nothing to confirm.";
    case "already-confirmed":
      return `[${refusal.confirmation.tag}] has already confirmed: <@${refusal.confirmation.memberId}> ${timestamp(refusal.confirmation.at, "f")}.`;
  }
}

export const raidMessages = {
  notSetUp: "Raid planning is not set up on this server.",
  notWarCouncil: "Only the War Council plans the Raid. Neil has changed nothing.",
  unavailable: "Raid planning is not available right now. Please tell an Officer.",
  notLeader:
    "Only an R5 or R4 of an Alliance, Linked with that rank and holding its one Alliance role, confirms the Battle Plan.",
  confirmed: (tag: string): string => `Thank you: [${tag}] has confirmed the Battle Plan.`,
  tooLong: "That would make the Battle Plan longer than Discord allows in one card. Neil has changed nothing.",
  missingChannel: (name: string): string =>
    `The server has no #${name}, so Neil could not post there. Run the server setup, then publish again.`,
  published: "Neil has published the Battle Plan in #kvk-announcements and asked the R5s and R4s in #kvk-leaders.",
  amended: "Neil has updated the posted Battle Plan and the confirmation card. The confirmations stay.",
  cancelled: "Neil has cancelled this week's Raid. No chases, deadlines or reminders go out any more.",
  confirmationAsk: (start: Date): string =>
    `**Battle Plan published** for the Raid of Saturday ${timeLine(start)}. R5s and R4s of every Alliance: read it in #kvk-announcements and confirm with the button.`,
  cancelledLine: (start: Date): string => `**The Raid of Saturday ${timeLine(start)} is cancelled.** No reminders follow.`,
  planDeadline: (deadline: Date, start: Date): string =>
    `War Council: no Battle Plan is published yet. The Plan Deadline is ${timestamp(deadline, "f")}; the Raid starts Saturday ${timeLine(start)}. Use /raid-plan.`,
  chase: (tags: readonly string[], deadline: Date): string =>
    `Plan Confirmation still missing from ${tagList(tags)}. R5 or R4: read the Battle Plan in #kvk-announcements and press **Read and confirmed** before ${timestamp(deadline, "f")} (${timestamp(deadline, "R")}).`,
  deadlineMissing: (tags: readonly string[]): string =>
    `War Council: the Confirmation Deadline has come. No Plan Confirmation from ${tagList(tags)}.`,
  deadlineAllConfirmed: "War Council: the Confirmation Deadline has come. Every Alliance on the plan has confirmed.",
  reminder: (tag: string, lines: readonly string[], phaseName: string | undefined): string =>
    [
      phaseName === undefined
        ? `**Raid Reminder** for [${tag}]: the Raid starts soon.`
        : `**Raid Reminder** for [${tag}]: Phase ${phaseName} starts now.`,
      ...lines,
    ].join("\n"),
};

/** The lines of a Raid Reminder: the Alliance's Assignments, each with its Phase time or the whole Raid. */
export function reminderLines(raid: Raid, assignments: readonly Assignment[]): string[] {
  return assignments.map((assignment) => {
    const phase = raid.plan.phases.find((candidate) => candidate.name === assignment.phase);
    const when = phase === undefined ? "whole Raid" : `${phase.name}, ${timeLine(phase.at)}`;
    return `- ${assignmentLine(assignment)}: ${when}`;
  });
}

/** The state of the Raid and its deadlines, for the private preview. */
export function stateLine(raid: Raid, planDeadline: Date, confirmationDeadline: Date): string {
  const state = raid.state;
  let status: string;
  if (state.kind === "draft") status = "Draft, not published.";
  else if (state.kind === "published") {
    const amended = state.amendedAt === undefined ? "" : `, amended ${timestamp(state.amendedAt, "f")}`;
    status = `Published ${timestamp(state.publishedAt, "f")}${amended}.`;
  } else status = `Cancelled ${timestamp(state.cancelledAt, "f")}.`;
  return `${status} Plan Deadline ${timestamp(planDeadline, "f")}, Confirmation Deadline ${timestamp(confirmationDeadline, "f")}.`;
}
