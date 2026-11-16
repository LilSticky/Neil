import { ChannelType, RESTJSONErrorCodes, type BaseMessageOptions } from "discord.js";
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

  test("finds the original nap-announcements, an announcement channel, and nap-leaders by name", () => {
    const server = cityRotationServerOf(guildOf([copy(), announcements(), leaders()]), { log: () => Promise.resolve() });

    expect(server.announcementsChannelId()).toBe("1");
    expect(server.leadersChannelId()).toBe("3");
  });

  test("has no channel ids when the channels are missing", () => {
    const server = cityRotationServerOf(guildOf([copy()]), { log: () => Promise.resolve() });

    expect(server.announcementsChannelId()).toBeUndefined();
    expect(server.leadersChannelId()).toBeUndefined();
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
});
