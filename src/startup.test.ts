import { describe, expect, test } from "vitest";
import { ConfigError } from "./config.js";
import { formatStartupError } from "./startup.js";

const FAKE_TOKEN = "fake-token-never-shown-7f3a9c";

describe("formatStartupError", () => {
  test("prints a ConfigError as the heading plus one line per problem", () => {
    const error = new ConfigError(["DISCORD_TOKEN: required", "DATA_DIR: ./data is not writable"]);

    expect(formatStartupError(error, [FAKE_TOKEN])).toBe(
      [
        "Neil cannot start, configuration is invalid:",
        "- DISCORD_TOKEN: required",
        "- DATA_DIR: ./data is not writable",
      ].join("\n"),
    );
  });

  test("prints any other error as one line", () => {
    expect(formatStartupError(new Error("start record is corrupt"), [])).toBe(
      "Neil cannot start: start record is corrupt",
    );
  });

  test("prints something useful for a thrown non-error", () => {
    expect(formatStartupError("boom", [])).toBe("Neil cannot start: boom");
  });

  test("replaces every secret in the output", () => {
    const error = new Error(`login failed for ${FAKE_TOKEN} (again ${FAKE_TOKEN})`);

    const output = formatStartupError(error, [FAKE_TOKEN]);

    expect(output).not.toContain(FAKE_TOKEN);
    expect(output).toBe("Neil cannot start: login failed for [redacted] (again [redacted])");
  });

  test("ignores empty secrets", () => {
    expect(formatStartupError(new Error("x"), [""])).toBe("Neil cannot start: x");
  });
});
