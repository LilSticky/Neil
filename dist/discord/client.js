import { Client, Events, GatewayIntentBits } from "discord.js";
import { handlePing } from "./ping.js";
/** A discord.js client with the least intents (Guilds) that routes /ping to its handler. */
export function createClient(onPing, logError = console.error) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    // Without a listener, an emitted error would crash the process; discord.js reconnects by itself.
    client.on(Events.Error, (error) => {
        logError(`Discord client error: ${error.message}`);
    });
    client.on(Events.InteractionCreate, (interaction) => {
        if (interaction.isChatInputCommand() && interaction.commandName === "ping")
            void onPing(interaction);
    });
    return client;
}
/** Logs in and answers /ping until disconnected; a rejected login rejects. */
export async function connect(token, ping) {
    const client = createClient((interaction) => handlePing(interaction, {
        now: Date.now,
        gatewayPingMs: () => client.ws.ping,
        buildInfo: ping.buildInfo,
        startRecord: ping.startRecord,
        logError: (message) => {
            console.error(message);
        },
    }));
    try {
        await client.login(token);
    }
    catch (error) {
        await client.destroy();
        throw error;
    }
    return { disconnect: () => client.destroy() };
}
//# sourceMappingURL=client.js.map