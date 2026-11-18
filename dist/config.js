import { z } from "zod";
import { parseKingdom } from "./domain/lookup-input.js";
import { isTroopBracket, tierOf } from "./domain/troop-bracket.js";
export class ConfigError extends Error {
    problems;
    constructor(problems) {
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
const DEFAULT_TROOP_BRACKET_LEVELS = [1, 3, 6, 10, 14, 17, 20, 24, 27, 30];
const TROOP_BRACKET_COUNT = 10;
const troopBracketLevelsRule = "must be 1 to 10 whole numbers of at least 1, strictly increasing";
/** Comma-separated first levels; undefined when the text breaks the rule. */
function parseTroopBracketLevels(value) {
    const parts = value.split(",");
    if (parts.length > TROOP_BRACKET_COUNT || !parts.every((part) => /^\d+$/.test(part)))
        return undefined;
    const levels = parts.map(Number);
    const increasing = levels.every((level, index) => level >= 1 && (index === 0 || level > (levels[index - 1] ?? 0)));
    return increasing ? levels : undefined;
}
const DEFAULT_SYNC_HOUR_UTC = 3;
const syncHourRule = "must be a whole number from 0 to 23";
const DEFAULT_SYNC_SHARE = 500;
const syncShareRule = "must be a whole number of at least 1";
const cityRotationModeRule = "must be rotation or contested";
const raidPlanDeadlineRule = "must be a whole number of hours from 1 to 144";
const raidConfirmationDeadlineRule = "must be a whole number of hours from 0 to 143";
const raidDeadlinesOrderRule = "must be fewer hours than RAID_PLAN_DEADLINE_HOURS: the Plan Deadline comes before the Confirmation Deadline";
const DEFAULT_RAID_PLAN_DEADLINE_HOURS = 24;
const DEFAULT_RAID_CONFIRMATION_DEADLINE_HOURS = 2;
const fighterBracketRule = "must be a Troop Bracket from T1 to T10";
const fighterMightRule = "must be a whole number of at least 1";
const DEFAULT_FIGHTER_CLASS_THRESHOLDS = {
    whale: { bracket: "T10", might: 150_000_000 },
    dolphin: { bracket: "T9", might: 60_000_000 },
    seal: { bracket: "T7", might: 20_000_000 },
};
/** A Fighter Class's Troop Bracket, T1 to T10. */
const fighterBracket = z
    .string()
    .transform((value, ctx) => {
    if (isTroopBracket(value))
        return value;
    ctx.addIssue({ code: "custom", message: fighterBracketRule });
    return z.NEVER;
})
    .optional();
/** A Fighter Class's Might, a whole number of at least 1. */
const fighterMight = z
    .string()
    .regex(/^\d+$/, fighterMightRule)
    .refine((value) => Number(value) >= 1 && Number(value) <= Number.MAX_SAFE_INTEGER, fighterMightRule)
    .transform(Number)
    .optional();
/** The Fighter Class thresholds from the settings, each missing one at its default. */
function fighterClassThresholdsOf(data) {
    const defaults = DEFAULT_FIGHTER_CLASS_THRESHOLDS;
    return {
        whale: { bracket: data.FIGHTER_WHALE_BRACKET ?? defaults.whale.bracket, might: data.FIGHTER_WHALE_MIGHT ?? defaults.whale.might },
        dolphin: {
            bracket: data.FIGHTER_DOLPHIN_BRACKET ?? defaults.dolphin.bracket,
            might: data.FIGHTER_DOLPHIN_MIGHT ?? defaults.dolphin.might,
        },
        seal: { bracket: data.FIGHTER_SEAL_BRACKET ?? defaults.seal.bracket, might: data.FIGHTER_SEAL_MIGHT ?? defaults.seal.might },
    };
}
/** The settings of a class that is not strictly above the next lower one, with the rule each breaks. */
function fighterOrderProblems(higher, lower) {
    const problems = [];
    const className = (name) => name.charAt(0) + name.slice(1).toLowerCase();
    if (tierOf(higher.threshold.bracket) <= tierOf(lower.threshold.bracket)) {
        problems.push({
            setting: `FIGHTER_${higher.name}_BRACKET`,
            message: `must be above FIGHTER_${lower.name}_BRACKET: a ${className(higher.name)} needs more than a ${className(lower.name)}`,
        });
    }
    if (higher.threshold.might <= lower.threshold.might) {
        problems.push({
            setting: `FIGHTER_${higher.name}_MIGHT`,
            message: `must be above FIGHTER_${lower.name}_MIGHT: a ${className(higher.name)} needs more than a ${className(lower.name)}`,
        });
    }
    return problems;
}
/** Whole hours from `min` to `max`, as text. */
function hoursSetting(min, max, rule) {
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
        .transform((value, ctx) => {
        const parsed = parseKingdom(Number(value));
        if (parsed.ok)
            return parsed.value;
        ctx.addIssue({ code: "custom", message: homeKingdomRule });
        return z.NEVER;
    }),
    TROOP_BRACKET_LEVELS: z
        .string()
        .transform((value, ctx) => {
        const levels = parseTroopBracketLevels(value);
        if (levels !== undefined)
            return levels;
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
    CITY_ROTATION_MODE: z.enum(["rotation", "contested"], cityRotationModeRule).optional(),
    DATA_DIR: z.string().min(1).default("./data"),
    DISCORD_WAR_COUNCIL_ROLE_ID: snowflake.optional(),
    RAID_PLAN_DEADLINE_HOURS: hoursSetting(1, 144, raidPlanDeadlineRule),
    RAID_CONFIRMATION_DEADLINE_HOURS: hoursSetting(0, 143, raidConfirmationDeadlineRule),
    FIGHTER_WHALE_BRACKET: fighterBracket,
    FIGHTER_WHALE_MIGHT: fighterMight,
    FIGHTER_DOLPHIN_BRACKET: fighterBracket,
    FIGHTER_DOLPHIN_MIGHT: fighterMight,
    FIGHTER_SEAL_BRACKET: fighterBracket,
    FIGHTER_SEAL_MIGHT: fighterMight,
}).superRefine((data, ctx) => {
    const planHours = data.RAID_PLAN_DEADLINE_HOURS ?? DEFAULT_RAID_PLAN_DEADLINE_HOURS;
    const confirmationHours = data.RAID_CONFIRMATION_DEADLINE_HOURS ?? DEFAULT_RAID_CONFIRMATION_DEADLINE_HOURS;
    // A setting that already broke its own rule gets only that problem: the order is compared between valid hours alone.
    const valid = (hours, min, max) => Number.isInteger(hours) && hours >= min && hours <= max;
    if (valid(planHours, 1, 144) && valid(confirmationHours, 0, 143) && confirmationHours >= planHours) {
        ctx.addIssue({ code: "custom", path: ["RAID_CONFIRMATION_DEADLINE_HOURS"], message: raidDeadlinesOrderRule });
    }
    // Whale strictly above Dolphin, Dolphin strictly above Seal, for the brackets and for the Might.
    const thresholds = fighterClassThresholdsOf(data);
    for (const problem of [
        ...fighterOrderProblems({ name: "WHALE", threshold: thresholds.whale }, { name: "DOLPHIN", threshold: thresholds.dolphin }),
        ...fighterOrderProblems({ name: "DOLPHIN", threshold: thresholds.dolphin }, { name: "SEAL", threshold: thresholds.seal }),
    ]) {
        ctx.addIssue({ code: "custom", path: [problem.setting], message: problem.message });
    }
});
/** Validates the environment; collects every problem and never echoes a value. */
export function loadConfig(env) {
    const result = schema.safeParse(env);
    if (!result.success) {
        // One problem per setting: an empty ID fails both `min` and `regex`, only the first is useful.
        const bySetting = new Map();
        for (const issue of result.error.issues) {
            const setting = issue.path.join(".");
            if (!bySetting.has(setting))
                bySetting.set(setting, `${setting}: ${issue.message}`);
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
        cityRotationMode: result.data.CITY_ROTATION_MODE ?? "rotation",
        warCouncilRoleId: result.data.DISCORD_WAR_COUNCIL_ROLE_ID,
        raidPlanDeadlineHours: result.data.RAID_PLAN_DEADLINE_HOURS ?? DEFAULT_RAID_PLAN_DEADLINE_HOURS,
        raidConfirmationDeadlineHours: result.data.RAID_CONFIRMATION_DEADLINE_HOURS ?? DEFAULT_RAID_CONFIRMATION_DEADLINE_HOURS,
        fighterClassThresholds: fighterClassThresholdsOf(result.data),
    };
}
//# sourceMappingURL=config.js.map