// Registers Neil's slash commands for the configured server only: `npm run commands:register`.
import { existsSync } from "node:fs";
import { REST, Routes } from "discord.js";
import { loadConfig } from "../src/config.js";
import { commands } from "../src/discord/commands.js";
import { formatStartupError } from "../src/startup.js";

if (existsSync(".env")) process.loadEnvFile(".env");

try {
  const config = loadConfig(process.env);
  const rest = new REST().setToken(config.discordToken);
  await rest.put(Routes.applicationGuildCommands(config.applicationId, config.guildId), { body: commands });
  console.log(`Registered ${commands.length.toString()} command(s) for server ${config.guildId}.`);
} catch (error) {
  console.error(formatStartupError(error, [process.env.DISCORD_TOKEN ?? ""]).replace("Neil cannot start", "Cannot register commands"));
  process.exitCode = 1;
}
