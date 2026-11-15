// Reads one server with Neil Police's token and writes a snapshot and a summary (ADR 15, documentation/NEIL-POLICE.md):
// `npm run server:crawl -- --guild <server-id>`. REST only; it changes nothing.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { REST } from "discord.js";
import { z } from "zod";
import { crawlServer, summarizeCrawl } from "../src/discord/server-crawl.js";
import { formatStartupError } from "../src/startup.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const settingsSchema = z.object({
  NEIL_POLICE_TOKEN: z.string().trim().min(1),
  DATA_DIR: z.string().min(1).default("./data"),
});

try {
  const { values } = parseArgs({ options: { guild: { type: "string" } }, strict: true });
  const guildId = z.string().regex(/^\d{17,20}$/, "--guild <server-id> is required").safeParse(values.guild);
  if (!guildId.success) throw new Error("--guild <server-id> is required");
  const parsed = settingsSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`check these settings: ${names.join(", ")}`);
  }
  const settings = parsed.data;

  const now = new Date();
  const rest = new REST().setToken(settings.NEIL_POLICE_TOKEN);
  const snapshot = await crawlServer(rest, guildId.data, now);
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dir = resolve(settings.DATA_DIR, "crawl", `${guildId.data}-${stamp}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(join(dir, "summary.md"), summarizeCrawl(snapshot));

  const unreadable = Object.entries(snapshot)
    .filter(([, section]: [string, unknown]) => typeof section === "object" && section !== null && "readable" in section && section.readable === false)
    .map(([name]) => name);
  const members = snapshot.members.readable ? String(snapshot.members.data.length) : "?";
  console.log(
    `Crawled ${snapshot.guild.name}: ${String(snapshot.channels.length)} channels, ${String(snapshot.roles.length)} roles, ${members} members.`,
  );
  console.log(unreadable.length > 0 ? `Not readable: ${unreadable.join(", ")} (see summary.md).` : "Everything was readable.");
  console.log(`Written to ${dir}`);
  console.log("If Neil Police holds Administrator on this server, remove Neil Police from it now (ADR 15).");
} catch (error) {
  console.error(formatStartupError(error, [process.env.NEIL_POLICE_TOKEN ?? ""], "Cannot crawl the server"));
  process.exitCode = 1;
}
