/*
 * Contract for src/discord/server-crawl.ts (Neil Police, documentation/NEIL-POLICE.md section 4, ADR 15):
 *
 *   interface CrawlRest { get(route: string, options?: { query?: URLSearchParams }): Promise<unknown> }
 *   crawlServer(rest, guildId, now): Promise<ServerSnapshot>     // reads one server over REST, changes nothing
 *   summarizeCrawl(snapshot): string                             // Markdown, never a Member's name
 *
 * The fake answers each discord.js Routes path (the query is passed apart, as the crawl sends it). An answer is a body,
 * a thrown error (an HTTP error carries a numeric status and a message, as DiscordAPIError does), or a function of the
 * query for a paged route. A route the test does not answer rejects with a plain error, so a missing route shows.
 */
import { Routes } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import {
  crawlServer,
  summarizeCrawl,
  type CrawlChannel,
  type CrawlMember,
  type CrawlRole,
  type Section,
  type ServerSnapshot,
} from "./server-crawl.js";

const GUILD_ID = "200000000000000000";
const ROLE_ID = "500000000000000000";
const MODERATOR_ROLE_ID = "501000000000000000";
const HELPER_ROLE_ID = "502000000000000000";
const BOT_ROLE_ID = "503000000000000000";
const MEMBER_ID = "400000000000000000";
const CATEGORY_ID = "600000000000000000";
const OTHER_CATEGORY_ID = "610000000000000000";
const CHANNEL_ID = "700000000000000000";
const OTHER_CHANNEL_ID = "710000000000000000";
const VOICE_ID = "720000000000000000";
const ANNOUNCEMENT_ID = "730000000000000000";
const FORUM_ID = "740000000000000000";
const MEDIA_ID = "750000000000000000";
const STAGE_ID = "760000000000000000";
const RULES_ID = "770000000000000000";
const GAMES_ID = "780000000000000000";

const NOW = new Date("2026-11-15T10:00:00.000Z");
const NOW_ISO = "2026-11-15T10:00:00.000Z";
const DISCORD_EPOCH = 1420070400000n;

/** A snowflake whose timestamp is the given time, with zero worker, process and increment bits. */
function snowflakeAt(iso: string): string {
  return ((BigInt(Date.parse(iso)) - DISCORD_EPOCH) << 22n).toString();
}

/** A distinct 18-digit member id for the paging tests. */
function memberId(index: number): string {
  return (100000000000000000n + BigInt(index)).toString();
}

/** A permissions bit string with the given Discord permission bits set. */
function permissionBits(...bits: number[]): string {
  return bits.reduce((sum, bit) => sum | (1n << BigInt(bit)), 0n).toString();
}

type Query = (query: URLSearchParams) => unknown;

type Answer =
  | { readonly kind: "body"; readonly body: unknown }
  | { readonly kind: "error"; readonly error: Error }
  | { readonly kind: "query"; readonly answer: Query };

const body = (value: unknown): Answer => ({ kind: "body", body: value });
const thrown = (error: Error): Answer => ({ kind: "error", error });
const paged = (answer: Query): Answer => ({ kind: "query", answer });

/** An error shaped like discord.js's DiscordAPIError: a numeric status and a message. */
function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

type CrawlGetOptions = { query?: URLSearchParams };

/** A fake of the crawl's REST port. The calls are recorded by vi.fn, so tests read what the crawl asked for. */
function fakeCrawlRest(answers: Readonly<Record<string, Answer>>) {
  return {
    get: vi.fn<(route: string, options?: CrawlGetOptions) => Promise<unknown>>((route, options) => {
      const answer = answers[route];
      if (answer === undefined) return Promise.reject(new Error(`unexpected route ${route}`));
      switch (answer.kind) {
        case "body":
          return Promise.resolve(answer.body);
        case "error":
          return Promise.reject(answer.error);
        case "query":
          return Promise.resolve(answer.answer(options?.query ?? new URLSearchParams()));
      }
    }),
  };
}

type FakeCrawlRest = ReturnType<typeof fakeCrawlRest>;

/** The queries sent to one route, in call order. A call without a query gives undefined. */
function queriesTo(rest: FakeCrawlRest, route: string): (URLSearchParams | undefined)[] {
  return rest.get.mock.calls.filter(([called]) => called === route).map(([, options]) => options?.query);
}

/** A server with every route answered by an empty but valid reply, with the given answers on top. */
function crawlAnswers(overrides: Readonly<Record<string, Answer>> = {}): Readonly<Record<string, Answer>> {
  return {
    [Routes.guild(GUILD_ID)]: body({ id: GUILD_ID, name: "Neil Test Server", approximate_member_count: 3 }),
    [Routes.guildChannels(GUILD_ID)]: body([]),
    [Routes.guildRoles(GUILD_ID)]: body([]),
    [Routes.guildMembers(GUILD_ID)]: paged(() => []),
    [Routes.guildActiveThreads(GUILD_ID)]: body({ threads: [], members: [] }),
    [Routes.guildScheduledEvents(GUILD_ID)]: body([]),
    [Routes.guildEmojis(GUILD_ID)]: body([]),
    [Routes.guildStickers(GUILD_ID)]: body([]),
    [Routes.guildAutoModerationRules(GUILD_ID)]: body([]),
    [Routes.guildInvites(GUILD_ID)]: body([]),
    [Routes.guildWebhooks(GUILD_ID)]: body([]),
    [Routes.guildIntegrations(GUILD_ID)]: body([]),
    [Routes.guildAuditLog(GUILD_ID)]: body({ audit_log_entries: [] }),
    [Routes.guildWelcomeScreen(GUILD_ID)]: body({ description: null, welcome_channels: [] }),
    [Routes.guildOnboarding(GUILD_ID)]: body({
      guild_id: GUILD_ID,
      prompts: [],
      default_channel_ids: [],
      enabled: false,
      mode: 0,
    }),
    ...overrides,
  };
}

