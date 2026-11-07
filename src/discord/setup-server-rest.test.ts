import { Routes } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { createRestSetupServer } from "./setup-server-rest.js";

const GUILD_ID = "200000000000000000";
const BOT_USER_ID = "300000000000000000";
const OTHER_MEMBER_ID = "400000000000000000";
const ROLE_ID = "500000000000000000";
const NEW_ROLE_ID = "600000000000000000";
const CHANNEL_ID = "700000000000000000";
const OTHER_CHANNEL_ID = "710000000000000000";
const MESSAGE_ID = "800000000000000000";
const OTHER_MESSAGE_ID = "810000000000000000";
const NOTICE_ID = "900000000000000000";

/** What the fake answers, keyed by route. The query string is left out of the key. */
type Answers = Readonly<Record<string, unknown>>;

/**
 * A fake of the REST calls the setup makes. GET and POST answer from the given tables by route. A GET route not listed
 * answers an empty object; a POST route not listed answers the id of a new role. PATCH, PUT and DELETE answer an empty
 * object. The calls are recorded by vi.fn, so tests read what the adapter sent.
 */
function fakeRest(replies: { readonly get?: Answers; readonly post?: Answers } = {}) {
  const answerOf = (table: Answers, route: string): unknown => table[route.replace(/\?.*$/, "")];
  const getTable: Answers = { [Routes.user()]: { id: BOT_USER_ID }, ...replies.get };
  const postTable: Answers = { ...replies.post };
  return {
    get: vi.fn((route: string): Promise<unknown> => Promise.resolve(answerOf(getTable, route) ?? {})),
    post: vi.fn<(route: string, options: { body: unknown }) => Promise<unknown>>((route) =>
      Promise.resolve(answerOf(postTable, route) ?? { id: NEW_ROLE_ID }),
    ),
    patch: vi.fn<(route: string, options: { body: unknown }) => Promise<unknown>>(() => Promise.resolve({})),
    put: vi.fn<(route: string, options?: { body?: unknown }) => Promise<unknown>>(() => Promise.resolve({})),
    delete: vi.fn<(route: string) => Promise<unknown>>(() => Promise.resolve({})),
  };
}

/** The routes a fake was called with, in call order. */
function routesOf(mock: { mock: { calls: unknown[][] } }): unknown[] {
  return mock.mock.calls.map(([route]) => route);
}

describe("createRestSetupServer creates a role with no permissions, not hoisted and not mentionable", () => {
  test("posts the role with permissions 0, hoist false and mentionable false", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.createRole("R5");

    expect(rest.post).toHaveBeenCalledWith(Routes.guildRoles(GUILD_ID), {
      body: expect.objectContaining({ name: "R5", permissions: "0", hoist: false, mentionable: false }) as unknown,
    });
  });
});

describe("createRestSetupServer edits overwrites with the type each overwrite carries", () => {
  test("sends a Member overwrite of another user as type 1, a role overwrite as type 0, and Neil's as type 1", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.editOverwrites(CHANNEL_ID, [
      { targetId: OTHER_MEMBER_ID, type: 1, allow: 1024n, deny: 0n },
      { targetId: ROLE_ID, type: 0, allow: 0n, deny: 2048n },
      { targetId: BOT_USER_ID, type: 1, allow: 1n, deny: 0n },
    ]);

    expect(rest.patch).toHaveBeenCalledWith(Routes.channel(CHANNEL_ID), {
      body: {
        permission_overwrites: [
          { id: OTHER_MEMBER_ID, type: 1, allow: "1024", deny: "0" },
          { id: ROLE_ID, type: 0, allow: "0", deny: "2048" },
          { id: BOT_USER_ID, type: 1, allow: "1", deny: "0" },
        ],
      },
    });
  });
});

describe("createRestSetupServer creates a channel with its topic", () => {
  test("sends the topic in the create body when one is given", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.createChannel({
      name: "general",
      type: "text",
      parentId: CHANNEL_ID,
      overwrites: [],
      topic: "Say hello to the Members.",
    });

    expect(rest.post).toHaveBeenCalledWith(Routes.guildChannels(GUILD_ID), {
      body: expect.objectContaining({ name: "general", topic: "Say hello to the Members." }) as unknown,
    });
  });
});

describe("createRestSetupServer sets the topic of an existing channel", () => {
  test("patches the channel with the topic as its body", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.setTopic(CHANNEL_ID, "Say hello to the Members.");

    expect(rest.patch).toHaveBeenCalledWith(Routes.channel(CHANNEL_ID), {
      body: { topic: "Say hello to the Members." },
    });
  });
});

