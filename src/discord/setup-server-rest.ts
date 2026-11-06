// The discord.js adapter behind SetupServer (slice 020, research R1): REST calls only, never a Client or the gateway.
// Every response is checked with zod before it reaches the setup.
import { ChannelType as DiscordChannelType, Routes } from "discord.js";
import { z } from "zod";
import type { ChannelType } from "../domain/server-layout.js";
import type { OverwriteEdit, SetupChannelInfo, SetupServer } from "./server-setup.js";

/**
 * The three REST calls the setup makes, the part of discord.js's REST it uses. The fake in the tests stands in for it, and
 * the REST object of the script fits it.
 */
export interface SetupRest {
  get(route: string): Promise<unknown>;
  post(route: string, options: { body: unknown }): Promise<unknown>;
  patch(route: string, options: { body: unknown }): Promise<unknown>;
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
    permission_overwrites: z.array(overwriteResponse),
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
      };
      return idResponse.parse(await rest.post(Routes.guildChannels(guildId), { body })).id;
    },
    async editOverwrites(channelId, overwrites) {
      await rest.patch(Routes.channel(channelId), { body: { permission_overwrites: encode(overwrites) } });
    },
  };
}
