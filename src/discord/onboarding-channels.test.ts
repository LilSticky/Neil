import { ChannelType, PermissionFlagsBits } from "discord.js";
import { describe, expect, test } from "vitest";
import { FakeGuild } from "./__fakes__/guild.js";
import { checkChannels, createOnboardingChannels } from "./onboarding-channels.js";

const ONBOARDING_CHANNEL_ID = "1000000000000000001";
const LOG_CHANNEL_ID = "1000000000000000002";
const CHANNEL_IDS = { onboardingChannelId: ONBOARDING_CHANNEL_ID, logChannelId: LOG_CHANNEL_ID };
const MEMBER = { id: "310000000000000001", username: "sticky_fan" };
const APPROVER_ID = "310000000000000002";

interface NamedPermission {
  readonly name: string;
  readonly bit: bigint;
}

/** The bot permissions the onboarding channel needs (research R2). */
const ONBOARDING_PERMISSIONS: readonly NamedPermission[] = [
  { name: "ViewChannel", bit: PermissionFlagsBits.ViewChannel },
  { name: "SendMessagesInThreads", bit: PermissionFlagsBits.SendMessagesInThreads },
  { name: "CreatePrivateThreads", bit: PermissionFlagsBits.CreatePrivateThreads },
  { name: "ManageThreads", bit: PermissionFlagsBits.ManageThreads },
];

/** The bot permissions the log channel needs (research R2). */
const LOG_PERMISSIONS: readonly NamedPermission[] = [
  { name: "ViewChannel", bit: PermissionFlagsBits.ViewChannel },
  { name: "SendMessages", bit: PermissionFlagsBits.SendMessages },
];

function bitsOf(permissions: readonly NamedPermission[]): bigint[] {
  return permissions.map((permission) => permission.bit);
}

function bitsExcept(permissions: readonly NamedPermission[], missingName: string): bigint[] {
  return permissions.filter((permission) => permission.name !== missingName).map((permission) => permission.bit);
}

/** A guild where both channels are text channels and the bot holds every permission R2 asks for. */
function healthyGuild(): FakeGuild {
  const guild = new FakeGuild();
  guild.addChannel(ONBOARDING_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: bitsOf(ONBOARDING_PERMISSIONS) });
  guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: bitsOf(LOG_PERMISSIONS) });
  return guild;
}

describe("openThread", () => {
  test("creates a private, not invitable thread named after the member in the onboarding channel", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);

    const threadId = await channels.openThread(MEMBER);

    const thread = guild.get(threadId);
    expect(thread.parentId).toBe(ONBOARDING_CHANNEL_ID);
    expect(thread.threadOptions).toMatchObject({
      name: "Interview – sticky_fan",
      type: ChannelType.PrivateThread,
      invitable: false,
    });
  });

  test("cuts the thread name to 100 characters", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);

    const threadId = await channels.openThread({ id: MEMBER.id, username: "a".repeat(120) });

    expect(guild.get(threadId).threadOptions?.name).toBe(`Interview – ${"a".repeat(88)}`);
  });

  test("adds the member to the new thread", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);

    const threadId = await channels.openThread(MEMBER);

    expect([...guild.get(threadId).memberIds]).toEqual([MEMBER.id]);
  });
});

describe("post and edit", () => {
  test("posts the message in the thread and returns its id", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);
    const threadId = await channels.openThread(MEMBER);

    const messageId = await channels.post(threadId, { content: "Welcome, sticky_fan!" });

    expect(guild.get(threadId).sent.map((message) => ({ id: message.id, content: message.content }))).toEqual([
      { id: messageId, content: "Welcome, sticky_fan!" },
    ]);
  });

  test("edits a posted message in place, keeping its id", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);
    const threadId = await channels.openThread(MEMBER);
    const messageId = await channels.post(threadId, { content: "Is this you?" });

    await channels.edit(threadId, messageId, { content: "Done, sticky_fan." });

    expect(guild.get(threadId).sent.map((message) => ({ id: message.id, content: message.content }))).toEqual([
      { id: messageId, content: "Done, sticky_fan." },
    ]);
  });
});

describe("addToThread", () => {
  test("adds another Member to an existing thread", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);
    const threadId = await channels.openThread(MEMBER);

    await channels.addToThread(threadId, APPROVER_ID);

    expect([...guild.get(threadId).memberIds]).toContain(APPROVER_ID);
  });
});

