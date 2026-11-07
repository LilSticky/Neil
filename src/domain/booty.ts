import { lastSeen } from "./alliance-overview.js";
import type { ParseResult } from "./lookup-input.js";

export type BootyMode = "off" | "always" | "online" | "offline";

/** A Booty Alerts window: start and end minute after midnight. Only parseBootyWindow makes one. */
export type BootyWindow = {
  readonly startMinute: number;
  readonly endMinute: number;
} & { readonly __brand: "BootyWindow" };

export interface BootyAlerts {
  readonly mode: BootyMode;
  readonly window: BootyWindow;
}

export interface MemberPresence {
  readonly online: boolean;
  readonly localMinute: number;
}

const MINUTES_PER_DAY = 1440;
const ONE_MINUTE_MS = 60_000;
const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isMinuteOfDay(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;
}

export function parseBootyWindow(startMinute: number, endMinute: number): ParseResult<BootyWindow> {
  if (!isMinuteOfDay(startMinute) || !isMinuteOfDay(endMinute)) return { ok: false };
  return { ok: true, value: { startMinute, endMinute } as BootyWindow };
}

/** Equal start and end cover the whole day; a start after the end runs over midnight. */
export function isInsideBootyWindow(window: BootyWindow, minute: number): boolean {
  const { startMinute, endMinute } = window;
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute;
  return minute >= startMinute || minute < endMinute;
}

/** Reads an HH:MM time as the minute after midnight. */
export function parseBootyTime(input: string): ParseResult<number> {
  const match = HH_MM_PATTERN.exec(input);
  if (match === null) return { ok: false };
  const [, hours, minutes] = match;
  if (hours === undefined || minutes === undefined) return { ok: false };
  return { ok: true, value: Number(hours) * 60 + Number(minutes) };
}

export function isBootyMatch(bootyAlerts: BootyAlerts, presence: MemberPresence): boolean {
  if (bootyAlerts.mode === "off") return false;
  if (!isInsideBootyWindow(bootyAlerts.window, presence.localMinute)) return false;
  switch (bootyAlerts.mode) {
    case "always":
      return true;
    case "online":
      return presence.online;
    case "offline":
      return !presence.online;
  }
}

/** The game's reading of a Member on the roster: its online flag and its Last Online, each undefined when not given. */
export interface GamePresence {
  readonly online: boolean | undefined;
  readonly lastOnlineAt: Date | undefined;
}

/**
 * Whether a Member counts as online for a Booty Call: Discord shows them not offline, or the game does, by the rule of
 * `lastSeen` (a Player without a Last Online is online now). Without any game reading, Discord alone decides.
 */
export function isBootyOnline(game: GamePresence | undefined, discordOnline: boolean): boolean {
  if (discordOnline) return true;
  return game !== undefined && lastSeen(game).kind === "online";
}

export function isConfirmationExpired(requestedAt: number, now: number): boolean {
  return now - requestedAt >= ONE_MINUTE_MS;
}

export function isBootyCallCoolingDown(calledAt: number, now: number): boolean {
  return now - calledAt < ONE_MINUTE_MS;
}
