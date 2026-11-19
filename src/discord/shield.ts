import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { allianceRoleName, tagOfAllianceRole } from "../domain/managed-roles.js";
import { isOfficer } from "../domain/officer.js";
import { deadlineOfWeek, isShieldWeek, shieldDeadlineOf, shieldWeekOf } from "../domain/shield.js";
import type { LinkStore } from "../storage/link-store.js";
import type { ShieldStore } from "../storage/shield-store.js";
import { ALLIANCE_CHAT_CHANNEL, SHIELD_PREFIX, shieldMessages } from "./shield-texts.js";

/** The channel a Shielded button is pressed in: its name, and the name of its category (an Alliance's role name). */
export interface ShieldChannel {
  readonly name: string;
  readonly categoryName: string | undefined;
}

/** A press of the Shielded button: its custom id, who pressed it and where, their roles by name, and the private reply. */
export interface ShieldPress {
  readonly customId: string;
  readonly user: { readonly id: string };
  readonly channel: ShieldChannel | undefined;
  memberRoleNames(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** The /shield-reminders command: who ran it, the reminders option, and the private reply. */
export interface ShieldRemindersInteraction {
  readonly user: { readonly id: string };
  readonly options: { getString(name: string, required?: false): string | null };
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** The /kvk-week command: who ran it, the subcommand, their role ids, and the private reply. */
export interface KvkWeekInteraction {
  readonly user: { readonly id: string };
  readonly options: { getSubcommand(): string };
  memberRoleIds(): readonly string[];
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface ShieldDeps {
  readonly shield: Pick<ShieldStore, "markOf" | "mark" | "unmark" | "confirm" | "isOff" | "setOff">;
  readonly links: Pick<LinkStore, "linkFor">;
  readonly officerRoleIds: readonly string[];
  readonly now: () => Date;
  /** A line in #neil-log, with mentions off. */
  readonly log: (line: string) => Promise<void>;
  readonly logError: (line: string) => void;
}

export interface ShieldCommands {
  /** The Shielded button: a Linked Member of the Alliance records their Shield Confirmation. */
  onPress(press: ShieldPress): Promise<void>;
  /** /shield-reminders: a Linked Member shows or switches their Shield Reminders. */
  onReminders(interaction: ShieldRemindersInteraction): Promise<void>;
  /** /kvk-week: an Officer marks, unmarks or shows the week of the next Shield Deadline. */
  onKvkWeek(interaction: KvkWeekInteraction): Promise<void>;
}

const WEEK_ID = new RegExp(`^${SHIELD_PREFIX}(.+)$`);

/** The custom id of the Shielded button of a week. */
export function shieldButtonId(week: string): string {
  return `${SHIELD_PREFIX}${week}`;
}

/**
 * The Shielded button, /shield-reminders and /kvk-week (slice 045). Every answer is private. A failed read or write is
 * logged and answered as unavailable; a failed reply is logged, never thrown.
 */
export function createShieldCommands(deps: ShieldDeps): ShieldCommands {
  async function reply(
    interaction: { reply(options: InteractionReplyOptions): Promise<unknown> },
    what: string,
    content: string,
  ): Promise<void> {
    try {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    } catch (error) {
      deps.logError(`Replying to ${what} failed: ${errorMessage(error)}`);
    }
  }

  function pressAnswer(press: ShieldPress): string {
    const week = WEEK_ID.exec(press.customId)?.[1];
    if (week === undefined || !isShieldWeek(week)) return shieldMessages.press.invalid;
    const channel = press.channel;
    const tag = channel?.categoryName === undefined ? undefined : tagOfAllianceRole(channel.categoryName);
    if (channel?.name !== ALLIANCE_CHAT_CHANNEL || tag === undefined) return shieldMessages.press.notAllowed;
    const memberId = press.user.id;
    if (deps.links.linkFor(memberId) === undefined) return shieldMessages.press.notAllowed;
    if (!press.memberRoleNames().includes(allianceRoleName(tag))) return shieldMessages.press.notAllowed;
    const deadline = deadlineOfWeek(week);
    const now = deps.now();
    if (now.getTime() >= deadline.getTime()) return shieldMessages.press.passed;
    if (deps.shield.markOf(week) === undefined) return shieldMessages.press.notKvkWeek;
    return deps.shield.confirm(week, memberId, now) ? shieldMessages.press.recorded(deadline) : shieldMessages.press.already;
  }

  function remindersAnswer(interaction: ShieldRemindersInteraction): string {
    const memberId = interaction.user.id;
    if (deps.links.linkFor(memberId) === undefined) return shieldMessages.reminders.notLinked;
    const choice = interaction.options.getString("reminders");
    if (choice === null) return shieldMessages.reminders.shown(deps.shield.isOff(memberId));
    if (choice !== "on" && choice !== "off") return shieldMessages.reminders.invalid;
    const off = choice === "off";
    deps.shield.setOff(memberId, off);
    return shieldMessages.reminders.recorded(off);
  }

  async function kvkWeekAnswer(interaction: KvkWeekInteraction): Promise<string> {
    if (!isOfficer(interaction.memberRoleIds(), deps.officerRoleIds)) return shieldMessages.kvkWeek.notAllowed;
    const now = deps.now();
    const deadline = shieldDeadlineOf(now);
    const week = shieldWeekOf(deadline);
    const officerId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "show") return shieldMessages.kvkWeek.shown(deadline, deps.shield.markOf(week) !== undefined);
    if (subcommand === "mark") {
      if (!deps.shield.mark(week, now, officerId)) return shieldMessages.kvkWeek.alreadyMarked(deadline);
      await logLine(shieldMessages.kvkWeek.logMarked(officerId, week));
      return shieldMessages.kvkWeek.marked(deadline);
    }
    if (subcommand === "unmark") {
      if (!deps.shield.unmark(week)) return shieldMessages.kvkWeek.notMarked(deadline);
      await logLine(shieldMessages.kvkWeek.logUnmarked(officerId, week));
      return shieldMessages.kvkWeek.unmarked(deadline);
    }
    throw new Error(`unknown /kvk-week subcommand ${subcommand}`);
  }

  async function logLine(line: string): Promise<void> {
    try {
      await deps.log(line);
    } catch (error) {
      deps.logError(`Logging a KvK Week failed: ${errorMessage(error)}`);
    }
  }

  return {
    async onPress(press) {
      let content: string;
      try {
        content = pressAnswer(press);
      } catch (error) {
        deps.logError(`Recording a Shield Confirmation failed: ${errorMessage(error)}`);
        content = shieldMessages.reminders.unavailable;
      }
      await reply(press, "the Shielded button", content);
    },
    async onReminders(interaction) {
      let content: string;
      try {
        content = remindersAnswer(interaction);
      } catch (error) {
        deps.logError(`Shield Reminders failed: ${errorMessage(error)}`);
        content = shieldMessages.reminders.unavailable;
      }
      await reply(interaction, "/shield-reminders", content);
    },
    async onKvkWeek(interaction) {
      let content: string;
      try {
        content = await kvkWeekAnswer(interaction);
      } catch (error) {
        deps.logError(`/kvk-week failed: ${errorMessage(error)}`);
        content = shieldMessages.kvkWeek.unavailable;
      }
      await reply(interaction, "/kvk-week", content);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
