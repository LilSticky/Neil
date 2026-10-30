import { Client, Events, GatewayIntentBits } from "discord.js";
import type { BuildInfo } from "../build-info.js";
import type { StartRecord } from "../domain/start-record.js";
import { handlePing, type PingInteraction } from "./ping.js";
import { handleAlliance, handlePlayer, type LookupApi, type LookupInteraction } from "./lookup.js";

/** One handler per slash command this client answers. */
export interface CommandHandlers {
  readonly ping: (interaction: PingInteraction) => Promise<void>;
  readonly player: (interaction: LookupInteraction) => Promise<void>;
  readonly alliance: (interaction: LookupInteraction) => Promise<void>;
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
    }
  });
  return client;
}

export interface ConnectOptions {
  readonly buildInfo: BuildInfo;
  readonly startRecord: StartRecord;
  readonly gameApi: LookupApi;
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
