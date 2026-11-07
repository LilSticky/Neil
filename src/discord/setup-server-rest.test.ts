/*
 * Contract for src/discord/setup-server-rest.ts (slice 030, research R1, data-model.md "Server state" and "Steps"). Names the
 * methods the SetupServer of createRestSetupServer must have, and the types they use:
 *
 *   interface ForumTag { id?: string; name: string }     // id: an existing tag; a new tag has none
 *   interface ForumPostInfo {
 *     threadId: string; ownerId: string; title: string; content: string; archived: boolean; pinned: boolean;
 *   }
 *     // title is the thread's name, content its starter message, archived its thread_metadata.archived, pinned flags & 2
 *   // SetupChannelInfo of a forum (only) gains: tags: { id: string; name: string }[]; reaction: string | undefined
 *   setForumTags(channelId: string, tags: readonly ForumTag[]): Promise<void>;   // PATCH channel available_tags
 *   setForumReaction(channelId: string, emojiName: string): Promise<void>;      // PATCH channel default_reaction_emoji
 *   readForumPosts(forumId: string): Promise<readonly ForumPostInfo[] | undefined>;
 *     // active guild threads read once per server object (promise cached); archived public threads per forum;
 *     // undefined when the archived read is refused with 403 (Missing Access)
 *   openForumPost(forumId: string, title: string, content: string): Promise<string>;  // POST /channels/{forum}/threads, returns thread id
 *   pinForumPost(threadId: string): Promise<void>;                               // PATCH channel flags with 1 << 1
 *   editForumPost(threadId: string, title: string, content: string, unarchive: boolean): Promise<void>;
 *     // unarchive: PATCH archived false first; then PATCH name; then PATCH the starter message (id = thread id)
 */
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

