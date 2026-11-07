import type { APIEmbed, BaseMessageOptions } from "discord.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { Event } from "./events.js";
import { CARD_COLOR, escapeText, fitTitle } from "./lookup-cards.js";
import { textWithMentions } from "./mentions.js";

/** The most guides an invitation card shows. */
const MAX_GUIDES = 10;
/** An http or https link; it does not take the punctuation that ends a sentence after it. */
const GUIDE_LINK = /https?:\/\/\S*[^\s.,;:!?)]/g;
const INVITATION_LEAD = "📅 A new Event is on. Neil has put its card below.";

/** A reminder of an Event: the start, or the Sign-up Deadline. */
export type EventReminder =
  | { readonly event: Event; readonly target: "start" }
  | { readonly event: Event; readonly target: "signup"; readonly signUpDeadline: Date };

/** Discord's Unix seconds for a moment, as <t:…> takes them. */
function unixOf(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

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