/** A raw Discord channel object, as the channels route answers it. */
function rawChannel(overrides: Record<string, unknown> & { id: string; type: number }): Record<string, unknown> {
  return { name: "channel", parent_id: null, position: 0, permission_overwrites: [], ...overrides };
}

/** The archived threads answer of a channel with the given threads and paging flag. */
function archivedAnswer(threads: unknown[], hasMore: boolean): Answer {
  return body({ threads, has_more: hasMore });
}

/** A raw Discord member object of a human who is not pending, with no roles. */
function rawMember(id: string, joinedAt: string): Record<string, unknown> {
  return {
    user: { id, username: `user-${id}`, global_name: null },
    nick: null,
    roles: [],
    joined_at: joinedAt,
    premium_since: null,
    communication_disabled_until: null,
    pending: false,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// crawlServer
// ---------------------------------------------------------------------------------------------------------------------

describe("crawlServer fails the whole crawl when a required section cannot be read", () => {
  const REQUIRED_SECTIONS: [string, string][] = [
    ["guild", Routes.guild(GUILD_ID)],
    ["channels", Routes.guildChannels(GUILD_ID)],
    ["roles", Routes.guildRoles(GUILD_ID)],
  ];
  test.each(REQUIRED_SECTIONS)("throws, naming %s, with the status and message Discord gave", async (section, route) => {
    const rest = fakeCrawlRest(crawlAnswers({ [route]: thrown(httpError(403, "Missing Access")) }));

    await expect(crawlServer(rest, GUILD_ID, NOW)).rejects.toThrow(`cannot read ${section}: 403 Missing Access`);
  });

  test("throws when the guild reply has no id, rather than recording a guild it cannot name", async () => {
    const rest = fakeCrawlRest(crawlAnswers({ [Routes.guild(GUILD_ID)]: body({ name: "Neil Test Server" }) }));

    await expect(crawlServer(rest, GUILD_ID, NOW)).rejects.toThrow();
  });
});

const OPTIONAL_SECTIONS: [keyof ServerSnapshot, string][] = [
  ["members", Routes.guildMembers(GUILD_ID)],
  ["activeThreads", Routes.guildActiveThreads(GUILD_ID)],
  ["scheduledEvents", Routes.guildScheduledEvents(GUILD_ID)],
  ["emojis", Routes.guildEmojis(GUILD_ID)],
  ["stickers", Routes.guildStickers(GUILD_ID)],
  ["autoModerationRules", Routes.guildAutoModerationRules(GUILD_ID)],
  ["invites", Routes.guildInvites(GUILD_ID)],
  ["webhooks", Routes.guildWebhooks(GUILD_ID)],
  ["integrations", Routes.guildIntegrations(GUILD_ID)],
  ["auditLog", Routes.guildAuditLog(GUILD_ID)],
  ["welcomeScreen", Routes.guildWelcomeScreen(GUILD_ID)],
  ["onboarding", Routes.guildOnboarding(GUILD_ID)],
];

describe("crawlServer records an optional section it cannot read as its status and message", () => {
  test.each(OPTIONAL_SECTIONS)("%s is recorded with reason '403 Missing Access' and the crawl goes on", async (section, route) => {
    const rest = fakeCrawlRest(crawlAnswers({ [route]: thrown(httpError(403, "Missing Access")) }));

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot[section]).toEqual({ readable: false, reason: "403 Missing Access" });
  });

  test("records a reply that fails validation as 'unexpected response'", async () => {
    const rest = fakeCrawlRest(crawlAnswers({ [Routes.guildInvites(GUILD_ID)]: body("not a list") }));

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.invites).toEqual({ readable: false, reason: "unexpected response" });
  });
});

describe("crawlServer rethrows an error that carries no HTTP status", () => {
  test("rejects with the same error when an optional section fails without a status", async () => {
    const error = new Error("socket hang up");
    const rest = fakeCrawlRest(crawlAnswers({ [Routes.guildScheduledEvents(GUILD_ID)]: thrown(error) }));

    await expect(crawlServer(rest, GUILD_ID, NOW)).rejects.toBe(error);
  });
});

describe("crawlServer reads the members in pages of 1000, after the last member of the page before", () => {
  test("asks for the next page after the last id of a full first page, and reads both pages", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => rawMember(memberId(index + 1), "2026-01-05T10:00:00.000Z"));
    const secondPage = [1001, 1002, 1003].map((index) => rawMember(memberId(index), "2026-01-06T10:00:00.000Z"));
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildMembers(GUILD_ID)]: paged((query) => (query.get("after") === "0" ? firstPage : secondPage)),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    const queries = queriesTo(rest, Routes.guildMembers(GUILD_ID));
    expect(queries.map((query) => query?.get("limit"))).toEqual(["1000", "1000"]);
    expect(queries.map((query) => query?.get("after"))).toEqual(["0", memberId(1000)]);
    const ids = snapshot.members.readable ? snapshot.members.data.map((member) => member.id) : [];
    expect(ids).toEqual(Array.from({ length: 1003 }, (_, index) => memberId(index + 1)));
  });

  test("asks for no second page after a first page shorter than 1000", async () => {
    const shortPage = Array.from({ length: 999 }, (_, index) => rawMember(memberId(index + 1), "2026-01-05T10:00:00.000Z"));
    const rest = fakeCrawlRest(crawlAnswers({ [Routes.guildMembers(GUILD_ID)]: paged(() => shortPage) }));

    await crawlServer(rest, GUILD_ID, NOW);

    expect(queriesTo(rest, Routes.guildMembers(GUILD_ID))).toHaveLength(1);
  });
});

