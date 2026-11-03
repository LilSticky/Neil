import { z } from "zod";

export interface Configuration {
  readonly discordToken: string;
  readonly applicationId: string;
  readonly guildId: string;
  /** Moderator role ID first, King role ID second. */
  readonly officerRoleIds: readonly [string, string];
  readonly onboardingChannelId: string;
  readonly logChannelId: string;
  /** How long an Onboarding Interview may stay silent before it is abandoned. */
  readonly interviewTimeoutMs: number;
  readonly gameApiKey: string;
  readonly cacheTtlMs: number;
  /** Requests kept back for Onboarding Interviews; lookups stop when this many or fewer remain. */
  readonly quotaReserve: number;
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

const DEFAULT_CACHE_MINUTES = 10;
const cacheMinutesRule = `must be a whole number of at least ${DEFAULT_CACHE_MINUTES.toString()}`;

const DEFAULT_QUOTA_RESERVE = 100;
const quotaReserveRule = "must be a whole number of at least 0";

const DEFAULT_INTERVIEW_TIMEOUT_MINUTES = 1440;
/** One year: longer would mean no timeout at all, and far larger values break date arithmetic. */
const MAX_INTERVIEW_TIMEOUT_MINUTES = 525_600;
const interviewTimeoutRule = "must be a whole number from 1 to 525600 (one year)";

const schema = z.object({
  DISCORD_TOKEN: z.string(required).min(1, required),
  DISCORD_APPLICATION_ID: snowflake,
  DISCORD_GUILD_ID: snowflake,
  DISCORD_MODERATOR_ROLE_ID: snowflake,
  DISCORD_KING_ROLE_ID: snowflake,
  DISCORD_ONBOARDING_CHANNEL_ID: snowflake,
  DISCORD_LOG_CHANNEL_ID: snowflake,
  INTERVIEW_TIMEOUT_MINUTES: z
    .string()
    .regex(/^\d+$/, interviewTimeoutRule)
    .refine((value) => Number(value) >= 1 && Number(value) <= MAX_INTERVIEW_TIMEOUT_MINUTES, interviewTimeoutRule)
    .transform(Number)
    .optional(),
  LAP_TRACKER_API_KEY: z.string(required).min(1, required),
  GAME_API_CACHE_MINUTES: z
    .string()
    .regex(/^\d+$/, cacheMinutesRule)
    .refine((value) => Number(value) >= DEFAULT_CACHE_MINUTES, cacheMinutesRule)
    .transform(Number)
    .optional(),
  GAME_API_QUOTA_RESERVE: z
    .string()
    .regex(/^\d+$/, quotaReserveRule)
    .refine((value) => Number(value) <= Number.MAX_SAFE_INTEGER, quotaReserveRule)
    .transform(Number)
    .optional(),
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
    officerRoleIds: [result.data.DISCORD_MODERATOR_ROLE_ID, result.data.DISCORD_KING_ROLE_ID],
    onboardingChannelId: result.data.DISCORD_ONBOARDING_CHANNEL_ID,
    logChannelId: result.data.DISCORD_LOG_CHANNEL_ID,
    interviewTimeoutMs: (result.data.INTERVIEW_TIMEOUT_MINUTES ?? DEFAULT_INTERVIEW_TIMEOUT_MINUTES) * 60_000,
    gameApiKey: result.data.LAP_TRACKER_API_KEY,
    cacheTtlMs: (result.data.GAME_API_CACHE_MINUTES ?? DEFAULT_CACHE_MINUTES) * 60_000,
    quotaReserve: result.data.GAME_API_QUOTA_RESERVE ?? DEFAULT_QUOTA_RESERVE,
    dataDir: result.data.DATA_DIR,
  };
}
