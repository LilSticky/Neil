import { Client, Events, GatewayIntentBits, type InteractionReplyOptions } from "discord.js";
import { z } from "zod";
import type { BuildInfo } from "../build-info.js";
import type { GameApiClient } from "../game-api/client.js";
import type { StartRecord } from "../domain/start-record.js";
import { handlePing, type PingInteraction } from "./ping.js";
import { handleAlliance, handlePlayer, type LookupApi, type LookupInteraction } from "./lookup.js";
import { handleQuota } from "./quota.js";

/** The Game API client as connect uses it: the lookups and the Daily Quota figures. */
export type GameApi = LookupApi & Pick<GameApiClient, "quotaToday">;

/** The part of a discord.js chat-input interaction that /quota uses: who ran it, and the reply. */
export interface QuotaCommandInteraction {
  readonly member: unknown;
  reply(options: InteractionReplyOptions): Promise<unknown>;
}

/** One handler per slash command this client answers. */
export interface CommandHandlers {
  readonly ping: (interaction: PingInteraction) => Promise<void>;
  readonly player: (interaction: LookupInteraction) => Promise<void>;
  readonly alliance: (interaction: LookupInteraction) => Promise<void>;
  readonly quota: (interaction: QuotaCommandInteraction) => Promise<void>;
}

/** A guild member's roles, from the discord.js cache (a GuildMemberRoleManager) or from an API member (a string array). */
const memberSchema = z.union([
  z.object({ roles: z.array(z.string()) }).transform((member) => member.roles),
  z
    .object({ roles: z.object({ cache: z.map(z.string(), z.unknown()) }) })
    .transform((member) => [...member.roles.cache.keys()]),
]);

/** The role IDs of a Member, or none when the member is not in the shape discord.js gives. */
export function memberRoleIds(member: unknown): readonly string[] {
  const parsed = memberSchema.safeParse(member);
  return parsed.success ? parsed.data : [];
}

/** A discord.js client with the least intents (Guilds) that routes each slash command to its handler. */
export function createClient(
  handlers: CommandHandlers,
  logError: (message: string) => void = console.error,
): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  // Without a listener, an emitted error would crash the process; discord.js reconnects by itself.
  client.on(Events.Error, (error) => {
    logError(`Discord client error: ${error.message}`);
  });
  client.on(Events.InteractionCreate, (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    switch (interaction.commandName) {
      case "ping":
        void handlers.ping(interaction);
        break;
      case "player":
        void handlers.player(interaction);
        break;
      case "alliance":
        void handlers.alliance(interaction);
        break;
      case "quota":
        void handlers.quota(interaction);
        break;
    }
  });
  return client;
}

export interface ConnectOptions {
  readonly buildInfo: BuildInfo;
  readonly startRecord: StartRecord;
  readonly gameApi: GameApi;
  /** The Moderator and King role IDs from config; holders of either are Officers. */
  readonly officerRoleIds: readonly string[];
}

/** Logs in and answers the slash commands until disconnected; a rejected login rejects. */
export async function connect(token: string, options: ConnectOptions): Promise<{ disconnect(): Promise<void> }> {
  const logError = (message: string): void => {
    console.error(message);
  };
  const client: Client = createClient(
    {
      ping: (interaction) =>
        handlePing(interaction, {
          now: Date.now,
          gatewayPingMs: () => client.ws.ping,
          buildInfo: options.buildInfo,
          startRecord: options.startRecord,
          logError,
        }),
      player: (interaction) => handlePlayer(interaction, { gameApi: options.gameApi, now: () => new Date(), logError }),
      alliance: (interaction) =>
        handleAlliance(interaction, { gameApi: options.gameApi, now: () => new Date(), logError }),
      quota: (interaction) =>
        handleQuota(
          {
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
          },
          {
            quotaToday: () => options.gameApi.quotaToday(),
            officerRoleIds: options.officerRoleIds,
            now: () => new Date(),
            logError,
          },
        ),
    },
  );
  try {
    await client.login(token);
  } catch (error) {
    await client.destroy();
    throw error;
  }
  return { disconnect: () => client.destroy() };
}
