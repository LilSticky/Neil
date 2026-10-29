import { Client, Events, GatewayIntentBits } from "discord.js";
import type { PingInteraction } from "./ping.js";

/** A discord.js client with the least intents (Guilds) that routes /ping to its handler. */
export function createClient(onPing: (interaction: PingInteraction) => Promise<void>): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === "ping") void onPing(interaction);
  });
  return client;
}
