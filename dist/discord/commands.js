import { InteractionContextType, SlashCommandBuilder } from "discord.js";
/** Temporary; removed in a later slice. */
export const ping = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check that Neil is online")
    .setContexts(InteractionContextType.Guild);
/** Everything registered for the configured server, as REST payloads. */
export const commands = [ping.toJSON()];
//# sourceMappingURL=commands.js.map