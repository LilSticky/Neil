import { InteractionContextType, SlashCommandBuilder } from "discord.js";

/** Temporary; removed in a later slice. */
export const ping = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Check that Neil is online")
  .setContexts(InteractionContextType.Guild);

export const player = new SlashCommandBuilder()
  .setName("player")
  .setDescription("Look up a player by uid")
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName("uid")
      .setDescription("The player's uid (the number under the profile picture)")
      .setRequired(true)
      .setMaxLength(32),
  );

/** Everything registered for the configured server, as REST payloads. */
export const commands = [ping.toJSON(), player.toJSON()];
