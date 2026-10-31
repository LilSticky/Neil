import { Client, Events, GatewayIntentBits } from "discord.js";
import { z } from "zod";
import { handlePing } from "./ping.js";
import { handleAlliance, handlePlayer } from "./lookup.js";
import { handlePick } from "./pick.js";
import { PickSessions } from "./pick-sessions.js";
import { handleQuota } from "./quota.js";
/** The custom id prefix of every pick list component; other component custom ids are not Neil's. */
const PICK_PREFIX = "pick:";
/** A guild member's roles, from the discord.js cache (a GuildMemberRoleManager) or from an API member (a string array). */
const memberSchema = z.union([
    z.object({ roles: z.array(z.string()) }).transform((member) => member.roles),
    z
        .object({ roles: z.object({ cache: z.map(z.string(), z.unknown()) }) })
        .transform((member) => [...member.roles.cache.keys()]),
]);
/** The role IDs of a Member, or none when the member is not in the shape discord.js gives. */
export function memberRoleIds(member) {
    const parsed = memberSchema.safeParse(member);
    return parsed.success ? parsed.data : [];
}
/** A discord.js client with the least intents (Guilds) that routes each slash command to its handler. */
export function createClient(handlers, logError = console.error) {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    // Without a listener, an emitted error would crash the process; discord.js reconnects by itself.
    client.on(Events.Error, (error) => {
        logError(`Discord client error: ${error.message}`);
    });
    client.on(Events.InteractionCreate, (interaction) => {
        if (interaction.isChatInputCommand()) {
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
            return;
        }
        if ((interaction.isStringSelectMenu() || interaction.isButton()) &&
            interaction.customId.startsWith(PICK_PREFIX)) {
            void handlers.pick(interaction);
        }
    });
    return client;
}
/** Logs in and answers the slash commands until disconnected; a rejected login rejects. */
export async function connect(token, options) {
    const logError = (message) => {
        console.error(message);
    };
    // One store for every pick list: the lookups open them, the pick handler answers them.
    const pickSessions = new PickSessions();
    const now = () => new Date();
    const client = createClient({
        ping: (interaction) => handlePing(interaction, {
            now: Date.now,
            gatewayPingMs: () => client.ws.ping,
            buildInfo: options.buildInfo,
            startRecord: options.startRecord,
            logError,
        }),
        player: (interaction) => handlePlayer(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
        alliance: (interaction) => handleAlliance(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
        pick: (interaction) => handlePick(interaction, { gameApi: options.gameApi, pickSessions, now, logError }),
        quota: (interaction) => handleQuota({
            memberRoleIds: () => memberRoleIds(interaction.member),
            reply: (reply) => interaction.reply(reply),
        }, {
            quotaToday: () => options.gameApi.quotaToday(),
            quotaReserve: options.quotaReserve,
            officerRoleIds: options.officerRoleIds,
            now: () => new Date(),
            logError,
        }),
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