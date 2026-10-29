// Placeholder on the deploy branch until the first CI deploy replaces it (slice 001).
// Checks the settings against Discord without printing any secret.
import { existsSync, readdirSync, readFileSync } from "node:fs";

console.log("Neil deploy placeholder");
console.log(`node ${process.version}, cwd ${process.cwd()}, git checkout: ${existsSync(".git") ? "yes" : "no"}`);
console.log(`files: ${readdirSync(".").join(", ")}`);
console.log(`variables in the environment (names only): ${Object.keys(process.env).sort().join(", ")}`);

if (existsSync(".env")) {
  const names = readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .map((line) => line.split("=")[0].trim())
    .filter((name) => name && !name.startsWith("#"));
  console.log(`.env exists with variables: ${names.join(", ") || "(none)"}`);
  process.loadEnvFile(".env");
} else {
  console.log(".env: not found");
}

const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID, DATA_DIR } = process.env;

console.log(
  `env: DISCORD_TOKEN ${DISCORD_TOKEN ? "set" : "missing"}, DISCORD_APPLICATION_ID ${DISCORD_APPLICATION_ID ?? "missing"}, ` +
    `DISCORD_GUILD_ID ${DISCORD_GUILD_ID ?? "missing"}, DATA_DIR ${DATA_DIR ?? "missing"}`,
);

if (DISCORD_TOKEN) {
  const discord = (path) =>
    fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${DISCORD_TOKEN.trim()}` } });

  const me = await discord("/users/@me");
  if (!me.ok) {
    console.log(`token check: Discord rejected the token (HTTP ${me.status}). Reset it in the developer portal and paste it again.`);
  } else {
    const bot = await me.json();
    console.log(`token check: OK, this is the bot "${bot.username}" (id ${bot.id})`);
    console.log(`application id matches: ${bot.id === DISCORD_APPLICATION_ID ? "yes" : "NO"}`);
    const guilds = await discord("/users/@me/guilds");
    const ids = guilds.ok ? (await guilds.json()).map((guild) => guild.id) : [];
    console.log(`bot is on the server DISCORD_GUILD_ID: ${ids.includes(DISCORD_GUILD_ID) ? "yes" : "NO (invite it, or check the ID)"}`);
  }
}