describe("crawlServer keeps only the member fields the summary needs", () => {
  test("maps the user's id, username and global name, the nickname, roles, dates and flags, and drops the rest", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildMembers(GUILD_ID)]: body([
          {
            user: { id: MEMBER_ID, username: "mara", global_name: "Mara", bot: false, avatar: "abc", discriminator: "0" },
            nick: "Mara of the Hall",
            roles: [ROLE_ID],
            joined_at: "2026-01-05T10:00:00.000Z",
            premium_since: "2026-02-14T10:00:00.000Z",
            communication_disabled_until: "2026-11-20T10:00:00.000Z",
            pending: false,
            avatar: null,
            deaf: false,
            mute: false,
            flags: 0,
          },
        ]),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.members).toEqual({
      readable: true,
      data: [
        {
          id: MEMBER_ID,
          username: "mara",
          displayName: "Mara",
          nickname: "Mara of the Hall",
          roleIds: [ROLE_ID],
          joinedAt: "2026-01-05T10:00:00.000Z",
          boostingSince: "2026-02-14T10:00:00.000Z",
          timeoutUntil: "2026-11-20T10:00:00.000Z",
          bot: false,
          pending: false,
        },
      ],
    });
  });

  test("reads a member without bot or pending flags as a human who is not pending", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildMembers(GUILD_ID)]: body([{ user: { id: MEMBER_ID, username: "mara" }, roles: [], joined_at: null }]),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.members).toEqual({
      readable: true,
      data: [
        expect.objectContaining({ id: MEMBER_ID, bot: false, pending: false, joinedAt: null }) as unknown,
      ],
    });
  });
});

describe("crawlServer reads the channels, with the defaults for what Discord leaves out", () => {
  test("maps a channel's parent, position, last message and overwrites", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildChannels(GUILD_ID)]: body([
          rawChannel({
            id: CHANNEL_ID,
            name: "general",
            type: 0,
            parent_id: CATEGORY_ID,
            position: 3,
            last_message_id: snowflakeAt("2026-11-07T10:00:00.000Z"),
            permission_overwrites: [{ id: ROLE_ID, type: 0, allow: "1024", deny: "0" }],
          }),
        ]),
        [Routes.channelThreads(CHANNEL_ID, "public")]: archivedAnswer([], false),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.channels).toEqual([
      expect.objectContaining({
        id: CHANNEL_ID,
        name: "general",
        type: 0,
        parentId: CATEGORY_ID,
        position: 3,
        lastMessageId: snowflakeAt("2026-11-07T10:00:00.000Z"),
        overwrites: [{ id: ROLE_ID, type: 0, allow: "1024", deny: "0" }],
      }) as unknown,
    ]);
  });

  test("reads a channel with a null name, no position and no overwrites as empty name, position 0 and no overwrites", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildChannels(GUILD_ID)]: body([{ id: CHANNEL_ID, name: null, type: 0, parent_id: null, last_message_id: null }]),
        [Routes.channelThreads(CHANNEL_ID, "public")]: archivedAnswer([], false),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.channels).toEqual([
      expect.objectContaining({ id: CHANNEL_ID, name: "", position: 0, overwrites: [], lastMessageId: null }) as unknown,
    ]);
  });
});

