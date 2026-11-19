import { ChannelType, RESTJSONErrorCodes, ThreadAutoArchiveDuration, type BaseMessageOptions } from "discord.js";
import { describe, expect, test } from "vitest";
import { cityRotationServerOf, type CityRotationGuildLike } from "./city-rotation-server.js";

interface FakeChannel {
  readonly id: string;
  readonly type: ChannelType;
  readonly name: string;
  readonly sent: BaseMessageOptions[];
  readonly edited: string[];
  readonly pinned: string[];
  editError?: Error;
  send(message: BaseMessageOptions): Promise<{ readonly id: string }>;
  readonly messages: { edit(messageId: string): Promise<unknown>; pin(messageId: string): Promise<void> };
  readonly created: unknown[];
  readonly added: string[];
  refuseAdd?: string;
  readonly threads: {
    create(options: unknown): Promise<{ readonly id: string; readonly members: { add(memberId: string): Promise<unknown> } }>;
  };
}

function channelOf(id: string, type: ChannelType, name: string): FakeChannel {
  const channel: FakeChannel = {
    id,
    type,
    name,
    sent: [],
    edited: [],
    pinned: [],
    send: (message) => {
      channel.sent.push(message);
      return Promise.resolve({ id: "800000000000000001" });
    },
    messages: {
      edit: (messageId) => {
        if (channel.editError !== undefined) return Promise.reject(channel.editError);
        channel.edited.push(messageId);
        return Promise.resolve();
      },
      pin: (messageId) => {
        channel.pinned.push(messageId);
        return Promise.resolve();
      },
    },
    created: [],
    added: [],
    threads: {
      create: (options) => {
        channel.created.push(options);
        return Promise.resolve({
          id: "900000000000000001",
          members: {
            add: (memberId) => {
              if (memberId === channel.refuseAdd) return Promise.reject(new Error("Unknown Member"));
              channel.added.push(memberId);
              return Promise.resolve();
            },
          },
        });
      },
    },
  };
  return channel;
}

function guildOf(channels: readonly FakeChannel[]): CityRotationGuildLike {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  return { channels: { cache: byId, fetch: (channelId) => Promise.resolve(byId.get(channelId) ?? null) } };
}

describe("cityRotationServerOf", () => {
  const announcements = (): FakeChannel => channelOf("1", ChannelType.GuildAnnouncement, "nap-announcements");
  const copy = (): FakeChannel => channelOf("2", ChannelType.GuildAnnouncement, "nap-announcements-german");
  const leaders = (): FakeChannel => channelOf("3", ChannelType.GuildText, "nap-leaders");
  const kingdomNews = (): FakeChannel => channelOf("4", ChannelType.GuildAnnouncement, "home-kingdom-announcements");

  test("finds the original nap-announcements, an announcement channel, and nap-leaders by name", () => {
    const server = cityRotationServerOf(guildOf([copy(), announcements(), leaders()]), { log: () => Promise.resolve() });

    expect(server.announcementsChannelId()).toBe("1");
    expect(server.leadersChannelId()).toBe("3");
  });

  test("finds home-kingdom-announcements by name for the news of a change", () => {
    const server = cityRotationServerOf(guildOf([announcements(), kingdomNews()]), { log: () => Promise.resolve() });

    expect(server.kingdomAnnouncementsChannelId()).toBe("4");
  });

  test("has no channel ids when the channels are missing", () => {
    const server = cityRotationServerOf(guildOf([copy()]), { log: () => Promise.resolve() });

    expect(server.announcementsChannelId()).toBeUndefined();
    expect(server.leadersChannelId()).toBeUndefined();
    expect(server.kingdomAnnouncementsChannelId()).toBeUndefined();
  });

  test("posts, edits and pins Neil's message", async () => {
    const channel = announcements();
    const server = cityRotationServerOf(guildOf([channel]), { log: () => Promise.resolve() });

    expect(await server.post("1", { content: "card" })).toBe("800000000000000001");
    expect(await server.edit("1", "800000000000000001", { content: "card" })).toBe(true);
    await server.pin("1", "800000000000000001");

    expect(channel.sent).toEqual([{ content: "card" }]);
    expect(channel.edited).toEqual(["800000000000000001"]);
    expect(channel.pinned).toEqual(["800000000000000001"]);
  });

  test("an edit of a message that is gone is false; any other failure is thrown", async () => {
    const channel = announcements();
    const server = cityRotationServerOf(guildOf([channel]), { log: () => Promise.resolve() });

    channel.editError = Object.assign(new Error("Unknown Message"), { code: RESTJSONErrorCodes.UnknownMessage });
    expect(await server.edit("1", "9", { content: "card" })).toBe(false);

    channel.editError = new Error("Missing Permissions");
    await expect(server.edit("1", "9", { content: "card" })).rejects.toThrow("Missing Permissions");
  });

  test("logs with mentions off", async () => {
    const logged: BaseMessageOptions[] = [];
    const server = cityRotationServerOf(guildOf([]), {
      log: (message) => {
        logged.push(message);
        return Promise.resolve();
      },
    });

    await server.log("a line");

    expect(logged).toEqual([{ content: "a line", allowedMentions: { parse: [] } }]);
  });

  test("posts into a thread of a channel too", async () => {
    const thread = channelOf("5", ChannelType.PrivateThread, "NaP report 1");
    const server = cityRotationServerOf(guildOf([thread]), { log: () => Promise.resolve() });

    expect(await server.post("5", { content: "report" })).toBe("800000000000000001");
    expect(thread.sent).toEqual([{ content: "report" }]);
  });

  test("opens a private thread that only Neil invites to, adds the Members, and names who could not be added", async () => {
    const channel = leaders();
    channel.refuseAdd = "222222222222222222";
    const server = cityRotationServerOf(guildOf([channel]), { log: () => Promise.resolve() });

    const opened = await server.openPrivateThread("3", "NaP report 1 · [XYZ]", ["111111111111111111", "222222222222222222"]);

    expect(opened).toEqual({ threadId: "900000000000000001", notAdded: ["222222222222222222"] });
    expect(channel.created).toEqual([
      {
        name: "NaP report 1 · [XYZ]",
        type: ChannelType.PrivateThread,
        invitable: false,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      },
    ]);
    expect(channel.added).toEqual(["111111111111111111"]);
  });

  test("opens a private thread only under a text channel", async () => {
    const server = cityRotationServerOf(guildOf([announcements()]), { log: () => Promise.resolve() });

    await expect(server.openPrivateThread("1", "NaP report 1", [])).rejects.toThrow("not a text channel");
    await expect(server.openPrivateThread("9", "NaP report 1", [])).rejects.toThrow("not a text channel");
  });
});
