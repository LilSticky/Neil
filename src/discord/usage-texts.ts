import type { APIEmbed } from "discord.js";
import { nextReset } from "../domain/daily-quota.js";
import { timeLeft, utcTime } from "./lookup-cards.js";

/** The Link note: how to look up, the Daily Allowance and /usage. It ends the Link message and is sent privately after a Link. */
export const LINK_NOTE =
  "You can look up Players and Alliances with /player and /alliance. Each Member has a Daily Allowance of Game API requests; cached answers are free. /usage shows yours.";

/** What the /usage reply tells: the caller's requests today, the Daily Allowance, whether the caller is an Officer, and the clock. */
export interface UsageReplyInput {
  readonly used: number;
  readonly allowance: number;
  readonly officer: boolean;
  readonly now: Date;
}

/**
 * The /usage reply: the caller's requests against the Daily Allowance (an Officer is not limited), what costs a request,
 * that Onboarding is never charged, and when the usage resets with the time left until it.
 */
export function usageReply({ used, allowance, officer, now }: UsageReplyInput): string {
  const summary = officer
    ? `Your lookups today: ${used.toString()} Game API requests used. Officers are not limited.`
    : `Your lookups today: ${used.toString()} of ${allowance.toString()} Game API requests used.`;
  return [
    summary,
    "A lookup costs a request when Neil has not answered it in the last 10 minutes; cached answers are free.",
    "Onboarding is never charged.",
    `Resets at 00:00 UTC (${timeLeft(nextReset(now), now)}).`,
  ].join("\n");
}

/**
 * The private refusal of a lookup that the Member's Daily Allowance kept from the Game API: the allowance is spent, cached
 * answers still work, and the reset with the time left until it.
 */
export function refusalMessage(resetsAt: Date, allowance: number, now: Date): string {
  const used = allowance.toString();
  return `Your Daily Allowance is spent: ${used} of ${used} Game API requests used today. Cached answers still work. It resets at ${utcTime(resetsAt)} (${timeLeft(resetsAt, now)}).`;
}

/** What the usage line tells: the Member's requests today, the Daily Allowance, and whether the Member is an Officer. */
export interface UsageLineInput {
  readonly used: number;
  readonly allowance: number;
  readonly officer: boolean;
}

/**
 * The usage line a lookup's answer ends with: the requests the Member made today against the Daily Allowance, or for an
 * Officer, the requests alone, since an Officer is not limited.
 */
export function usageLine({ used, allowance, officer }: UsageLineInput): string {
  const count = used.toString();
  return officer
    ? `${count} Game API requests used today · Officers are not limited · cached answers are free · resets 00:00 UTC`
    : `${count} of ${allowance.toString()} Game API requests used today · cached answers are free · resets 00:00 UTC`;
}

/** The part of a reply that carries text and embeds, which a usage line can be added to. */
interface UsageCarrier {
  readonly content?: string;
  readonly embeds?: readonly APIEmbed[];
}

/**
 * Adds the usage line to a reply: last in the footer of its first embed, or at the end of the text when it has no embed.
 * The message it is given is not changed.
 */
export function withUsage<M extends UsageCarrier>(message: M, line: string): M {
  const [first, ...rest] = message.embeds ?? [];
  if (first !== undefined) {
    const footer = first.footer?.text;
    const text = footer === undefined ? line : `${footer} · ${line}`;
    return { ...message, embeds: [{ ...first, footer: { ...first.footer, text } }, ...rest] };
  }
  const content = message.content;
  return { ...message, content: content === undefined ? line : `${content}\n${line}` };
}
