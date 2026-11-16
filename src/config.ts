import { z } from "zod";
import type { CityRotationMode, SiegeTime } from "./domain/city-rotation.js";
import { parseKingdom, type KingdomNumber } from "./domain/lookup-input.js";

export interface Configuration {
  readonly discordToken: string;
  readonly applicationId: string;
  readonly guildId: string;
  /** Moderator role ID first, King role ID second. */
  readonly officerRoleIds: readonly [string, string];
  readonly onboardingChannelId: string;
  readonly logChannelId: string;
  /** The guides forum channel, named in the guides line of the Preferences message; undefined when not set. */
  readonly guidesForumId: string | undefined;
  /** How long an Onboarding Interview may stay silent before it is abandoned. */
  readonly interviewTimeoutMs: number;
  readonly gameApiKey: string;
  readonly cacheTtlMs: number;
  /** Requests kept back for Onboarding Interviews; lookups stop when this many or fewer remain. */
  readonly quotaReserve: number;
  readonly dataDir: string;
  /** The Home Kingdom: members of this Kingdom are Home Kingdom Players (FR-013). */
  readonly homeKingdom: KingdomNumber;
  /** The first level of each Troop Bracket T1…T10, strictly increasing (FR-006). */
  readonly troopBracketLevels: readonly number[];
  /** The UTC hour (0–23) at which the Daily Sync runs each day. */
  readonly syncHourUtc: number;
  /** Game API requests the Daily Sync may use per day; it never uses the Quota Reserve. */
  readonly syncShare: number;
  /** The Friday time of the Royal City siege in Server Time; undefined when not set, and then no after-siege step runs. */
  readonly royalCitySiegeTime: SiegeTime | undefined;
  /** Whether the Kingdom takes the Royal City in a City Rotation or fights over it (Contested). */
  readonly cityRotationMode: CityRotationMode;
  /** The War Council role: its holders plan the Raid (slice 034). Undefined when not set: Raid planning is off. */
  readonly warCouncilRoleId: string | undefined;
  /** The Raid's start on Saturday, in minutes after 00:00 Server Time; undefined when Raid planning is off. */
  readonly raidStartMinutes: number | undefined;
  /** The Plan Deadline, in whole hours before the Raid start. */
  readonly raidPlanDeadlineHours: number;
  /** The Confirmation Deadline, in whole hours before the Raid start; always fewer than the Plan Deadline's. */
  readonly raidConfirmationDeadlineHours: number;
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

const homeKingdomRule = "must be a whole number from 1 to 9999";

const DEFAULT_TROOP_BRACKET_LEVELS: readonly number[] = [1, 3, 6, 10, 14, 17, 20, 24, 27, 30];
const TROOP_BRACKET_COUNT = 10;
const troopBracketLevelsRule = "must be 1 to 10 whole numbers of at least 1, strictly increasing";

/** Comma-separated first levels; undefined when the text breaks the rule. */
function parseTroopBracketLevels(value: string): number[] | undefined {
  const parts = value.split(",");
  if (parts.length > TROOP_BRACKET_COUNT || !parts.every((part) => /^\d+$/.test(part))) return undefined;
  const levels = parts.map(Number);
  const increasing = levels.every((level, index) => level >= 1 && (index === 0 || level > (levels[index - 1] ?? 0)));
  return increasing ? levels : undefined;
}

const DEFAULT_SYNC_HOUR_UTC = 3;
const syncHourRule = "must be a whole number from 0 to 23";

const DEFAULT_SYNC_SHARE = 500;
const syncShareRule = "must be a whole number of at least 1";

const siegeTimeRule = "must be a time HH:MM from 00:00 to 23:59 (Server Time)";
const cityRotationModeRule = "must be rotation or contested";
const raidStartRule = "must be a time HH:MM from 00:00 to 23:59 (Server Time, Saturday)";
const raidPlanDeadlineRule = "must be a whole number of hours from 1 to 144";
const raidConfirmationDeadlineRule = "must be a whole number of hours from 0 to 143";
const raidDeadlinesOrderRule =
  "must be fewer hours than RAID_PLAN_DEADLINE_HOURS: the Plan Deadline comes before the Confirmation Deadline";
const raidStartRequiredRule = "required when DISCORD_WAR_COUNCIL_ROLE_ID is set";
const DEFAULT_RAID_PLAN_DEADLINE_HOURS = 24;
const DEFAULT_RAID_CONFIRMATION_DEADLINE_HOURS = 2;

/** Whole hours from `min` to `max`, as text. */
function hoursSetting(min: number, max: number, rule: string) {
  return z
    .string()
    .regex(/^\d+$/, rule)
    .refine((value) => Number(value) >= min && Number(value) <= max, rule)
    .transform(Number)
    .optional();
}

const schema = z.object({
  DISCORD_TOKEN: z.string(required).min(1, required),
  DISCORD_APPLICATION_ID: snowflake,
  DISCORD_GUILD_ID: snowflake,
  DISCORD_MODERATOR_ROLE_ID: snowflake,
  DISCORD_KING_ROLE_ID: snowflake,
  DISCORD_ONBOARDING_CHANNEL_ID: snowflake,
  DISCORD_LOG_CHANNEL_ID: snowflake,
  DISCORD_GUIDES_FORUM_ID: snowflake.optional(),
  HOME_KINGDOM: z
    .string(required)
    .min(1, required)
    .regex(/^\d+$/, homeKingdomRule)
    .transform((value, ctx): KingdomNumber => {
      const parsed = parseKingdom(Number(value));
      if (parsed.ok) return parsed.value;
      ctx.addIssue({ code: "custom", message: homeKingdomRule });
      return z.NEVER;
    }),
  TROOP_BRACKET_LEVELS: z
    .string()
    .transform((value, ctx): number[] => {
      const levels = parseTroopBracketLevels(value);
      if (levels !== undefined) return levels;
      ctx.addIssue({ code: "custom", message: troopBracketLevelsRule });
      return z.NEVER;
    })
    .optional(),
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
  SYNC_HOUR_UTC: z
    .string()
    .regex(/^\d+$/, syncHourRule)
    .refine((value) => Number(value) <= 23, syncHourRule)
    .transform(Number)
    .optional(),
  SYNC_SHARE: z
    .string()
    .regex(/^\d+$/, syncShareRule)
    .refine((value) => Number(value) >= 1 && Number(value) <= Number.MAX_SAFE_INTEGER, syncShareRule)
    .transform(Number)
    .optional(),
  ROYAL_CITY_SIEGE_TIME: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, siegeTimeRule)
    .transform((value): SiegeTime => ({ hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) }))
    .optional(),
  CITY_ROTATION_MODE: z.enum(["rotation", "contested"], cityRotationModeRule).optional(),
  DATA_DIR: z.string().min(1).default("./data"),
  DISCORD_WAR_COUNCIL_ROLE_ID: snowflake.optional(),
  RAID_START: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, raidStartRule)
    .transform((value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)))
    .optional(),
  RAID_PLAN_DEADLINE_HOURS: hoursSetting(1, 144, raidPlanDeadlineRule),
  RAID_CONFIRMATION_DEADLINE_HOURS: hoursSetting(0, 143, raidConfirmationDeadlineRule),
}).superRefine((data, ctx) => {
  if (data.DISCORD_WAR_COUNCIL_ROLE_ID !== undefined && data.RAID_START === undefined) {
    ctx.addIssue({ code: "custom", path: ["RAID_START"], message: raidStartRequiredRule });
  }
  const planHours = data.RAID_PLAN_DEADLINE_HOURS ?? DEFAULT_RAID_PLAN_DEADLINE_HOURS;
  const confirmationHours = data.RAID_CONFIRMATION_DEADLINE_HOURS ?? DEFAULT_RAID_CONFIRMATION_DEADLINE_HOURS;
  // A setting that already broke its own rule gets only that problem: the order is compared between valid hours alone.
  const valid = (hours: number, min: number, max: number): boolean => Number.isInteger(hours) && hours >= min && hours <= max;
  if (valid(planHours, 1, 144) && valid(confirmationHours, 0, 143) && confirmationHours >= planHours) {
    ctx.addIssue({ code: "custom", path: ["RAID_CONFIRMATION_DEADLINE_HOURS"], message: raidDeadlinesOrderRule });
  }
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
    guidesForumId: result.data.DISCORD_GUIDES_FORUM_ID,
    interviewTimeoutMs: (result.data.INTERVIEW_TIMEOUT_MINUTES ?? DEFAULT_INTERVIEW_TIMEOUT_MINUTES) * 60_000,
    gameApiKey: result.data.LAP_TRACKER_API_KEY,
    cacheTtlMs: (result.data.GAME_API_CACHE_MINUTES ?? DEFAULT_CACHE_MINUTES) * 60_000,
    quotaReserve: result.data.GAME_API_QUOTA_RESERVE ?? DEFAULT_QUOTA_RESERVE,
    dataDir: result.data.DATA_DIR,
    homeKingdom: result.data.HOME_KINGDOM,
    troopBracketLevels: result.data.TROOP_BRACKET_LEVELS ?? DEFAULT_TROOP_BRACKET_LEVELS,
    syncHourUtc: result.data.SYNC_HOUR_UTC ?? DEFAULT_SYNC_HOUR_UTC,
    syncShare: result.data.SYNC_SHARE ?? DEFAULT_SYNC_SHARE,
    royalCitySiegeTime: result.data.ROYAL_CITY_SIEGE_TIME,
    cityRotationMode: result.data.CITY_ROTATION_MODE ?? "rotation",
    warCouncilRoleId: result.data.DISCORD_WAR_COUNCIL_ROLE_ID,
    raidStartMinutes: result.data.RAID_START,
    raidPlanDeadlineHours: result.data.RAID_PLAN_DEADLINE_HOURS ?? DEFAULT_RAID_PLAN_DEADLINE_HOURS,
    raidConfirmationDeadlineHours:
      result.data.RAID_CONFIRMATION_DEADLINE_HOURS ?? DEFAULT_RAID_CONFIRMATION_DEADLINE_HOURS,
  };
}
