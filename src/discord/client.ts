import { Client, Events, GatewayIntentBits } from "discord.js";
import type { BuildInfo } from "../build-info.js";
import type { StartRecord } from "../domain/start-record.js";
import { handlePing, type PingInteraction } from "./ping.js";

/** A discord.js client with the least intents (Guilds) that routes /ping to its handler. */
export function createClient(onPing: (interaction: PingInteraction) => Promise<void>): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === "ping") void onPing(interaction);
  });
  return client;
}

/** Logs in and answers /ping until disconnected; a rejected login rejects. */
export async function connect(
  token: string,
  ping: { readonly buildInfo: BuildInfo; readonly startRecord: StartRecord },
): Promise<{ disconnect(): Promise<void> }> {
  const client: Client = createClient((interaction) =>
    handlePing(interaction, {
      now: Date.now,
      gatewayPingMs: () => client.ws.ping,
      buildInfo: ping.buildInfo,
      startRecord: ping.startRecord,
      logError: (message) => {
        console.error(message);
      },
    }),
  );
  try {
    await client.login(token);
  } catch (error) {
    await client.destroy();
    throw error;
  }
  return { disconnect: () => client.destroy() };
}