describe("crawlServer reads the archived threads of text, announcement, forum and media channels", () => {
  const channels = [
    rawChannel({ id: CHANNEL_ID, name: "general", type: 0 }),
    rawChannel({ id: VOICE_ID, name: "lobby", type: 2 }),
    rawChannel({ id: CATEGORY_ID, name: "Info", type: 4 }),
    rawChannel({ id: ANNOUNCEMENT_ID, name: "news", type: 5 }),
    rawChannel({ id: STAGE_ID, name: "stage", type: 13 }),
    rawChannel({ id: FORUM_ID, name: "tactics", type: 15 }),
    rawChannel({ id: MEDIA_ID, name: "clips", type: 16 }),
  ];
  const archivable = [CHANNEL_ID, ANNOUNCEMENT_ID, FORUM_ID, MEDIA_ID].sort();
  const thread = { id: "790000000000000000", name: "Rally at dawn", type: 11, parent_id: CHANNEL_ID };

  test("asks only the text, announcement, forum and media channels for their public archived threads", async () => {
    const answers = crawlAnswers({
      [Routes.guildChannels(GUILD_ID)]: body(channels),
      ...Object.fromEntries(archivable.map((id) => [Routes.channelThreads(id, "public"), archivedAnswer([], false)])),
    });
    const rest = fakeCrawlRest(answers);

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(Object.keys(snapshot.archivedThreads).sort()).toEqual(archivable);
  });

  test("records each channel's archived threads and whether more follow, asking 100 at a time", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildChannels(GUILD_ID)]: body([rawChannel({ id: CHANNEL_ID, name: "general", type: 0 })]),
        [Routes.channelThreads(CHANNEL_ID, "public")]: archivedAnswer([thread], true),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.archivedThreads[CHANNEL_ID]).toEqual({ readable: true, data: { threads: [thread], hasMore: true } });
    expect(queriesTo(rest, Routes.channelThreads(CHANNEL_ID, "public"))[0]?.get("limit")).toBe("100");
  });

  test("records a refused archived read for that channel only, and the other channels are still read", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildChannels(GUILD_ID)]: body([
          rawChannel({ id: CHANNEL_ID, name: "general", type: 0 }),
          rawChannel({ id: FORUM_ID, name: "tactics", type: 15 }),
        ]),
        [Routes.channelThreads(CHANNEL_ID, "public")]: archivedAnswer([thread], false),
        [Routes.channelThreads(FORUM_ID, "public")]: thrown(httpError(403, "Missing Access")),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.archivedThreads[FORUM_ID]).toEqual({ readable: false, reason: "403 Missing Access" });
    expect(snapshot.archivedThreads[CHANNEL_ID]).toEqual({ readable: true, data: { threads: [thread], hasMore: false } });
  });

  test("rethrows a non-HTTP error from an archived read", async () => {
    const error = new Error("socket hang up");
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildChannels(GUILD_ID)]: body([rawChannel({ id: CHANNEL_ID, name: "general", type: 0 })]),
        [Routes.channelThreads(CHANNEL_ID, "public")]: thrown(error),
      }),
    );

    await expect(crawlServer(rest, GUILD_ID, NOW)).rejects.toBe(error);
  });
});

describe("crawlServer drops the personal and secret fields the snapshot must not keep", () => {
  test("keeps a webhook without its token, its url or its user", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildWebhooks(GUILD_ID)]: body([
          {
            id: "810000000000000000",
            type: 1,
            name: "Board",
            channel_id: CHANNEL_ID,
            guild_id: GUILD_ID,
            avatar: null,
            application_id: null,
            token: "s3cr3t-token",
            url: "https://discord.test/api/webhooks/810000000000000000/s3cr3t-token",
            user: { id: MEMBER_ID, username: "owner-name" },
          },
        ]),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.webhooks).toEqual({
      readable: true,
      data: [
        {
          id: "810000000000000000",
          type: 1,
          name: "Board",
          channel_id: CHANNEL_ID,
          guild_id: GUILD_ID,
          avatar: null,
          application_id: null,
        },
      ],
    });
  });

  test("keeps an invite without its inviter or its target user", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildInvites(GUILD_ID)]: body([
          {
            code: "abc",
            uses: 4,
            max_uses: 0,
            channel: { id: CHANNEL_ID, name: "general" },
            channel_id: CHANNEL_ID,
            inviter: { id: MEMBER_ID, username: "inviter-name" },
            target_user: { id: OTHER_CHANNEL_ID, username: "target-name" },
          },
        ]),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.invites).toEqual({
      readable: true,
      data: [{ code: "abc", uses: 4, max_uses: 0, channel: { id: CHANNEL_ID, name: "general" }, channel_id: CHANNEL_ID }],
    });
  });

  test("keeps a scheduled event without its creator", async () => {
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildScheduledEvents(GUILD_ID)]: body([
          {
            id: "820000000000000000",
            name: "Rally",
            status: 1,
            user_count: 7,
            creator_id: MEMBER_ID,
            creator: { id: MEMBER_ID, username: "creator-name" },
          },
        ]),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.scheduledEvents).toEqual({
      readable: true,
      data: [{ id: "820000000000000000", name: "Rally", status: 1, user_count: 7, creator_id: MEMBER_ID }],
    });
    expect(queriesTo(rest, Routes.guildScheduledEvents(GUILD_ID))[0]?.get("with_user_count")).toBe("true");
  });

  const ITEMS_WITHOUT_USER: [keyof ServerSnapshot, string, Record<string, unknown>][] = [
    ["emojis", Routes.guildEmojis(GUILD_ID), { id: "830000000000000000", name: "sword", available: true }],
    ["stickers", Routes.guildStickers(GUILD_ID), { id: "840000000000000000", name: "flag", available: true }],
    ["integrations", Routes.guildIntegrations(GUILD_ID), { id: "850000000000000000", name: "Twitch", type: "twitch" }],
  ];
  test.each(ITEMS_WITHOUT_USER)("keeps %s without the user that created each one", async (section, route, item) => {
    const rest = fakeCrawlRest(crawlAnswers({ [route]: body([{ ...item, user: { id: MEMBER_ID, username: "maker-name" } }]) }));

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot[section]).toEqual({ readable: true, data: [item] });
  });
});