describe("createRestSetupServer reads no pins where Discord refuses the read with 403", () => {
  test("resolves to undefined when the pin read is refused with status 403 (Missing Access)", async () => {
    const rest = fakeRest();
    const refusal = Object.assign(new Error("Missing Access"), { status: 403, code: 50001 });
    rest.get.mockRejectedValueOnce(refusal);
    const server = createRestSetupServer(rest, GUILD_ID);

    expect(await server.readPins(CHANNEL_ID)).toBeUndefined();
    expect(rest.get).toHaveBeenCalledWith(Routes.channelMessagesPins(CHANNEL_ID));
  });

  test("still rejects a pin read that fails with another status", async () => {
    const rest = fakeRest();
    rest.get.mockRejectedValueOnce(Object.assign(new Error("Internal Server Error"), { status: 500 }));
    const server = createRestSetupServer(rest, GUILD_ID);

    await expect(server.readPins(CHANNEL_ID)).rejects.toThrow("Internal Server Error");
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

describe("createRestSetupServer removes a posted message whose pin fails, and rethrows the pin's error", () => {
  test("deletes the just-posted message and rejects with the original error", async () => {
    const rest = fakeRest({ post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } } });
    const pinError = new Error("Missing Permissions");
    rest.put.mockRejectedValueOnce(pinError);
    const server = createRestSetupServer(rest, GUILD_ID);

    await expect(server.postPinnedMessage(CHANNEL_ID, "📌 **#general**")).rejects.toBe(pinError);
    expect(routesOf(rest.delete)).toEqual([Routes.channelMessage(CHANNEL_ID, MESSAGE_ID)]);
  });
});

describe("createRestSetupServer keeps a pinned message when its pin notice cannot be deleted", () => {
  test("resolves with the message id when deleting the pin notice rejects", async () => {
    const rest = fakeRest({
      post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } },
      get: {
        [Routes.channelMessages(CHANNEL_ID)]: [{ id: NOTICE_ID, type: 6, message_reference: { message_id: MESSAGE_ID } }],
      },
    });
    rest.delete.mockRejectedValueOnce(new Error("Unknown Message"));
    const server = createRestSetupServer(rest, GUILD_ID);

    await expect(server.postPinnedMessage(CHANNEL_ID, "📌 **#general**")).resolves.toBe(MESSAGE_ID);
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

describe("createRestSetupServer reads the oldest messages of a channel", () => {
  test("asks for the messages after id 0 and returns them oldest first, with id, author and content", async () => {
    const rest = fakeRest({
      get: {
        [Routes.channelMessages(CHANNEL_ID)]: [
          { id: OTHER_MESSAGE_ID, type: 0, content: "hello", author: { id: OTHER_MEMBER_ID } },
          { id: MESSAGE_ID, type: 0, content: "📌 **#Hangout voice**", author: { id: BOT_USER_ID } },
        ],
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    const messages = await server.readOldestMessages(CHANNEL_ID);

    expect(rest.get).toHaveBeenCalledWith(`${Routes.channelMessages(CHANNEL_ID)}?after=0&limit=50`);
    expect(messages).toEqual([
      { messageId: MESSAGE_ID, authorId: BOT_USER_ID, content: "📌 **#Hangout voice**" },
      { messageId: OTHER_MESSAGE_ID, authorId: OTHER_MEMBER_ID, content: "hello" },
    ]);
  });

  test("resolves to undefined when the read is refused with status 403 (Missing Access)", async () => {
    const rest = fakeRest();
    rest.get.mockRejectedValueOnce(Object.assign(new Error("Missing Access"), { status: 403, code: 50001 }));
    const server = createRestSetupServer(rest, GUILD_ID);

    expect(await server.readOldestMessages(CHANNEL_ID)).toBeUndefined();
  });
});

describe("createRestSetupServer posts an unpinned description", () => {
  test("posts the content with allowed_mentions parse empty, pins nothing, and returns the id of the new message", async () => {
    const rest = fakeRest({ post: { [Routes.channelMessages(CHANNEL_ID)]: { id: MESSAGE_ID } } });
    const server = createRestSetupServer(rest, GUILD_ID);

    const messageId = await server.postMessage(CHANNEL_ID, "📌 **#Hangout voice**");

    expect(rest.post).toHaveBeenCalledWith(Routes.channelMessages(CHANNEL_ID), {
      body: { content: "📌 **#Hangout voice**", allowed_mentions: { parse: [] } },
    });
    expect(rest.put).not.toHaveBeenCalled();
    expect(messageId).toBe(MESSAGE_ID);
  });
});

const FORUM_ID = "730000000000000000";
const OTHER_FORUM_ID = "740000000000000000";
const THREAD_ID = "750000000000000000";
const ARCHIVED_THREAD_ID = "760000000000000000";
const OTHER_FORUM_THREAD_ID = "770000000000000000";
const TAG_ID = "780000000000000000";

describe("createRestSetupServer sets the tags of a forum", () => {
  test("patches available_tags with an existing tag by id and a new tag by name", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.setForumTags(FORUM_ID, [{ id: TAG_ID, name: "Rally" }, { name: "Defense" }]);

    expect(rest.patch).toHaveBeenCalledWith(Routes.channel(FORUM_ID), {
      body: { available_tags: [{ id: TAG_ID, name: "Rally" }, { name: "Defense" }] },
    });
  });
});

describe("createRestSetupServer sets the default reaction of a forum", () => {
  test("patches default_reaction_emoji with the emoji name and no custom emoji id", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.setForumReaction(FORUM_ID, "⚔️");

    expect(rest.patch).toHaveBeenCalledWith(Routes.channel(FORUM_ID), {
      body: { default_reaction_emoji: { emoji_id: null, emoji_name: "⚔️" } },
    });
  });
});

describe("createRestSetupServer reads a forum's tags and default reaction", () => {
  test("maps available_tags to id and name, and default_reaction_emoji to its emoji name", async () => {
    const rest = fakeRest({
      get: {
        [Routes.guildChannels(GUILD_ID)]: [
          {
            id: FORUM_ID,
            name: "tactics",
            type: 15,
            parent_id: null,
            permission_overwrites: [],
            topic: "A forum.",
            available_tags: [{ id: TAG_ID, name: "Rally", moderated: false, emoji_id: null, emoji_name: null }],
            default_reaction_emoji: { emoji_id: null, emoji_name: "⚔️" },
          },
        ],
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    const [forum] = await server.readChannels();

    expect(forum).toEqual(expect.objectContaining({ id: FORUM_ID, kind: "forum", tags: [{ id: TAG_ID, name: "Rally" }], reaction: "⚔️" }));
  });

  test("reads a forum with no default reaction as undefined", async () => {
    const rest = fakeRest({
      get: {
        [Routes.guildChannels(GUILD_ID)]: [
          {
            id: FORUM_ID,
            name: "tactics",
            type: 15,
            parent_id: null,
            permission_overwrites: [],
            topic: null,
            available_tags: [],
            default_reaction_emoji: null,
          },
        ],
      },
    });
    const server = createRestSetupServer(rest, GUILD_ID);

    const [forum] = await server.readChannels();

    expect(forum?.reaction).toBeUndefined();
  });
});

/** The active and archived threads and the starter messages of one forum, as the fake answers them. */
function forumPostsReplies(): Answers {
  return {
    [Routes.guildActiveThreads(GUILD_ID)]: {
      threads: [
        { id: THREAD_ID, name: "Rally at dawn", type: 11, parent_id: FORUM_ID, owner_id: OTHER_MEMBER_ID, thread_metadata: { archived: false }, flags: 0 },
        { id: OTHER_FORUM_THREAD_ID, name: "Elsewhere", type: 11, parent_id: OTHER_FORUM_ID, owner_id: OTHER_MEMBER_ID, thread_metadata: { archived: false }, flags: 0 },
      ],
      members: [],
    },
    [Routes.channelThreads(FORUM_ID, "public")]: {
      threads: [
        { id: ARCHIVED_THREAD_ID, name: "How to post in #tactics", type: 11, parent_id: FORUM_ID, owner_id: BOT_USER_ID, thread_metadata: { archived: true }, flags: 2 },
      ],
      has_more: false,
    },
    [Routes.channelMessage(THREAD_ID, THREAD_ID)]: { id: THREAD_ID, content: "Rally at dawn, step by step.", author: { id: OTHER_MEMBER_ID } },
    [Routes.channelMessage(ARCHIVED_THREAD_ID, ARCHIVED_THREAD_ID)]: {
      id: ARCHIVED_THREAD_ID,
      content: "📌 **How to post in #tactics**",
      author: { id: BOT_USER_ID },
    },
  };
}

describe("createRestSetupServer reads the posts of a forum", () => {
  test("returns each post with its owner, title, starter content, archived and pinned state", async () => {
    const rest = fakeRest({ get: forumPostsReplies() });
    const server = createRestSetupServer(rest, GUILD_ID);

    const posts = await server.readForumPosts(FORUM_ID);

    expect(posts).toHaveLength(2);
    expect(posts).toEqual(
      expect.arrayContaining([
        {
          threadId: THREAD_ID,
          ownerId: OTHER_MEMBER_ID,
          title: "Rally at dawn",
          content: "Rally at dawn, step by step.",
          archived: false,
          pinned: false,
        },
        {
          threadId: ARCHIVED_THREAD_ID,
          ownerId: BOT_USER_ID,
          title: "How to post in #tactics",
          content: "📌 **How to post in #tactics**",
          archived: true,
          pinned: true,
        },
      ]),
    );
  });

  test("lists only the posts of the forum asked for", async () => {
    const rest = fakeRest({ get: forumPostsReplies() });
    const server = createRestSetupServer(rest, GUILD_ID);

    const posts = await server.readForumPosts(FORUM_ID);

    expect(posts?.map((post) => post.threadId)).not.toContain(OTHER_FORUM_THREAD_ID);
  });

  test("reads the active threads of the guild once, however many forums are read", async () => {
    const rest = fakeRest({ get: forumPostsReplies() });
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.readForumPosts(FORUM_ID);
    await server.readForumPosts(OTHER_FORUM_ID);

    expect(routesOf(rest.get).filter((route) => route === Routes.guildActiveThreads(GUILD_ID))).toHaveLength(1);
  });

  test("resolves to undefined when the archived read is refused with status 403 (Missing Access)", async () => {
    const rest = fakeRest();
    const refusal = Object.assign(new Error("Missing Access"), { status: 403, code: 50001 });
    rest.get.mockImplementation((route: string): Promise<unknown> =>
      route === Routes.channelThreads(FORUM_ID, "public") ? Promise.reject(refusal) : Promise.resolve({ threads: [], members: [] }),
    );
    const server = createRestSetupServer(rest, GUILD_ID);

    await expect(server.readForumPosts(FORUM_ID)).resolves.toBeUndefined();
  });
});

describe("createRestSetupServer opens a how-to post in a forum", () => {
  test("posts the thread with its name and the message's content, no mentions, and returns the thread id", async () => {
    const rest = fakeRest({ post: { [Routes.threads(FORUM_ID)]: { id: THREAD_ID } } });
    const server = createRestSetupServer(rest, GUILD_ID);

    const threadId = await server.openForumPost(FORUM_ID, "How to post in #tactics", "📌 **How to post in #tactics**");

    expect(rest.post).toHaveBeenCalledWith(Routes.threads(FORUM_ID), {
      body: {
        name: "How to post in #tactics",
        message: { content: "📌 **How to post in #tactics**", allowed_mentions: { parse: [] } },
      },
    });
    expect(threadId).toBe(THREAD_ID);
  });
});

describe("createRestSetupServer pins a forum post", () => {
  test("patches the thread's flags with the pinned bit, 1 << 1", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.pinForumPost(THREAD_ID);

    expect(rest.patch).toHaveBeenCalledWith(Routes.channel(THREAD_ID), { body: { flags: 1 << 1 } });
  });
});

describe("createRestSetupServer edits a forum post", () => {
  test("unarchives the post first when asked, then renames it, then edits its starter message", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.editForumPost(ARCHIVED_THREAD_ID, "Rally timing", "Rally at dawn.", true);

    expect(rest.patch.mock.calls).toEqual([
      [Routes.channel(ARCHIVED_THREAD_ID), { body: { archived: false } }],
      [Routes.channel(ARCHIVED_THREAD_ID), { body: { name: "Rally timing" } }],
      [
        Routes.channelMessage(ARCHIVED_THREAD_ID, ARCHIVED_THREAD_ID),
        { body: { content: "Rally at dawn.", allowed_mentions: { parse: [] } } },
      ],
    ]);
  });

  test("leaves the archived state alone when not asked to unarchive", async () => {
    const rest = fakeRest();
    const server = createRestSetupServer(rest, GUILD_ID);

    await server.editForumPost(THREAD_ID, "Rally timing", "Rally at dawn.", false);

    expect(rest.patch.mock.calls).toEqual([
      [Routes.channel(THREAD_ID), { body: { name: "Rally timing" } }],
      [Routes.channelMessage(THREAD_ID, THREAD_ID), { body: { content: "Rally at dawn.", allowed_mentions: { parse: [] } } }],
    ]);
  });
});
