import { describe, expect, test } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const VALID_SNOWFLAKE = "123456789012345678";
const MODERATOR_ROLE_ID = "223456789012345678";
const KING_ROLE_ID = "323456789012345678";
const FAKE_TOKEN = "fake-token-never-shown-7f3a9c";
const FAKE_API_KEY = "fake-api-key-never-shown-b81e4d";

function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DISCORD_TOKEN: FAKE_TOKEN,
    DISCORD_APPLICATION_ID: VALID_SNOWFLAKE,
    DISCORD_GUILD_ID: VALID_SNOWFLAKE,
    DISCORD_MODERATOR_ROLE_ID: MODERATOR_ROLE_ID,
    DISCORD_KING_ROLE_ID: KING_ROLE_ID,
    LAP_TRACKER_API_KEY: FAKE_API_KEY,
    ...overrides,
  };
}

function failureOf(env: Record<string, string | undefined>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected loadConfig to throw a ConfigError");
}

describe("loadConfig", () => {
  test("returns the Configuration for valid input", () => {
    const config = loadConfig(validEnv({ DATA_DIR: "/srv/neil" }));

    expect(config).toEqual({
      discordToken: FAKE_TOKEN,
      applicationId: VALID_SNOWFLAKE,
      guildId: VALID_SNOWFLAKE,
      officerRoleIds: [MODERATOR_ROLE_ID, KING_ROLE_ID],
      gameApiKey: FAKE_API_KEY,
      cacheTtlMs: 600_000,
      quotaReserve: 100,
      dataDir: "/srv/neil",
    });
  });

  test("DATA_DIR defaults to ./data when not set", () => {
    const config = loadConfig(validEnv());

    expect(config.dataDir).toBe("./data");
  });

  test("reports DISCORD_TOKEN as required when it is missing", () => {
    const error = failureOf(validEnv({ DISCORD_TOKEN: undefined }));

    expect(error.problems).toEqual(["DISCORD_TOKEN: required"]);
  });

  test("reports DISCORD_TOKEN as required when it is empty", () => {
    const error = failureOf(validEnv({ DISCORD_TOKEN: "" }));

    expect(error.problems).toEqual(["DISCORD_TOKEN: required"]);
  });

  test("reports DISCORD_APPLICATION_ID as required when it is missing", () => {
    const error = failureOf(validEnv({ DISCORD_APPLICATION_ID: undefined }));

    expect(error.problems).toEqual(["DISCORD_APPLICATION_ID: required"]);
  });

  test("reports DISCORD_GUILD_ID as required when it is missing", () => {
    const error = failureOf(validEnv({ DISCORD_GUILD_ID: undefined }));

    expect(error.problems).toEqual(["DISCORD_GUILD_ID: required"]);
  });

  test("reports DISCORD_MODERATOR_ROLE_ID as required when it is missing", () => {
    const error = failureOf(validEnv({ DISCORD_MODERATOR_ROLE_ID: undefined }));

    expect(error.problems).toEqual(["DISCORD_MODERATOR_ROLE_ID: required"]);
  });

  test("reports DISCORD_KING_ROLE_ID as required when it is missing", () => {
    const error = failureOf(validEnv({ DISCORD_KING_ROLE_ID: undefined }));

    expect(error.problems).toEqual(["DISCORD_KING_ROLE_ID: required"]);
  });

  test("reports LAP_TRACKER_API_KEY as required when it is missing", () => {
    const error = failureOf(validEnv({ LAP_TRACKER_API_KEY: undefined }));

    expect(error.problems).toEqual(["LAP_TRACKER_API_KEY: required"]);
  });

  test("reports LAP_TRACKER_API_KEY as required when it is empty", () => {
    const error = failureOf(validEnv({ LAP_TRACKER_API_KEY: "" }));

    expect(error.problems).toEqual(["LAP_TRACKER_API_KEY: required"]);
  });

  test("never shows the game API key value when other settings are invalid", () => {
    const error = failureOf(validEnv({ DISCORD_GUILD_ID: "42" }));

    expect(error.message).not.toContain(FAKE_API_KEY);
    for (const problem of error.problems) {
      expect(problem).not.toContain(FAKE_API_KEY);
    }
  });

  describe("Discord snowflake rule", () => {
    const rule = "must be a Discord ID (17–20 digits)";

    test.each([
      ["17 digits", "12345678901234567"],
      ["20 digits", "12345678901234567890"],
    ])("accepts a snowflake of %s", (_label, snowflake) => {
      const config = loadConfig(
        validEnv({ DISCORD_APPLICATION_ID: snowflake, DISCORD_GUILD_ID: snowflake }),
      );

      expect(config.applicationId).toBe(snowflake);
      expect(config.guildId).toBe(snowflake);
    });

    test.each([
      ["16 digits", "1234567890123456"],
      ["21 digits", "123456789012345678901"],
      ["letters", "12345678901234567a"],
      ["a mention-like value", "<@123456789012345678>"],
    ])("rejects DISCORD_GUILD_ID with %s", (_label, value) => {
      const error = failureOf(validEnv({ DISCORD_GUILD_ID: value }));

      expect(error.problems).toEqual([`DISCORD_GUILD_ID: ${rule}`]);
    });

    test.each([
      ["16 digits", "1234567890123456"],
      ["21 digits", "123456789012345678901"],
      ["letters", "12345678901234567a"],
    ])("rejects DISCORD_APPLICATION_ID with %s", (_label, value) => {
      const error = failureOf(validEnv({ DISCORD_APPLICATION_ID: value }));

      expect(error.problems).toEqual([`DISCORD_APPLICATION_ID: ${rule}`]);
    });
  });

  describe("officer role IDs", () => {
    const rule = "must be a Discord ID (17–20 digits)";
    const roleSettings = ["DISCORD_MODERATOR_ROLE_ID", "DISCORD_KING_ROLE_ID"] as const;

    test("exposes the Moderator role ID first and the King role ID second as officerRoleIds", () => {
      const config = loadConfig(
        validEnv({
          DISCORD_MODERATOR_ROLE_ID: "12345678901234567",
          DISCORD_KING_ROLE_ID: "12345678901234567890",
        }),
      );

      expect(config.officerRoleIds).toEqual(["12345678901234567", "12345678901234567890"]);
    });

    describe.each(roleSettings)("%s", (setting) => {
      test.each([
        ["16 digits", "1234567890123456"],
        ["21 digits", "123456789012345678901"],
        ["letters", "12345678901234567a"],
        ["a mention-like value", "<@123456789012345678>"],
      ])("rejects %s with %s", (_label, value) => {
        const error = failureOf(validEnv({ [setting]: value }));

        expect(error.problems).toEqual([`${setting}: ${rule}`]);
      });
    });
  });

  describe("GAME_API_CACHE_MINUTES", () => {
    const rule = "must be a whole number of at least 10";

    test("defaults to 10 minutes when it is not set", () => {
      const config = loadConfig(validEnv());

      expect(config.cacheTtlMs).toBe(600_000);
    });

    test.each([
      ["10", 600_000],
      ["45", 2_700_000],
    ])("converts GAME_API_CACHE_MINUTES %s into cacheTtlMs %d", (minutes, cacheTtlMs) => {
      const config = loadConfig(validEnv({ GAME_API_CACHE_MINUTES: minutes }));

      expect(config.cacheTtlMs).toBe(cacheTtlMs);
    });

    test.each([
      ["9 (below the minimum)", "9"],
      ["0", "0"],
      ["a fraction", "15.5"],
      ["words", "ten"],
    ])("rejects %s", (_label, value) => {
      const error = failureOf(validEnv({ GAME_API_CACHE_MINUTES: value }));

      expect(error.problems).toEqual([`GAME_API_CACHE_MINUTES: ${rule}`]);
    });

    test("never shows the GAME_API_CACHE_MINUTES value when it is invalid", () => {
      const error = failureOf(validEnv({ GAME_API_CACHE_MINUTES: "3.14159" }));

      expect(error.message).not.toContain("3.14159");
      for (const problem of error.problems) {
        expect(problem).not.toContain("3.14159");
      }
    });
  });

  describe("GAME_API_QUOTA_RESERVE", () => {
    const rule = "must be a whole number of at least 0";

    test("defaults to a Quota Reserve of 100 when it is not set", () => {
      const config = loadConfig(validEnv());

      expect(config.quotaReserve).toBe(100);
    });

    test.each([
      ["0", 0],
      ["250", 250],
    ])("reads GAME_API_QUOTA_RESERVE %s as a Quota Reserve of %d", (value, quotaReserve) => {
      const config = loadConfig(validEnv({ GAME_API_QUOTA_RESERVE: value }));

      expect(config.quotaReserve).toBe(quotaReserve);
    });

    test.each([
      ["-1 (negative)", "-1"],
      ["a fraction", "1.5"],
      ["words", "one hundred"],
    ])("rejects %s", (_label, value) => {
      const error = failureOf(validEnv({ GAME_API_QUOTA_RESERVE: value }));

      expect(error.problems).toEqual([`GAME_API_QUOTA_RESERVE: ${rule}`]);
    });

    test("never shows the GAME_API_QUOTA_RESERVE value when it is invalid", () => {
      const error = failureOf(validEnv({ GAME_API_QUOTA_RESERVE: "2.71828" }));

      expect(error.message).not.toContain("2.71828");
      for (const problem of error.problems) {
        expect(problem).not.toContain("2.71828");
      }
    });
  });

  test("reports every missing or invalid setting together, in one error", () => {
    const error = failureOf({
      DISCORD_GUILD_ID: "not-a-snowflake",
    });

    expect(error.problems).toEqual([
      "DISCORD_TOKEN: required",
      "DISCORD_APPLICATION_ID: required",
      "DISCORD_GUILD_ID: must be a Discord ID (17–20 digits)",
      "DISCORD_MODERATOR_ROLE_ID: required",
      "DISCORD_KING_ROLE_ID: required",
      "LAP_TRACKER_API_KEY: required",
    ]);
  });

  test("the error message names the failure and lists each problem on its own line", () => {
    const error = failureOf({
      DISCORD_TOKEN: FAKE_TOKEN,
      DISCORD_APPLICATION_ID: VALID_SNOWFLAKE,
      DISCORD_GUILD_ID: "16-digits-xxx",
      DISCORD_MODERATOR_ROLE_ID: MODERATOR_ROLE_ID,
      DISCORD_KING_ROLE_ID: KING_ROLE_ID,
      LAP_TRACKER_API_KEY: FAKE_API_KEY,
    });

    expect(error.message).toBe(
      "Neil cannot start, configuration is invalid:\n- DISCORD_GUILD_ID: must be a Discord ID (17–20 digits)",
    );
  });

  test("the error message lists every problem when several settings are invalid", () => {
    const error = failureOf({});

    expect(error.message).toBe(
      [
        "Neil cannot start, configuration is invalid:",
        "- DISCORD_TOKEN: required",
        "- DISCORD_APPLICATION_ID: required",
        "- DISCORD_GUILD_ID: required",
        "- DISCORD_MODERATOR_ROLE_ID: required",
        "- DISCORD_KING_ROLE_ID: required",
        "- LAP_TRACKER_API_KEY: required",
      ].join("\n"),
    );
  });

  test("never shows the token value when other settings are invalid", () => {
    const error = failureOf(validEnv({ DISCORD_GUILD_ID: "42", DISCORD_APPLICATION_ID: "nope" }));

    expect(error.message).not.toContain(FAKE_TOKEN);
    for (const problem of error.problems) {
      expect(problem).not.toContain(FAKE_TOKEN);
    }
  });
});
