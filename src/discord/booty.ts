import { MessageFlags, type InteractionReplyOptions } from "discord.js";
import { type BootyMode, type BootyWindow, parseBootyTime, parseBootyWindow } from "../domain/booty.js";
import type { ParseResult } from "../domain/lookup-input.js";
import type { BootyAlertsStore, StoredBootyAlerts } from "../storage/booty-alerts-store.js";
import type { LinkStore } from "../storage/link-store.js";
import { parseTimeZone } from "./booty-time.js";
import { bootyAlertsMessages } from "./booty-texts.js";

/** The part of a discord.js chat-input interaction that /booty-alerts uses: who ran it, and the private reply. */
export interface BootyAlertsInteraction {
  readonly user: { readonly id: string };
  readonly options: { getString(name: string, required?: false): string | null };
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

export interface BootyAlertsContext {
  /** A Member must be Linked to record Booty Alerts. */
  readonly links: Pick<LinkStore, "linkFor">;
  readonly bootyAlerts: Pick<BootyAlertsStore, "get" | "save">;
  readonly logError: (message: string) => void;
}

/** What a Member has never recorded: Off, the whole day, in UTC. */
const WHOLE_DAY_START = 0;
const WHOLE_DAY_END = 0;
const DEFAULT_TIME_ZONE = "UTC";
const MODES: readonly BootyMode[] = ["off", "always", "online", "offline"];

/** The options the Member typed, each checked; an option left out is undefined. */
interface Typed {
  readonly mode: BootyMode | undefined;
  readonly startMinute: number | undefined;
  readonly endMinute: number | undefined;
  readonly timeZone: string | undefined;
}

/**
 * Answers /booty-alerts privately: the Booty Alerts shown when no option is given, or the Booty Alerts that the options
 * leave after the change. Options left out keep what is recorded. Invalid input is refused and nothing changes. A failed
 * read or save is logged and answered as unavailable; a failed reply is logged, never thrown.
 */
export async function handleBootyAlerts(interaction: BootyAlertsInteraction, context: BootyAlertsContext): Promise<void> {
  let content: string;
  try {
    content = answerFor(interaction, context);
  } catch (error) {
    context.logError(`Booty Alerts failed: ${errorMessage(error)}`);
    content = bootyAlertsMessages.unavailable;
  }
  try {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  } catch (error) {
    context.logError(`Replying to /booty-alerts failed: ${errorMessage(error)}`);
  }
}

function answerFor(interaction: BootyAlertsInteraction, context: BootyAlertsContext): string {
  const memberId = interaction.user.id;
  if (context.links.linkFor(memberId) === undefined) return bootyAlertsMessages.notLinked;
  const typed = readTyped(interaction);
  if (!typed.ok) return typed.refusal;
  const stored = context.bootyAlerts.get(memberId);
  const { mode, startMinute, endMinute, timeZone } = typed.value;
  if (mode === undefined && startMinute === undefined && endMinute === undefined && timeZone === undefined) {
    return bootyAlertsMessages.shown(stored);
  }
  const base: StoredBootyAlerts = stored ?? {
    mode: "off",
    window: windowOf(WHOLE_DAY_START, WHOLE_DAY_END),
    timeZone: DEFAULT_TIME_ZONE,
  };
  const next: StoredBootyAlerts = {
    mode: mode ?? base.mode,
    window: windowOf(startMinute ?? base.window.startMinute, endMinute ?? base.window.endMinute),
    timeZone: timeZone ?? base.timeZone,
  };
  context.bootyAlerts.save(memberId, next);
  return bootyAlertsMessages.recorded(next);
}

/** Checks every option the Member typed; the first one that does not read is the refusal, and nothing is recorded. */
function readTyped(
  interaction: BootyAlertsInteraction,
): { readonly ok: true; readonly value: Typed } | { readonly ok: false; readonly refusal: string } {
  const mode = optional(interaction.options.getString("mode"), parseMode);
  if (!mode.ok) return { ok: false, refusal: bootyAlertsMessages.invalidMode };
  const start = optional(interaction.options.getString("from"), parseBootyTime);
  if (!start.ok) return { ok: false, refusal: bootyAlertsMessages.invalidStart };
  const end = optional(interaction.options.getString("to"), parseBootyTime);
  if (!end.ok) return { ok: false, refusal: bootyAlertsMessages.invalidEnd };
  const timeZone = optional(interaction.options.getString("time-zone"), parseTimeZone);
  if (!timeZone.ok) return { ok: false, refusal: bootyAlertsMessages.invalidTimeZone };
  return {
    ok: true,
    value: { mode: mode.value, startMinute: start.value, endMinute: end.value, timeZone: timeZone.value },
  };
}

/** The value of an option the Member typed, read by parse; undefined when it was left out. */
function optional<T>(input: string | null, parse: (raw: string) => ParseResult<T>): ParseResult<T | undefined> {
  if (input === null) return { ok: true, value: undefined };
  return parse(input);
}

function parseMode(input: string): ParseResult<BootyMode> {
  const mode = MODES.find((candidate) => candidate === input);
  return mode === undefined ? { ok: false } : { ok: true, value: mode };
}

/** The Booty Alerts window from two minutes after midnight; both come from checked input, so the domain accepts them. */
function windowOf(startMinute: number, endMinute: number): BootyWindow {
  const window = parseBootyWindow(startMinute, endMinute);
  if (!window.ok) throw new Error(`no Booty Alerts window from ${startMinute.toString()} to ${endMinute.toString()}`);
  return window.value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
