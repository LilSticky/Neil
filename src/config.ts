import { z } from "zod";

export interface Configuration {
  readonly discordToken: string;
  readonly applicationId: string;
  readonly guildId: string;
  readonly gameApiKey: string;
  readonly dataDir: string;
}

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(["Neil cannot start, configuration is invalid:", ...problems.map((p) => `- ${p}`)].join("\n"));
    this.name = "ConfigError";
    this.problems = problems;
  }
}

const required = "required";
const snowflake = z
  .string(required)
  .min(1, required)
  .regex(/^\d{17,20}$/, "must be a Discord ID (17–20 digits)");

const schema = z.object({
  DISCORD_TOKEN: z.string(required).min(1, required),
  DISCORD_APPLICATION_ID: snowflake,
  DISCORD_GUILD_ID: snowflake,
  LAP_TRACKER_API_KEY: z.string(required).min(1, required),
  DATA_DIR: z.string().min(1).default("./data"),
});

/** Validates the environment; collects every problem and never echoes a value. */
export function loadConfig(env: Record<string, string | undefined>): Configuration {
  const result = schema.safeParse(env);
  if (!result.success) {
    // One problem per setting: an empty ID fails both `min` and `regex`, only the first is useful.
    const bySetting = new Map<string, string>();
    for (const issue of result.error.issues) {
      const setting = issue.path.join(".");
      if (!bySetting.has(setting)) bySetting.set(setting, `${setting}: ${issue.message}`);
    }
    throw new ConfigError([...bySetting.values()]);
  }
  return {
    discordToken: result.data.DISCORD_TOKEN,
    applicationId: result.data.DISCORD_APPLICATION_ID,
    guildId: result.data.DISCORD_GUILD_ID,
    gameApiKey: result.data.LAP_TRACKER_API_KEY,
    dataDir: result.data.DATA_DIR,
  };
}
