import type { APIEmbed, BaseMessageOptions } from "discord.js";
import { describe, expect, test } from "vitest";
import type { Event } from "./events.js";
import { eventInvitationMessages, eventReminderMessages } from "./event-texts.js";

/** Discord's limits the texts must fit: a message's content, an embed field's value. */
const CONTENT_LIMIT = 2000;
const FIELD_VALUE_LIMIT = 1024;

/** Mentions per message, as the texts chunk them. */
const MENTIONS_PER_MESSAGE = 80;

/** Two Members, as Discord gives their ids. */
const ALICE = "1111111111111111111";
const BOB = "2222222222222222222";

const GUILD_ID = "1000000000000000003";
const EVENT_ID = "1100000000000000001";
const DISCORD_EVENT_LINK = `https://discord.com/events/${GUILD_ID}/${EVENT_ID}`;

/** 2026-11-14 19:00 UTC, the start of the Event. */
const START = new Date(Date.UTC(2026, 10, 14, 19, 0));
/** 2026-11-14 17:00 UTC, two hours before the start: the Sign-up Deadline. */
const SIGN_UP_DEADLINE = new Date(Date.UTC(2026, 10, 14, 17, 0));

function eventOf(overrides: Partial<Event> = {}): Event {
  return {
    id: EVENT_ID,
    name: "AD round 3",
    start: START,
    description: "Bring gear. Guide: https://example.com/ad-round-3",
    status: "scheduled",
    creatorId: "1100000000000000002",
    ...overrides,
  };
}

/** Discord's Unix seconds for a moment, as <t:…> takes them. */
function unixOf(moment: Date): number {
  return Math.floor(moment.getTime() / 1000);
}

/** Member ids as Discord gives them: 19 digits, distinct. */
function mentionIdsOf(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `1${(index + 1).toString().padStart(18, "0")}`);
}

/** The first embed of a message, as plain JSON. Builders are read through toJSON. */
function embedOf(message: BaseMessageOptions): APIEmbed {
  const [embed] = message.embeds ?? [];
  if (embed === undefined) throw new Error("the message carries no embed");
  return "toJSON" in embed ? embed.toJSON() : embed;
}

function contentOf(message: BaseMessageOptions): string {
  return message.content ?? "";
}

function usersOf(message: BaseMessageOptions): readonly string[] {
  return message.allowedMentions?.users ?? [];
}

/** How many mentions a message's content carries. */
function mentionCountOf(message: BaseMessageOptions): number {
  return contentOf(message).split("<@").length - 1;
}

/** Every character a message's embeds carry, as JSON. */
function embedTextOf(message: BaseMessageOptions): string {
  return JSON.stringify(message.embeds ?? []);
}

