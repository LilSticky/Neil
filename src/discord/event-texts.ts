import type { APIEmbed, BaseMessageOptions } from "discord.js";
import type { DuelDay, DuelPlanEntry } from "../domain/duel-plan.js";
import type { MemberId } from "../domain/rank-approval.js";
import { nextServerReset } from "../domain/server-time.js";
import type { Event } from "./events.js";
import { CARD_COLOR, escapeText, fitTitle } from "./lookup-cards.js";
import { textWithMentions } from "./mentions.js";
import { unixOf } from "./timestamps.js";

/** The most guides an invitation card shows. */
const MAX_GUIDES = 10;
/** An http or https link; it does not take the punctuation that ends a sentence after it. */
const GUIDE_LINK = /https?:\/\/\S*[^\s.,;:!?)]/g;
const INVITATION_LEAD = "📅 A new Event is on. Neil has put its card below.";

/** A reminder of an Event: the start, or the Sign-up Deadline. */
export type EventReminder =
  | { readonly event: Event; readonly target: "start" }
  | { readonly event: Event; readonly target: "signup"; readonly signUpDeadline: Date };

function discordEventLinkOf(guildId: string, event: Event): string {
  return `https://discord.com/events/${guildId}/${event.id}`;
}

/** The http and https links of an Event's description, the first 10 of them. */
function guidesOf(description: string): string[] {
  return [...description.matchAll(GUIDE_LINK)].map((match) => match[0]).slice(0, MAX_GUIDES);
}

/** The invitation card of an Event, mentioning the Members who are to be invited, in chunks of 80. */
export function eventInvitationMessages(guildId: string, event: Event, mentioned: readonly MemberId[]): BaseMessageOptions[] {
  const start = unixOf(event.start);
  const card: APIEmbed = {
    color: CARD_COLOR,
    title: fitTitle(escapeText(event.name)),
    description: `Starts <t:${start}:F> (<t:${start}:R>).\n${discordEventLinkOf(guildId, event)}`,
    fields: guidesOf(event.description).map((guide) => ({ name: "Guide", value: guide })),
  };
  return textWithMentions(INVITATION_LEAD, mentioned, [card]);
}

/** The reminder of an Event for the Members who are interested, in chunks of 80. */
export function eventReminderMessages(guildId: string, reminder: EventReminder, mentioned: readonly MemberId[]): BaseMessageOptions[] {
  return textWithMentions(reminderTextOf(guildId, reminder), mentioned);
}

function reminderTextOf(guildId: string, reminder: EventReminder): string {
  const { event } = reminder;
  const name = `**${escapeText(event.name)}**`;
  const link = discordEventLinkOf(guildId, event);
  if (reminder.target === "start") return `⏰ ${name} starts <t:${unixOf(event.start)}:R>. Event: ${link}`;
  const deadline = unixOf(reminder.signUpDeadline);
  return `📝 Sign-up for ${name} closes <t:${deadline}:F> (<t:${deadline}:R>). Event: ${link}`;
}

/** The Duel days as the Duel Plan card names them. */
const DUEL_DAY_NAMES: Readonly<Record<DuelDay, string>> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

/** The Duel day as people read it: Monday to Saturday. */
export function duelDayName(day: DuelDay): string {
  return DUEL_DAY_NAMES[day];
}

/**
 * The Duel Plan card of a Duel day: what scores today, what to save for later (left out when empty), and when the Duel
 * day ends, as a Discord timestamp each reader sees in their own clock. It mentions nobody.
 */
export function duelPlanMessage(day: DuelDay, entry: DuelPlanEntry, now: Date): BaseMessageOptions {
  const end = unixOf(nextServerReset(now));
  const fields = [{ name: "Scores today", value: entry.scores.trim() }];
  const save = entry.save.trim();
  if (save.length > 0) fields.push({ name: "Save for later", value: save });
  const card: APIEmbed = {
    color: CARD_COLOR,
    title: `Alliance Duel: ${duelDayName(day)}`,
    description: `This Duel day ends <t:${end}:t> (<t:${end}:R>).`,
    fields,
  };
  return { embeds: [card], allowedMentions: { parse: [] } };
}
