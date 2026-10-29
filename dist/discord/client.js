import { Client, Events, GatewayIntentBits } from "discord.js";
import { handlePing } from "./ping.js";
import { handleAlliance, handlePlayer } from "./lookup.js";
/** A discord.js client with the least intents (Guilds) that routes each slash command to its handler. */
export function createClient(handlers, logError = console.error) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    // Without a listener, an emitted error would crash the process; discord.js reconnects by itself.
    client.on(Events.Error, (error) => {
        logError(`Discord client error: ${error.message}`);
    });
    client.on(Events.InteractionCreate, (interaction) => {
        if (!interaction.isChatInputCommand())
            return;
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
/** Logs in and answers the slash commands until disconnected; a rejected login rejects. */
export async function connect(token, options) {
    const logError = (message) => {
        console.error(message);
    };
    const client = createClient({
        ping: (interaction) => handlePing(interaction, {
            now: Date.now,
            gatewayPingMs: () => client.ws.ping,
            buildInfo: options.buildInfo,
            startRecord: options.startRecord,
            logError,
        }),
        player: (interaction) => handlePlayer(interaction, { gameApi: options.gameApi, logError }),
        alliance: (interaction) => handleAlliance(interaction, { gameApi: options.gameApi, logError }),
    });
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