describe("createRestSetupServer reads each channel's topic, null as no topic", () => {
  test("maps the topic of a channel that has one, and undefined for a channel with a null topic", async () => {
    const rest = fakeRest({
      get: {
        [Routes.guildChannels(GUILD_ID)]: [
          { id: CHANNEL_ID, name: "general", type: 0, parent_id: null, permission_overwrites: [], topic: "Say hello." },
          { id: OTHER_CHANNEL_ID, name: "memes", type: 0, parent_id: null, permission_overwrites: [], topic: null },
        ],
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    const channels = await server.readChannels();

    expect(channels.map((channel) => [channel.id, channel.topic])).toEqual([
      [CHANNEL_ID, "Say hello."],
      [OTHER_CHANNEL_ID, undefined],
    ]);
  });
});

describe("createRestSetupServer reads the pins of a channel", () => {
  test("reads the message id, author id and content of each pin from items[].message", async () => {
    const rest = fakeRest({
      get: {
        [Routes.channelMessagesPins(CHANNEL_ID)]: {
          items: [
            {
              pinned_at: "2026-11-07T10:00:00.000Z",
              message: { id: MESSAGE_ID, content: "📌 **#general**", author: { id: BOT_USER_ID, username: "Neil" } },
            },
          ],
        },
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    const pins = await server.readPins(CHANNEL_ID);

    expect(rest.get).toHaveBeenCalledWith(Routes.channelMessagesPins(CHANNEL_ID));
    expect(pins).toEqual([{ messageId: MESSAGE_ID, authorId: BOT_USER_ID, content: "📌 **#general**" }]);
  });

  test("refuses a pin that lacks its content", async () => {
    const rest = fakeRest({
      get: {
        [Routes.channelMessagesPins(CHANNEL_ID)]: {
          items: [{ pinned_at: "2026-11-07T10:00:00.000Z", message: { id: MESSAGE_ID, author: { id: BOT_USER_ID } } }],
        },
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    await expect(server.readPins(CHANNEL_ID)).rejects.toThrow();
  });
});

describe("createRestSetupServer posts a description with no mentions", () => {
  test("posts the content with allowed_mentions parse empty, and returns the id of the new message", async () => {
    const rest = fakeRest({ post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } } });
    const server = createRestSetupServer(rest, GUILD_ID);

    const messageId = await server.postPinnedMessage(CHANNEL_ID, "📌 **#general**\n\nSay hello.");

    expect(rest.post).toHaveBeenCalledWith(Routes.channelMessages(CHANNEL_ID), {
      body: { content: "📌 **#general**\n\nSay hello.", allowed_mentions: { parse: [] } },
    });
    expect(messageId).toBe(MESSAGE_ID);
  });
});

describe("createRestSetupServer pins the message it posted", () => {
  test("puts the pin of the new message in the channel", async () => {
    const rest = fakeRest({ post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } } });
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.postPinnedMessage(CHANNEL_ID, "📌 **#general**");

    expect(routesOf(rest.put)).toEqual([Routes.channelMessagesPin(CHANNEL_ID, MESSAGE_ID)]);
  });

  test("pins before it looks for Discord's pin notice", async () => {
    const rest = fakeRest({ post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } } });
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.postPinnedMessage(CHANNEL_ID, "📌 **#general**");

    expect(Math.max(...rest.put.mock.invocationCallOrder)).toBeLessThan(Math.min(...rest.get.mock.invocationCallOrder));
  });
});

describe("createRestSetupServer deletes the pin notice Discord writes for the pinned message", () => {
  test("deletes the type 6 message whose reference is the new message", async () => {
    const rest = fakeRest({
      post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } },
      get: {
        [Routes.channelMessages(CHANNEL_ID)]: [
          { id: NOTICE_ID, type: 6, message_reference: { message_id: MESSAGE_ID } },
          { id: MESSAGE_ID, type: 0, message_reference: null },
        ],
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.postPinnedMessage(CHANNEL_ID, "📌 **#general**");

    expect(routesOf(rest.delete)).toEqual([Routes.channelMessage(CHANNEL_ID, NOTICE_ID)]);
  });

  test("deletes nothing when no type 6 message references the new message", async () => {
    const rest = fakeRest({
      post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } },
      get: {
        [Routes.channelMessages(CHANNEL_ID)]: [
          { id: NOTICE_ID, type: 6, message_reference: { message_id: OTHER_MESSAGE_ID } },
          { id: OTHER_MESSAGE_ID, type: 0, message_reference: null },
        ],
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.postPinnedMessage(CHANNEL_ID, "📌 **#general**");

    expect(rest.delete).not.toHaveBeenCalled();
  });
});

describe("createRestSetupServer edits a message in place", () => {
  test("patches the message with the content, and allowed_mentions parse empty", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.editMessage(CHANNEL_ID, MESSAGE_ID, "📌 **#general**\n\nSay hello, again.");

    expect(rest.patch).toHaveBeenCalledWith(Routes.channelMessage(CHANNEL_ID, MESSAGE_ID), {
      body: { content: "📌 **#general**\n\nSay hello, again.", allowed_mentions: { parse: [] } },
    });
  });
});