describe("crawlServer reads the remaining sections in the shape the summary uses", () => {
  test("keeps the guild's raw object and the crawl's time and reads the guild with its counts", async () => {
    const rest = fakeCrawlRest(crawlAnswers());

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot).toEqual(
      expect.objectContaining({
        guildId: GUILD_ID,
        crawledAt: NOW_ISO,
        guild: expect.objectContaining({ id: GUILD_ID, name: "Neil Test Server" }) as unknown,
      }),
    );
    expect(queriesTo(rest, Routes.guild(GUILD_ID))[0]?.get("with_counts")).toBe("true");
  });

  test("keeps only the threads of the active list, not its members", async () => {
    const activeThread = { id: "860000000000000000", name: "Open rally", parent_id: CHANNEL_ID };
    const rest = fakeCrawlRest(
      crawlAnswers({
        [Routes.guildActiveThreads(GUILD_ID)]: body({ threads: [activeThread], members: [{ id: MEMBER_ID }] }),
      }),
    );

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.activeThreads).toEqual({ readable: true, data: [activeThread] });
  });

  test("keeps the entries of the audit log, asking for the first 100", async () => {
    const entry = { id: "870000000000000000", action_type: 22, user_id: MEMBER_ID };
    const rest = fakeCrawlRest(crawlAnswers({ [Routes.guildAuditLog(GUILD_ID)]: body({ audit_log_entries: [entry] }) }));

    const snapshot = await crawlServer(rest, GUILD_ID, NOW);

    expect(snapshot.auditLog).toEqual({ readable: true, data: [entry] });
    expect(queriesTo(rest, Routes.guildAuditLog(GUILD_ID))[0]?.get("limit")).toBe("100");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// summarizeCrawl
// ---------------------------------------------------------------------------------------------------------------------

function readable<T>(data: T): Section<T> {
  return { readable: true, data };
}

function unreadable(reason: string): { readable: false; reason: string } {
  return { readable: false, reason };
}

function crawlChannel(overrides: Pick<CrawlChannel, "id" | "name" | "type"> & Partial<CrawlChannel>): CrawlChannel {
  return { parentId: null, position: 0, lastMessageId: null, overwrites: [], raw: {}, ...overrides };
}

function crawlRole(overrides: Pick<CrawlRole, "id" | "name" | "position"> & Partial<CrawlRole>): CrawlRole {
  return { permissions: "0", managed: false, raw: {}, ...overrides };
}

function crawlMember(overrides: Pick<CrawlMember, "id" | "username"> & Partial<CrawlMember>): CrawlMember {
  return {
    displayName: null,
    nickname: null,
    roleIds: [],
    joinedAt: null,
    boostingSince: null,
    timeoutUntil: null,
    bot: false,
    pending: false,
    ...overrides,
  };
}

/** A snapshot in which every section was readable and empty, with the given parts on top. */
function snapshotOf(overrides: Partial<ServerSnapshot> = {}): ServerSnapshot {
  return {
    guildId: GUILD_ID,
    crawledAt: NOW_ISO,
    guild: { id: GUILD_ID, name: "Neil Test Server", raw: { approximate_member_count: 1234 } },
    channels: [],
    roles: [],
    members: readable([]),
    activeThreads: readable([]),
    archivedThreads: {},
    scheduledEvents: readable([]),
    emojis: readable([]),
    stickers: readable([]),
    autoModerationRules: readable([]),
    invites: readable([]),
    webhooks: readable([]),
    integrations: readable([]),
    auditLog: readable([]),
    welcomeScreen: readable({}),
    onboarding: readable({}),
    ...overrides,
  };
}

/** The lines under a "## heading" of the summary, up to the next "## " heading. Empty when there is no such heading. */
function sectionOf(summary: string, heading: string): string {
  const lines = summary.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The cells of the table row under a heading whose cells include the given text. Empty when there is none. */
function tableRowOf(summary: string, heading: string, cell: string): string[] {
  const rows = sectionOf(summary, heading)
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.split("|").map((part) => part.trim()));
  return rows.find((cells) => cells.includes(cell)) ?? [];
}

/** The line under a heading that contains the given text. Empty when there is none. */
function lineWith(summary: string, heading: string, text: string): string {
  return sectionOf(summary, heading).split("\n").find((line) => line.includes(text)) ?? "";
}

describe("summarizeCrawl starts with the server's name, and says when it was crawled and how big it is", () => {
  test("the first line is the server's name as a heading", () => {
    const summary = summarizeCrawl(snapshotOf());

    expect(summary.split("\n")[0]).toBe("# Neil Test Server");
  });

  test("names the crawl time, the guild id and the approximate member count from the guild", () => {
    const summary = summarizeCrawl(snapshotOf());

    expect(summary).toContain(NOW_ISO);
    expect(summary).toContain(GUILD_ID);
    expect(summary).toContain("1234");
  });
});

describe("summarizeCrawl lists the server settings the guild carries, and nothing it does not", () => {
  test("shows each setting the guild has, with its features as a comma list", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        guild: {
          id: GUILD_ID,
          name: "Neil Test Server",
          raw: {
            verification_level: 2,
            mfa_level: 1,
            explicit_content_filter: 2,
            default_message_notifications: 1,
            preferred_locale: "en-US",
            premium_tier: 2,
            premium_subscription_count: 14,
            features: ["COMMUNITY", "NEWS"],
          },
        },
      }),
    );

    const settings = sectionOf(summary, "Server settings");
    expect(settings).toContain("en-US");
    expect(settings).toContain("14");
    expect(settings).toMatch(/COMMUNITY,\s*NEWS/);
  });

  test("shows no placeholder for a setting the guild does not carry", () => {
    const summary = summarizeCrawl(snapshotOf({ guild: { id: GUILD_ID, name: "Neil Test Server", raw: { verification_level: 2 } } }));

    const settings = sectionOf(summary, "Server settings");
    expect(settings).not.toContain("undefined");
    expect(settings).not.toContain("null");
  });
});

