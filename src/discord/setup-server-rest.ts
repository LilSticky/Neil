// The discord.js adapter behind SetupServer (slice 020, research R1): REST calls only, never a Client or the gateway.
// Every response is checked with zod before it reaches the setup.
import { ChannelType as DiscordChannelType, Routes } from "discord.js";
import { z } from "zod";
import type { ChannelType } from "../domain/server-layout.js";
import type { OverwriteEdit, SetupChannelInfo, SetupServer } from "./server-setup.js";

/**
 * The REST calls the setup makes, the part of discord.js's REST it uses. The fake in the tests stands in for it, and
 * the REST object of the script fits it.
 */
export interface SetupRest {
  get(route: string): Promise<unknown>;
  post(route: string, options: { body: unknown }): Promise<unknown>;
  patch(route: string, options: { body: unknown }): Promise<unknown>;
  put(route: string, options?: { body?: unknown }): Promise<unknown>;
  delete(route: string): Promise<unknown>;
}

const DISCORD_TYPE: Record<ChannelType, DiscordChannelType> = {
  text: DiscordChannelType.GuildText,
  voice: DiscordChannelType.GuildVoice,
  forum: DiscordChannelType.GuildForum,
  announcement: DiscordChannelType.GuildAnnouncement,
};
/** The channel kinds the setup knows. Other kinds (stage, directory, threads) are left out of the read. */
const KIND_OF_DISCORD_TYPE = new Map<number, "category" | ChannelType>([
  [DiscordChannelType.GuildCategory, "category"],
  [DiscordChannelType.GuildText, "text"],
  [DiscordChannelType.GuildVoice, "voice"],
  [DiscordChannelType.GuildForum, "forum"],
  [DiscordChannelType.GuildAnnouncement, "announcement"],
]);

const bits = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => BigInt(value));
const idResponse = z.object({ id: z.string() });
const guildResponse = z.object({ id: z.string(), features: z.array(z.string()) });
const memberResponse = z.object({ roles: z.array(z.string()) });
const rolesResponse = z.array(
  z.object({ id: z.string(), name: z.string(), permissions: bits, managed: z.boolean(), position: z.number().int() }),
);
const overwriteResponse = z.object({
  id: z.string(),
  type: z.union([z.literal(0), z.literal(1)]),
  allow: bits,
  deny: bits,
});
const channelsResponse = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    type: z.number().int(),
    parent_id: z.string().nullish(),
    topic: z.string().nullish(),
    permission_overwrites: z.array(overwriteResponse),
  }),
);
const pinsResponse = z.object({
  items: z.array(
    z.object({
      message: z.object({
        id: z.string(),
        content: z.string(),
        author: z.object({ id: z.string() }),
      }),
    }),
  ),
});
/** Discord's 403 (Missing Access): a channel whose pins Neil cannot see without Administrator. */
const forbiddenResponse = z.object({ status: z.literal(403) });
/** Discord's type 6 message: the notice a channel writes when a message is pinned. */
const PIN_NOTICE_TYPE = 6;
const oldestMessagesResponse = z.array(
  z.object({
    id: z.string(),
    content: z.string(),
    author: z.object({ id: z.string() }),
  }),
);
/** How many of a channel's oldest messages are read to find Neil's unpinned description. */
const OLDEST_MESSAGES = 50;
const messagesResponse = z.array(
  z.object({
    id: z.string(),
    type: z.number().int(),
    message_reference: z.object({ message_id: z.string().optional() }).nullish(),
  }),
);

