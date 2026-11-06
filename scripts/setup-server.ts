// Sets up the server's roles and channels from server-layout.json: `npm run server:setup` is a dry run, and
// `npm run server:setup -- --apply` is a real run (needs Administrator on Neil's role).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { REST } from "discord.js";
import { z } from "zod";
import { parseLayout, runSetup } from "../src/discord/server-setup.js";
import { createRestSetupServer } from "../src/discord/setup-server-rest.js";
import { formatStartupError } from "../src/startup.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const DEFAULT_LAYOUT = fileURLToPath(new URL("../server-layout.json", import.meta.url));
const settingsSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_GUILD_ID: z.string().regex(/^\d+$/),
  HOME_KINGDOM: z.coerce.number().int().min(1).max(9999),
});

/** The settings the script reads, named in the error when one is missing or wrong; no value is ever printed. */
function readSettings(env: NodeJS.ProcessEnv): z.infer<typeof settingsSchema> {
  const parsed = settingsSchema.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`check these settings: ${names.join(", ")}`);
  }
  return parsed.data;
}

try {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false }, layout: { type: "string", default: DEFAULT_LAYOUT } },
    strict: true,
  });
  const settings = readSettings(process.env);
  const layout = parseLayout(readFileSync(values.layout, "utf8"));
  const rest = new REST().setToken(settings.DISCORD_TOKEN);
  const { report, exitCode } = await runSetup({
    layout,
    homeKingdom: settings.HOME_KINGDOM,
    apply: values.apply,
    port: createRestSetupServer(rest, settings.DISCORD_GUILD_ID),
    secrets: [settings.DISCORD_TOKEN],
  });
  console.log(report);
  process.exitCode = exitCode;
} catch (error) {
  console.error(formatStartupError(error, [process.env.DISCORD_TOKEN ?? ""], "Cannot set up the server"));
  process.exitCode = 1;
}
