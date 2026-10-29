import { describe, expect, test } from "vitest";
import { ConfigError, loadConfig } from "./config.js";

const VALID_SNOWFLAKE = "123456789012345678";
const FAKE_TOKEN = "fake-token-never-shown-7f3a9c";
const FAKE_API_KEY = "fake-api-key-never-shown-b81e4d";

function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DISCORD_TOKEN: FAKE_TOKEN,
    DISCORD_APPLICATION_ID: VALID_SNOWFLAKE,
    DISCORD_GUILD_ID: VALID_SNOWFLAKE,
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
      gameApiKey: FAKE_API_KEY,
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

  test("reports every missing or invalid setting together, in one error", () => {
    const error = failureOf({
      DISCORD_GUILD_ID: "not-a-snowflake",
    });

    expect(error.problems).toEqual([
      "DISCORD_TOKEN: required",
      "DISCORD_APPLICATION_ID: required",
      "DISCORD_GUILD_ID: must be a Discord ID (17–20 digits)",
      "LAP_TRACKER_API_KEY: required",
    ]);
  });

  test("the error message names the failure and lists each problem on its own line", () => {
    const error = failureOf({
      DISCORD_TOKEN: FAKE_TOKEN,
      DISCORD_APPLICATION_ID: VALID_SNOWFLAKE,
      DISCORD_GUILD_ID: "16-digits-xxx",
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