describe("summarizeCrawl lists the sections it could not read", () => {
  test("lists an unreadable section with its reason", () => {
    const summary = summarizeCrawl(snapshotOf({ scheduledEvents: unreadable("403 Missing Access") }));

    expect(sectionOf(summary, "Not readable")).toContain("scheduledEvents: 403 Missing Access");
  });

  test("lists an unreadable archived thread read by the channel's name", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        channels: [crawlChannel({ id: CHANNEL_ID, name: "general", type: 0 })],
        archivedThreads: { [CHANNEL_ID]: unreadable("403 Missing Access") },
      }),
    );

    expect(sectionOf(summary, "Not readable")).toContain("archivedThreads #general: 403 Missing Access");
  });

  test("says everything was readable when no section is unreadable", () => {
    const summary = summarizeCrawl(snapshotOf());

    expect(sectionOf(summary, "Not readable")).toContain("Everything was readable.");
  });
});

describe("summarizeCrawl lists the roles by position, highest first", () => {
  const roles = [
    crawlRole({ id: GUILD_ID, name: "@everyone", position: 0 }),
    crawlRole({ id: MODERATOR_ROLE_ID, name: "Moderators", position: 7 }),
    crawlRole({ id: HELPER_ROLE_ID, name: "Helpers", position: 9 }),
    crawlRole({ id: BOT_ROLE_ID, name: "Neil", position: 5, managed: true }),
  ];
  const members = [
    crawlMember({ id: "a1", username: "one", roleIds: [MODERATOR_ROLE_ID] }),
    crawlMember({ id: "a2", username: "two", roleIds: [MODERATOR_ROLE_ID, HELPER_ROLE_ID] }),
    crawlMember({ id: "a3", username: "three", roleIds: [] }),
    crawlMember({ id: "a4", username: "four", roleIds: [BOT_ROLE_ID] }),
  ];

  test("sorts the role rows by position, highest first", () => {
    const roleSection = sectionOf(summarizeCrawl(snapshotOf({ roles, members: readable(members) })), "Roles");

    expect(roleSection.indexOf("Helpers")).toBeLessThan(roleSection.indexOf("Moderators"));
    expect(roleSection.indexOf("Moderators")).toBeLessThan(roleSection.indexOf("Neil"));
    expect(roleSection.indexOf("Neil")).toBeLessThan(roleSection.indexOf("@everyone"));
  });

  test("counts the Members who have each role, and counts @everyone as every Member", () => {
    const summary = summarizeCrawl(snapshotOf({ roles, members: readable(members) }));

    expect(tableRowOf(summary, "Roles", "@everyone")).toContain("4");
    expect(tableRowOf(summary, "Roles", "Moderators")).toContain("2");
    expect(tableRowOf(summary, "Roles", "Helpers")).toContain("1");
    expect(tableRowOf(summary, "Roles", "Neil")).toContain("1");
  });

  test("shows ? for each role's count when the Members could not be read", () => {
    const summary = summarizeCrawl(snapshotOf({ roles, members: unreadable("403 Missing Access") }));

    expect(tableRowOf(summary, "Roles", "@everyone")).toContain("?");
    expect(tableRowOf(summary, "Roles", "Moderators")).toContain("?");
  });

  test("shows a dash for a role with no key permission", () => {
    const summary = summarizeCrawl(snapshotOf({ roles: [crawlRole({ id: HELPER_ROLE_ID, name: "Helpers", position: 9 })] }));

    expect(tableRowOf(summary, "Roles", "Helpers")).toContain("–");
  });

  test("lists the key permissions a role has set, by name, and not the others", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        roles: [crawlRole({ id: MODERATOR_ROLE_ID, name: "Moderators", position: 7, permissions: permissionBits(1, 13) })],
      }),
    );

    const row = tableRowOf(summary, "Roles", "Moderators").join("|");
    expect(row).toContain("Kick Members");
    expect(row).toContain("Manage Messages");
    expect(row).not.toContain("Ban Members");
  });

  const KEY_PERMISSIONS: [string, number][] = [
    ["Administrator", 3],
    ["Manage Server", 5],
    ["Manage Channels", 4],
    ["Manage Roles", 28],
    ["Manage Nicknames", 27],
    ["Kick Members", 1],
    ["Ban Members", 2],
    ["Mention Everyone", 17],
    ["Manage Messages", 13],
    ["View Audit Log", 7],
    ["Create Events", 44],
    ["Manage Events", 33],
  ];
  test.each(KEY_PERMISSIONS)("names the %s permission when its bit is set", (name, bit) => {
    const summary = summarizeCrawl(
      snapshotOf({ roles: [crawlRole({ id: ROLE_ID, name: "Test role", position: 1, permissions: permissionBits(bit) })] }),
    );

    expect(tableRowOf(summary, "Roles", "Test role").join("|")).toContain(name);
  });

  test("marks a managed role as managed", () => {
    const summary = summarizeCrawl(snapshotOf({ roles: [crawlRole({ id: BOT_ROLE_ID, name: "Neil", position: 5, managed: true })] }));
    const unmanaged = summarizeCrawl(snapshotOf({ roles: [crawlRole({ id: BOT_ROLE_ID, name: "Neil", position: 5, managed: false })] }));

    expect(tableRowOf(summary, "Roles", "Neil")).not.toEqual(tableRowOf(unmanaged, "Roles", "Neil"));
  });
});