describe("lockAndArchive and archive", () => {
  test("lockAndArchive locks the thread and archives it", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);
    const threadId = await channels.openThread(MEMBER);

    await channels.lockAndArchive(threadId);

    expect(guild.get(threadId).locked).toBe(true);
    expect(guild.get(threadId).archived).toBe(true);
  });

  test("archive archives the thread and leaves it unlocked", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);
    const threadId = await channels.openThread(MEMBER);

    await channels.archive(threadId);

    expect(guild.get(threadId).archived).toBe(true);
    expect(guild.get(threadId).locked).toBe(false);
  });
});

describe("log", () => {
  test("sends the line to the log channel and nothing to the onboarding channel", async () => {
    const guild = healthyGuild();
    const channels = createOnboardingChannels(guild, CHANNEL_IDS);

    await channels.log({ content: "sticky_fan linked to a Player." });

    expect(guild.get(LOG_CHANNEL_ID).sent.map((message) => message.content)).toEqual([
      "sticky_fan linked to a Player.",
    ]);
    expect(guild.get(ONBOARDING_CHANNEL_ID).sent).toEqual([]);
  });
});

describe("checkChannels", () => {
  test("reports no problem when both channels are text channels and the bot holds every permission", async () => {
    const guild = healthyGuild();

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([]);
  });

  test("reports the onboarding channel as missing when it does not exist", async () => {
    const guild = new FakeGuild();
    guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: bitsOf(LOG_PERMISSIONS) });

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([{ kind: "missing-channel", channel: "onboarding" }]);
  });

  test("reports the log channel as missing when it does not exist", async () => {
    const guild = new FakeGuild();
    guild.addChannel(ONBOARDING_CHANNEL_ID, {
      type: ChannelType.GuildText,
      botPermissions: bitsOf(ONBOARDING_PERMISSIONS),
    });

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([{ kind: "missing-channel", channel: "log" }]);
  });

  test("reports the onboarding channel as not a text channel when it is a voice channel", async () => {
    const guild = new FakeGuild();
    guild.addChannel(ONBOARDING_CHANNEL_ID, {
      type: ChannelType.GuildVoice,
      botPermissions: bitsOf(ONBOARDING_PERMISSIONS),
    });
    guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: bitsOf(LOG_PERMISSIONS) });

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([{ kind: "not-text-channel", channel: "onboarding" }]);
  });

  test("reports the log channel as not a text channel when it is a voice channel", async () => {
    const guild = new FakeGuild();
    guild.addChannel(ONBOARDING_CHANNEL_ID, {
      type: ChannelType.GuildText,
      botPermissions: bitsOf(ONBOARDING_PERMISSIONS),
    });
    guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildVoice, botPermissions: bitsOf(LOG_PERMISSIONS) });

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([{ kind: "not-text-channel", channel: "log" }]);
  });

  test.each(ONBOARDING_PERMISSIONS)("reports the onboarding channel when the bot lacks $name", async ({ name }) => {
    const guild = new FakeGuild();
    guild.addChannel(ONBOARDING_CHANNEL_ID, {
      type: ChannelType.GuildText,
      botPermissions: bitsExcept(ONBOARDING_PERMISSIONS, name),
    });
    guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: bitsOf(LOG_PERMISSIONS) });

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([
      { kind: "missing-permission", channel: "onboarding", permission: name },
    ]);
  });

  test.each(LOG_PERMISSIONS)("reports the log channel when the bot lacks $name", async ({ name }) => {
    const guild = new FakeGuild();
    guild.addChannel(ONBOARDING_CHANNEL_ID, {
      type: ChannelType.GuildText,
      botPermissions: bitsOf(ONBOARDING_PERMISSIONS),
    });
    guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildText, botPermissions: bitsExcept(LOG_PERMISSIONS, name) });

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([
      { kind: "missing-permission", channel: "log", permission: name },
    ]);
  });

  test("reports every problem, not only the first", async () => {
    const guild = new FakeGuild();
    guild.addChannel(LOG_CHANNEL_ID, { type: ChannelType.GuildVoice, botPermissions: bitsOf(LOG_PERMISSIONS) });

    expect(await checkChannels(guild, CHANNEL_IDS)).toEqual([
      { kind: "missing-channel", channel: "onboarding" },
      { kind: "not-text-channel", channel: "log" },
    ]);
  });
});