describe("eventInvitationMessages", () => {
  test("posts a card with the Event's name, its start in both Discord formats and a link to the Discord event", () => {
    const [card] = eventInvitationMessages(GUILD_ID, eventOf(), []);

    if (card === undefined) throw new Error("no card was posted");
    const embed = embedOf(card);
    expect(embed.title).toContain("AD round 3");
    const text = embedTextOf(card);
    expect(text).toContain(`<t:${unixOf(START).toString()}:F>`);
    expect(text).toContain(`<t:${unixOf(START).toString()}:R>`);
    expect(text).toContain(DISCORD_EVENT_LINK);
  });

  test("shows the http and https links of the description as guides, and no other links", () => {
    const description = "Guide: https://example.com/ad-round-3 and map http://example.org/map. Not a link: ftp://example.net/x";

    const [card] = eventInvitationMessages(GUILD_ID, eventOf({ description }), []);

    if (card === undefined) throw new Error("no card was posted");
    const text = embedTextOf(card);
    expect(text).toContain("https://example.com/ad-round-3");
    expect(text).toContain("http://example.org/map");
    expect(text).not.toContain("ftp://example.net/x");
  });

  test("shows at most 10 guides, the first 10 in the description", () => {
    const links = Array.from({ length: 11 }, (_, index) => `https://example.com/guide-${(index + 1).toString()}`);

    const [card] = eventInvitationMessages(GUILD_ID, eventOf({ description: links.join(" ") }), []);

    if (card === undefined) throw new Error("no card was posted");
    const text = embedTextOf(card);
    expect(text).toContain("https://example.com/guide-10");
    expect(text).not.toContain("https://example.com/guide-11");
  });

  test("shows no guides field when the description has no links", () => {
    const [card] = eventInvitationMessages(GUILD_ID, eventOf({ description: "Bring gear and friends." }), []);

    if (card === undefined) throw new Error("no card was posted");
    expect(embedOf(card).fields ?? []).toHaveLength(0);
  });

  test("keeps every guide field value within Discord's 1,024-character limit, even with ten long links", () => {
    const longLinks = Array.from({ length: 10 }, (_, index) => `https://guides.example/${(index + 1).toString()}/${"a".repeat(180)}`);

    const [card] = eventInvitationMessages(GUILD_ID, eventOf({ description: longLinks.join(" ") }), []);

    if (card === undefined) throw new Error("no card was posted");
    for (const field of embedOf(card).fields ?? []) {
      expect(field.value.length).toBeLessThanOrEqual(FIELD_VALUE_LIMIT);
    }
    expect(embedTextOf(card)).toContain("https://guides.example/1/");
  });

  test("mentions each Member in the card's content, with allowedMentions exactly those Members and no parsing", () => {
    const [card] = eventInvitationMessages(GUILD_ID, eventOf(), [ALICE, BOB]);

    if (card === undefined) throw new Error("no card was posted");
    expect(contentOf(card)).toContain(`<@${ALICE}>`);
    expect(contentOf(card)).toContain(`<@${BOB}>`);
    expect(card.allowedMentions).toEqual({ parse: [], users: [ALICE, BOB] });
  });

  test("chunks mentions 80 to a message: the first chunk rides on the card, the rest follow as mention-only messages", () => {
    const mentioned = mentionIdsOf(170);

    const messages = eventInvitationMessages(GUILD_ID, eventOf(), mentioned);

    expect(messages.map(mentionCountOf)).toEqual([80, 80, 10]);
    expect(messages.map(usersOf)).toEqual([
      mentioned.slice(0, MENTIONS_PER_MESSAGE),
      mentioned.slice(80, 160),
      mentioned.slice(160),
    ]);
    const [card, ...followUps] = messages;
    if (card === undefined) throw new Error("no card was posted");
    expect(card.embeds).toHaveLength(1);
    for (const followUp of followUps) {
      expect(followUp.allowedMentions).toEqual({ parse: [], users: usersOf(followUp) });
    }
  });

  test("posts the card alone, with no mentions allowed, when nobody is to be mentioned", () => {
    const messages = eventInvitationMessages(GUILD_ID, eventOf(), []);

    expect(messages).toHaveLength(1);
    const [card] = messages;
    if (card === undefined) throw new Error("no card was posted");
    expect(contentOf(card)).not.toContain("<@");
    expect(card.allowedMentions).toEqual({ parse: [], users: [] });
  });

  test("keeps the card's content within Discord's 2,000-character limit with 80 mentions of 19-digit ids", () => {
    const messages = eventInvitationMessages(GUILD_ID, eventOf({ name: "A".repeat(100) }), mentionIdsOf(MENTIONS_PER_MESSAGE));

    for (const message of messages) {
      expect(contentOf(message).length).toBeLessThanOrEqual(CONTENT_LIMIT);
    }
  });
});

describe("eventReminderMessages", () => {
  test("a start reminder says the Event starts at <t:…:R>, and links the Discord event", () => {
    const [reminder] = eventReminderMessages(GUILD_ID, { event: eventOf(), target: "start" }, []);

    if (reminder === undefined) throw new Error("no reminder was posted");
    expect(contentOf(reminder)).toContain("AD round 3");
    expect(contentOf(reminder)).toContain(`starts <t:${unixOf(START).toString()}:R>`);
    expect(contentOf(reminder)).toContain(DISCORD_EVENT_LINK);
  });

  test("a Sign-up reminder gives the Sign-up Deadline as <t:…:F> and <t:…:R>, and links the Discord event", () => {
    const [reminder] = eventReminderMessages(
      GUILD_ID,
      { event: eventOf(), target: "signup", signUpDeadline: SIGN_UP_DEADLINE },
      [],
    );

    if (reminder === undefined) throw new Error("no reminder was posted");
    const deadline = unixOf(SIGN_UP_DEADLINE).toString();
    expect(contentOf(reminder)).toContain("Sign-up");
    expect(contentOf(reminder)).toContain(`<t:${deadline}:F>`);
    expect(contentOf(reminder)).toContain(`<t:${deadline}:R>`);
    expect(contentOf(reminder)).toContain(DISCORD_EVENT_LINK);
  });

  test("mentions each Member in the content, chunked 80 to a message, with allowedMentions exactly those Members", () => {
    const mentioned = mentionIdsOf(170);

    const messages = eventReminderMessages(GUILD_ID, { event: eventOf(), target: "start" }, mentioned);

    expect(messages.map(mentionCountOf)).toEqual([80, 80, 10]);
    expect(messages.map(usersOf)).toEqual([
      mentioned.slice(0, MENTIONS_PER_MESSAGE),
      mentioned.slice(80, 160),
      mentioned.slice(160),
    ]);
  });

  test("keeps every reminder message within Discord's 2,000-character limit with 80 mentions and the longest name", () => {
    const longestName = "A".repeat(100);

    const messages = eventReminderMessages(
      GUILD_ID,
      { event: eventOf({ name: longestName }), target: "signup", signUpDeadline: SIGN_UP_DEADLINE },
      mentionIdsOf(MENTIONS_PER_MESSAGE),
    );

    for (const message of messages) {
      expect(contentOf(message).length).toBeLessThanOrEqual(CONTENT_LIMIT);
    }
  });
});