describe("summarizeCrawl lists the channels by category, each with its type, overwrites and last activity", () => {
  const channels = [
    crawlChannel({ id: CHANNEL_ID, name: "general", type: 0, position: 0, lastMessageId: snowflakeAt("2026-11-07T10:00:00.000Z"), overwrites: [{ id: ROLE_ID, type: 0, allow: "0", deny: "0" }, { id: MEMBER_ID, type: 1, allow: "0", deny: "0" }] }),
    crawlChannel({ id: VOICE_ID, name: "lobby", type: 2, position: 1 }),
    crawlChannel({ id: OTHER_CATEGORY_ID, name: "Play", type: 4, position: 1 }),
    crawlChannel({ id: GAMES_ID, name: "games", type: 0, parentId: OTHER_CATEGORY_ID, position: 0 }),
    crawlChannel({ id: CATEGORY_ID, name: "Info", type: 4, position: 2 }),
    crawlChannel({ id: RULES_ID, name: "rules", type: 0, parentId: CATEGORY_ID, position: 0, lastMessageId: snowflakeAt("2026-10-30T12:00:00.000Z") }),
  ];

  test("lists the channels with no category first, then each category by position with its channels under it", () => {
    const lines = sectionOf(summarizeCrawl(snapshotOf({ channels })), "Channels");

    const at = (text: string): number => lines.indexOf(text);
    expect(at("- #general (text) · overwrites: 2 · last activity: 2026-11-07")).toBeGreaterThanOrEqual(0);
    expect(at("- #general (text) · overwrites: 2 · last activity: 2026-11-07")).toBeLessThan(at("### Play"));
    expect(at("### Play")).toBeLessThan(at("- #games (text) · overwrites: 0 · last activity: never"));
    expect(at("- #games (text) · overwrites: 0 · last activity: never")).toBeLessThan(at("### Info"));
    expect(at("### Info")).toBeLessThan(at("- #rules (text) · overwrites: 0 · last activity: 2026-10-30"));
  });

  test("shows a channel with no category, and a voice channel, in the top group", () => {
    const lines = sectionOf(summarizeCrawl(snapshotOf({ channels })), "Channels");

    expect(lines).toContain("- #lobby (voice) · overwrites: 0 · last activity: never");
  });

  test("takes the last activity date from the snowflake of the last message", () => {
    const summary = summarizeCrawl(snapshotOf({ channels: [crawlChannel({ id: RULES_ID, name: "rules", type: 0, lastMessageId: snowflakeAt("2026-10-30T12:00:00.000Z") })] }));

    expect(lineWith(summary, "Channels", "#rules")).toContain("last activity: 2026-10-30");
  });

  const CHANNEL_TYPES: [number, string][] = [
    [0, "text"],
    [2, "voice"],
    [5, "announcement"],
    [13, "stage"],
    [15, "forum"],
    [16, "media"],
    [99, "type 99"],
  ];
  test.each(CHANNEL_TYPES)("names channel type %i as %s", (type, label) => {
    const summary = summarizeCrawl(snapshotOf({ channels: [crawlChannel({ id: CHANNEL_ID, name: "thing", type })] }));

    expect(sectionOf(summary, "Channels")).toContain(`(${label})`);
  });

  test("shows an empty channel name as (hidden)", () => {
    const summary = summarizeCrawl(snapshotOf({ channels: [crawlChannel({ id: CHANNEL_ID, name: "", type: 0 })] }));

    expect(sectionOf(summary, "Channels")).toContain("(hidden) (text)");
  });
});

describe("summarizeCrawl shows the Members figures and the joins per month when the Members are readable", () => {
  const members = [
    crawlMember({ id: "m1", username: "alpha", nickname: "Alpha of the Hall", joinedAt: "2026-01-05T10:00:00.000Z" }),
    crawlMember({ id: "m2", username: "bot-one", bot: true, roleIds: [BOT_ROLE_ID], joinedAt: "2026-01-20T10:00:00.000Z" }),
    crawlMember({ id: "m3", username: "charlie", pending: true, joinedAt: "2026-02-03T10:00:00.000Z" }),
    crawlMember({ id: "m4", username: "delta", roleIds: [MODERATOR_ROLE_ID], boostingSince: "2026-02-14T10:00:00.000Z", timeoutUntil: "2026-11-20T10:00:00.000Z", joinedAt: "2026-02-14T10:00:00.000Z" }),
    crawlMember({ id: "m5", username: "echo", timeoutUntil: "2026-11-01T10:00:00.000Z", joinedAt: "2026-03-10T10:00:00.000Z" }),
  ];

  const FIGURES: [string, number][] = [
    ["total", 5],
    ["humans", 4],
    ["bots", 1],
    ["pending", 1],
    ["nickname", 1],
    ["no role", 3],
    ["boosting", 1],
    ["timed out", 1],
  ];
  test.each(FIGURES)("shows the %s figure as %i", (label, figure) => {
    const summary = summarizeCrawl(snapshotOf({ members: readable(members) }));

    expect(sectionOf(summary, "Members")).toMatch(new RegExp(`${label}\\D*${String(figure)}\\b`, "i"));
  });

  test("lists the joins per month in ascending order", () => {
    const lines = sectionOf(summarizeCrawl(snapshotOf({ members: readable(members) })), "Members").split("\n");

    const at = (text: string): number => lines.indexOf(text);
    expect(at("- 2026-01: 2")).toBeGreaterThanOrEqual(0);
    expect(at("- 2026-01: 2")).toBeLessThan(at("- 2026-02: 2"));
    expect(at("- 2026-02: 2")).toBeLessThan(at("- 2026-03: 1"));
  });

  test("says Not readable. under Members when the Members could not be read", () => {
    const summary = summarizeCrawl(snapshotOf({ members: unreadable("403 Missing Access") }));

    expect(sectionOf(summary, "Members")).toContain("Not readable.");
  });
});

