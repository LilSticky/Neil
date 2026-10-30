import { z } from "zod";
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
const schema = z.object({
    DISCORD_TOKEN: z.string(required).min(1, required),
    DISCORD_APPLICATION_ID: snowflake,
    DISCORD_GUILD_ID: snowflake,
    DISCORD_MODERATOR_ROLE_ID: snowflake,
    DISCORD_KING_ROLE_ID: snowflake,
    LAP_TRACKER_API_KEY: z.string(required).min(1, required),
    GAME_API_CACHE_MINUTES: z
        .string()
        .regex(/^\d+$/, cacheMinutesRule)
        .refine((value) => Number(value) >= DEFAULT_CACHE_MINUTES, cacheMinutesRule)
        .transform(Number)
        .optional(),
    DATA_DIR: z.string().min(1).default("./data"),
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
        gameApiKey: result.data.LAP_TRACKER_API_KEY,
        cacheTtlMs: (result.data.GAME_API_CACHE_MINUTES ?? DEFAULT_CACHE_MINUTES) * 60_000,
        dataDir: result.data.DATA_DIR,
    };
}
//# sourceMappingURL=config.js.map