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

export const alliance = new SlashCommandBuilder()
  .setName("alliance")
  .setDescription("Look up an alliance in a kingdom")
  .setContexts(InteractionContextType.Guild)
  .addIntegerOption((option) =>
    option
      .setName("kingdom")
      .setDescription("The kingdom number")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(9999),
  )
  .addStringOption((option) =>
    option
      .setName("alliance")
      .setDescription("The alliance tag, e.g. NML")
      .setRequired(true)
      .setMaxLength(40),
  );

export const quota = new SlashCommandBuilder()
  .setName("quota")
  .setDescription("Show today's Daily Quota of Game API requests (Officers)")
  .setContexts(InteractionContextType.Guild);

/** Everything registered for the configured server, as REST payloads. */
export const commands = [ping.toJSON(), player.toJSON(), alliance.toJSON(), quota.toJSON()];