/** The SetupServer of one guild, over Discord's REST API with the bot's token. */
export function createRestSetupServer(rest: SetupRest, guildId: string): SetupServer {
  let botUser: Promise<string> | undefined;
  /** Neil's user id, from GET /users/@me, asked once. */
  const botUserId = (): Promise<string> => {
    botUser ??= rest.get(Routes.user()).then((response) => idResponse.parse(response).id);
    return botUser;
  };

  /** The overwrites as Discord's request body, each with the type the setup gave it. */
  const encode = (overwrites: readonly OverwriteEdit[]) =>
    overwrites.map((overwrite) => ({
      id: overwrite.targetId,
      type: overwrite.type,
      allow: overwrite.allow.toString(),
      deny: overwrite.deny.toString(),
    }));

  /** Deletes a message on a best-effort basis: a refusal is swallowed, the message stays, and the caller goes on. */
  const deleteQuietly = async (route: string): Promise<void> => {
    try {
      await rest.delete(route);
    } catch {
      // The message stays where it is; nothing the setup can do about it now.
    }
  };

  /**
   * Deletes the type 6 notice Discord writes when a message is pinned; the notice references the pinned message. The pin is
   * already in place, so a reply that is not a message list leaves the notice where it is rather than failing the post.
   */
  const deletePinNotice = async (channelId: string, messageId: string): Promise<void> => {
    const listed = messagesResponse.safeParse(await rest.get(`${Routes.channelMessages(channelId)}?limit=10`));
    if (!listed.success) return;
    const notices = listed.data.filter(
      (message) => message.type === PIN_NOTICE_TYPE && message.message_reference?.message_id === messageId,
    );
    for (const notice of notices) {
      await deleteQuietly(Routes.channelMessage(channelId, notice.id));
    }
  };

  return {
    async readGuild() {
      const guild = guildResponse.parse(await rest.get(Routes.guild(guildId)));
      return { id: guild.id, features: guild.features };
    },
    async readBotMember() {
      const userId = await botUserId();
      const member = memberResponse.parse(await rest.get(Routes.guildMember(guildId, userId)));
      return { userId, roleIds: member.roles };
    },
    async readRoles() {
      return rolesResponse.parse(await rest.get(Routes.guildRoles(guildId)));
    },
    async readChannels(): Promise<SetupChannelInfo[]> {
      const channels = channelsResponse.parse(await rest.get(Routes.guildChannels(guildId)));
      return channels.flatMap((channel) => {
        const kind = KIND_OF_DISCORD_TYPE.get(channel.type);
        if (kind === undefined) return [];
        return [
          {
            id: channel.id,
            name: channel.name,
            kind,
            parentId: channel.parent_id ?? undefined,
            overwrites: channel.permission_overwrites.map((overwrite) => ({
              targetId: overwrite.id,
              type: overwrite.type,
              allow: overwrite.allow,
              deny: overwrite.deny,
            })),
            topic: channel.topic ?? undefined,
          },
        ];
      });
    },
    async createRole(name) {
      const body = { name, permissions: "0", hoist: false, mentionable: false };
      const role = idResponse.parse(await rest.post(Routes.guildRoles(guildId), { body }));
      return role.id;
    },
    async createCategory(name, overwrites) {
      const body = { name, type: DiscordChannelType.GuildCategory, permission_overwrites: encode(overwrites) };
      return idResponse.parse(await rest.post(Routes.guildChannels(guildId), { body })).id;
    },
    async createChannel(channel) {
      const body = {
        name: channel.name,
        type: DISCORD_TYPE[channel.type],
        parent_id: channel.parentId,
        permission_overwrites: encode(channel.overwrites),
        topic: channel.topic,
      };
      return idResponse.parse(await rest.post(Routes.guildChannels(guildId), { body })).id;
    },
    async editOverwrites(channelId, overwrites) {
      await rest.patch(Routes.channel(channelId), { body: { permission_overwrites: encode(overwrites) } });
    },
    async setTopic(channelId, topic) {
      await rest.patch(Routes.channel(channelId), { body: { topic } });
    },
    async readPins(channelId) {
      let response: unknown;
      try {
        response = await rest.get(Routes.channelMessagesPins(channelId));
      } catch (error) {
        if (forbiddenResponse.safeParse(error).success) return undefined;
        throw error;
      }
      const pins = pinsResponse.parse(response);
      return pins.items.map((item) => ({
        messageId: item.message.id,
        authorId: item.message.author.id,
        content: item.message.content,
      }));
    },
    async postPinnedMessage(channelId, content) {
      const body = { content, allowed_mentions: { parse: [] } };
      const messageId = idResponse.parse(await rest.post(Routes.channelMessages(channelId), { body })).id;
      try {
        await rest.put(Routes.channelMessagesPin(channelId, messageId));
      } catch (error) {
        // An unpinned message would be a stray post: take it back down, then report why the pin failed.
        await deleteQuietly(Routes.channelMessage(channelId, messageId));
        throw error;
      }
      await deletePinNotice(channelId, messageId);
      return messageId;
    },
    async readOldestMessages(channelId) {
      let response: unknown;
      try {
        response = await rest.get(`${Routes.channelMessages(channelId)}?after=0&limit=${String(OLDEST_MESSAGES)}`);
      } catch (error) {
        if (forbiddenResponse.safeParse(error).success) return undefined;
        throw error;
      }
      return oldestMessagesResponse
        .parse(response)
        .map((message) => ({ messageId: message.id, authorId: message.author.id, content: message.content }))
        .sort((a, b) => (BigInt(a.messageId) < BigInt(b.messageId) ? -1 : 1));
    },
    async postMessage(channelId, content) {
      const body = { content, allowed_mentions: { parse: [] } };
      return idResponse.parse(await rest.post(Routes.channelMessages(channelId), { body })).id;
    },
    async editMessage(channelId, messageId, content) {
      await rest.patch(Routes.channelMessage(channelId, messageId), {
        body: { content, allowed_mentions: { parse: [] } },
      });
    },
  };
}
