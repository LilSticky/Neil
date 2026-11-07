import { ChannelType, GuildScheduledEventStatus, type BaseMessageOptions } from "discord.js";
import { describe, expect, test } from "vitest";
import { FakeConnectGuild, type ConnectScheduledEvent } from "./__fakes__/connect-guild.js";
import { eventServerOf } from "./event-server.js";

const GUILD_ID = "123456789012345678";
const ANNOUNCEMENTS_ID = "700000000000000010";
const ALLIANCE_CHAT_ID = "700000000000000020";
const OTHER_CHAT_ID = "700000000000000021";
const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const CAROL = "333333333333333333";
const EVENT_ID = "800000000000000001";

/** The Interested users of the event used by the paging test: 150 of them, so two pages of 100 and 50. */
const INTERESTED = Array.from({ length: 150 }, (_, index) => `1${(index + 1).toString().padStart(17, "0")}`);

/** A scheduled event as discord.js lists it, in the guild the fake serves. */
function scheduledEvent(id: string): ConnectScheduledEvent {
  return {
    id,
    guildId: GUILD_ID,
    name: "Hive move",
    scheduledStartTimestamp: Date.parse("2026-11-20T18:00:00Z"),
    description: null,
    status: GuildScheduledEventStatus.Scheduled,
    creatorId: ALICE,
  };
}

/** The server adapter over the fake guild, with the log channel's messages recorded. */
function adapterOver(guild: FakeConnectGuild) {
  const logged: BaseMessageOptions[] = [];
  const server = eventServerOf(guild, {
    log: (message) => {
      logged.push(message);
      return Promise.resolve();
    },
  });
  return { server, logged };
}

describe("the Event invitation server over discord.js", () => {
  test("gives the ids of the Members who hold a role, by its name", async () => {
    const guild = new FakeConnectGuild([]);
    guild.defineRole("Events");
    guild.join(ALICE, ["Events"]);
    guild.join(BOB);
    guild.join(CAROL, ["Events"]);
    const { server } = adapterOver(guild);

    expect(await server.holdersOf("Events")).toEqual([ALICE, CAROL]);
  });

  test("gives the id and name of each role a Member holds", async () => {
    const guild = new FakeConnectGuild([]);
    const events = guild.defineRole("Events");
    const alliance = guild.defineRole("[ASH]");
    guild.join(ALICE, ["Events", "[ASH]"]);
    const { server } = adapterOver(guild);

    expect(await server.rolesOf(ALICE)).toEqual([
      { id: events.id, name: "Events" },
      { id: alliance.id, name: "[ASH]" },
    ]);
  });

  test("gives the id of #event-announcements", () => {
    const guild = new FakeConnectGuild([]);
    guild.addChannel(ANNOUNCEMENTS_ID, { type: ChannelType.GuildText, name: "event-announcements" });
    const { server } = adapterOver(guild);

    expect(server.announcementsChannelId()).toBe(ANNOUNCEMENTS_ID);
  });

  test("gives no #event-announcements when the server has none", () => {
    const guild = new FakeConnectGuild([]);
    const { server } = adapterOver(guild);

    expect(server.announcementsChannelId()).toBeUndefined();
  });

  test("gives the alliance-chat in the category of the Alliance's tag, and none for an Alliance without one", () => {
    const guild = new FakeConnectGuild([]);
    guild.addChannel(ALLIANCE_CHAT_ID, { type: ChannelType.GuildText, name: "alliance-chat", categoryName: "[ASH]" });
    guild.addChannel(OTHER_CHAT_ID, { type: ChannelType.GuildText, name: "alliance-chat", categoryName: "[OWL]" });
    const { server } = adapterOver(guild);

    expect(server.allianceChatId("ASH")).toBe(ALLIANCE_CHAT_ID);
    expect(server.allianceChatId("FOX")).toBeUndefined();
  });

  test("posts the message to the text channel and gives the link Discord gives it", async () => {
    const guild = new FakeConnectGuild([]);
    guild.addChannel(ANNOUNCEMENTS_ID, { type: ChannelType.GuildText, name: "event-announcements" });
    const { server } = adapterOver(guild);

    const link = await server.post(ANNOUNCEMENTS_ID, { content: "Hive move" });

    expect(link).toMatch(new RegExp(`^https://discord\\.com/channels/\\d+/${ANNOUNCEMENTS_ID}/\\d+$`));
    expect(guild.messagesIn(ANNOUNCEMENTS_ID)).toEqual(["Hive move"]);
  });

  test("refuses to post to a channel that is not a guild text channel", async () => {
    const guild = new FakeConnectGuild([]);
    guild.addChannel(ANNOUNCEMENTS_ID, { type: ChannelType.GuildVoice, name: "event-announcements" });
    const { server } = adapterOver(guild);

    await expect(server.post(ANNOUNCEMENTS_ID, { content: "Hive move" })).rejects.toThrow();
  });

  test("logs a line to #neil-log with mentions switched off", async () => {
    const guild = new FakeConnectGuild([]);
    const { server, logged } = adapterOver(guild);

    await server.log("The Event \"Hive move\" was invited, mentioning 2 Members.");

    expect(logged).toEqual([{ content: 'The Event "Hive move" was invited, mentioning 2 Members.', allowedMentions: { parse: [] } }]);
  });

  test("lists the scheduled events of the guild as discord.js gives them", async () => {
    const guild = new FakeConnectGuild([]);
    const events = [scheduledEvent("800000000000000001"), scheduledEvent("800000000000000002")];
    guild.setScheduledEvents(events);
    const { server } = adapterOver(guild);

    expect(await server.scheduledEvents()).toEqual(events);
  });

  test("reads the Interested Members a page of 100 at a time, from the last id of each page, until a page is short", async () => {
    const guild = new FakeConnectGuild([]);
    guild.setInterested(EVENT_ID, INTERESTED);
    const { server } = adapterOver(guild);

    expect(await server.interestedIn(EVENT_ID)).toEqual(INTERESTED);
    expect(guild.subscriberRequests.map((request) => request.limit)).toEqual([100, 100]);
    expect(guild.subscriberRequests.map((request) => request.after)).toEqual([undefined, INTERESTED[99]]);
  });

  test("tells whether a Member is still on the server", async () => {
    const guild = new FakeConnectGuild([]);
    guild.join(ALICE);
    const { server } = adapterOver(guild);

    expect(await server.isOnServer(ALICE)).toBe(true);
    expect(await server.isOnServer(BOB)).toBe(false);
  });
});