describe("summarizeCrawl shows the threads", () => {
  test("counts the active threads", () => {
    const summary = summarizeCrawl(snapshotOf({ activeThreads: readable([{ id: "a" }, { id: "b" }]) }));

    expect(sectionOf(summary, "Threads")).toMatch(/active\D*2\b/i);
  });

  test("says the active threads are not readable when they could not be read", () => {
    const summary = summarizeCrawl(snapshotOf({ activeThreads: unreadable("403 Missing Access") }));

    expect(sectionOf(summary, "Threads")).toMatch(/active[^\n]*not readable/i);
  });

  test("lists the archived threads of each channel that has some, and leaves out the channels with none", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        channels: [
          crawlChannel({ id: CHANNEL_ID, name: "general", type: 0 }),
          crawlChannel({ id: RULES_ID, name: "rules", type: 0 }),
        ],
        archivedThreads: {
          [CHANNEL_ID]: readable({ threads: [{ id: "x" }, { id: "y" }, { id: "z" }], hasMore: false }),
          [RULES_ID]: readable({ threads: [], hasMore: false }),
        },
      }),
    );

    const threads = sectionOf(summary, "Threads");
    expect(lineWith(summary, "Threads", "general")).toContain("3");
    expect(threads).not.toContain("rules");
  });

  test("notes + more where the first page of archived threads is not the last", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        channels: [crawlChannel({ id: ANNOUNCEMENT_ID, name: "news", type: 5 })],
        archivedThreads: { [ANNOUNCEMENT_ID]: readable({ threads: [{ id: "x" }, { id: "y" }], hasMore: true }) },
      }),
    );

    expect(lineWith(summary, "Threads", "news")).toContain("+ more");
  });
});

describe("summarizeCrawl shows the counts and names under Other", () => {
  test("counts the scheduled events, emojis and stickers", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        scheduledEvents: readable([{ id: "e1" }, { id: "e2" }]),
        emojis: readable([{ id: "m1" }, { id: "m2" }, { id: "m3" }]),
        stickers: readable([{ id: "s1" }]),
      }),
    );

    const other = sectionOf(summary, "Other");
    expect(other).toMatch(/scheduled\D*2\b/i);
    expect(other).toMatch(/emojis\D*3\b/i);
    expect(other).toMatch(/stickers\D*1\b/i);
  });

  test("names each auto moderation rule", () => {
    const summary = summarizeCrawl(
      snapshotOf({ autoModerationRules: readable([{ name: "Block slurs" }, { name: "Spam filter" }]) }),
    );

    expect(sectionOf(summary, "Other")).toContain("Block slurs");
    expect(sectionOf(summary, "Other")).toContain("Spam filter");
  });

  test("shows each invite's code, the channel it is for and its uses", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        channels: [crawlChannel({ id: CHANNEL_ID, name: "general", type: 0 })],
        invites: readable([{ code: "abc", channel_id: CHANNEL_ID, uses: 4 }]),
      }),
    );

    const line = lineWith(summary, "Other", "abc");
    expect(line).toContain("general");
    expect(line).toContain("4");
  });

  test("shows each webhook's name and the channel it posts to", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        channels: [crawlChannel({ id: CHANNEL_ID, name: "general", type: 0 })],
        webhooks: readable([{ name: "Board", channel_id: CHANNEL_ID }]),
      }),
    );

    const line = lineWith(summary, "Other", "Board");
    expect(line).toContain("general");
  });

  test("shows each integration as its name and its type", () => {
    const summary = summarizeCrawl(snapshotOf({ integrations: readable([{ name: "Twitch", type: "twitch" }]) }));

    expect(sectionOf(summary, "Other")).toContain("Twitch (twitch)");
  });

  test("counts the audit log entries per action type", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        auditLog: readable([{ action_type: 22 }, { action_type: 22 }, { action_type: 72 }]),
      }),
    );

    const other = sectionOf(summary, "Other");
    expect(other).toMatch(/\b22\b\D*2\b/);
    expect(other).toMatch(/\b72\b\D*1\b/);
  });

  test("says not readable where a section under Other could not be read", () => {
    const summary = summarizeCrawl(snapshotOf({ emojis: unreadable("403 Missing Access") }));

    expect(sectionOf(summary, "Other")).toMatch(/emojis\D*not readable/i);
  });
});

describe("summarizeCrawl never writes a Member's username, display name or nickname", () => {
  test("leaves out the username, display name and nickname of every Member", () => {
    const summary = summarizeCrawl(
      snapshotOf({
        members: readable([
          crawlMember({
            id: MEMBER_ID,
            username: "zq-login-7",
            displayName: "Zed Display",
            nickname: "Zed Nick",
            roleIds: [MODERATOR_ROLE_ID],
            joinedAt: "2026-01-05T10:00:00.000Z",
          }),
        ]),
        roles: [crawlRole({ id: MODERATOR_ROLE_ID, name: "Moderators", position: 7 })],
      }),
    );

    expect(summary).not.toContain("zq-login-7");
    expect(summary).not.toContain("Zed Display");
    expect(summary).not.toContain("Zed Nick");
  });
});
