// The environment the Police MCP server starts with (documentation/NEIL-POLICE.md section 3): Police's token and guild
// ids from the process or the .env, and nothing else that Neil or the machine holds.
import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLSETS, policeMcpEnv, type PoliceMcpEnv } from "./police-mcp-env.js";

const POLICE_TOKEN = "police-token-abc";
const GUILD_ID = "123456789012345678";
const PROBLEM_MISSING_TOKEN_AND_GUILDS = "check these settings: NEIL_POLICE_TOKEN, NEIL_POLICE_GUILD_IDS";

/** The settings that must be present for the Police environment to be built. */
const validDotenv = { NEIL_POLICE_TOKEN: POLICE_TOKEN, NEIL_POLICE_GUILD_IDS: GUILD_ID };

function expectAccepted(result: PoliceMcpEnv): Record<string, string> {
  if (!result.ok) {
    throw new Error(`expected the settings to be accepted, got: ${result.problem}`);
  }
  return result.env;
}

function expectRefused(result: PoliceMcpEnv): string {
  if (result.ok) {
    throw new Error("expected the settings to be refused");
  }
  return result.problem;
}

describe("policeMcpEnv", () => {
  describe("reading the settings", () => {
    it("reads the token and the guild ids from the dotenv when the process has none", () => {
      const env = expectAccepted(policeMcpEnv(validDotenv, {}));

      expect(env.DISCORD_TOKEN).toBe(POLICE_TOKEN);
      expect(env.DISCORD_ALLOWED_GUILDS).toBe(GUILD_ID);
    });

    it("prefers a setting from the process environment over the dotenv", () => {
      const env = expectAccepted(
        policeMcpEnv(validDotenv, {
          NEIL_POLICE_TOKEN: "token-from-process",
          NEIL_POLICE_GUILD_IDS: "12345678901234567",
        }),
      );

      expect(env.DISCORD_TOKEN).toBe("token-from-process");
      expect(env.DISCORD_ALLOWED_GUILDS).toBe("12345678901234567");
    });
  });

  describe("required settings", () => {
    it("refuses naming only NEIL_POLICE_TOKEN when the token is missing", () => {
      expect(policeMcpEnv({ NEIL_POLICE_GUILD_IDS: GUILD_ID }, {})).toEqual({
        ok: false,
        problem: "check these settings: NEIL_POLICE_TOKEN",
      });
    });

    it("refuses naming only NEIL_POLICE_GUILD_IDS when the guild ids are missing", () => {
      expect(policeMcpEnv({ NEIL_POLICE_TOKEN: POLICE_TOKEN }, {})).toEqual({
        ok: false,
        problem: "check these settings: NEIL_POLICE_GUILD_IDS",
      });
    });

    it("refuses naming both settings, in that order, when both are missing", () => {
      expect(policeMcpEnv({}, {})).toEqual({ ok: false, problem: PROBLEM_MISSING_TOKEN_AND_GUILDS });
    });

    it("treats a whitespace-only token as missing", () => {
      expect(policeMcpEnv({ ...validDotenv, NEIL_POLICE_TOKEN: "   " }, {})).toEqual({
        ok: false,
        problem: "check these settings: NEIL_POLICE_TOKEN",
      });
    });

    it("refuses naming NEIL_POLICE_GUILD_IDS when the guild ids hold only separators", () => {
      expect(policeMcpEnv({ ...validDotenv, NEIL_POLICE_GUILD_IDS: " , ,, " }, {})).toEqual({
        ok: false,
        problem: "check these settings: NEIL_POLICE_GUILD_IDS",
      });
    });
  });

  describe("guild ids", () => {
    it("accepts 17 to 20 digit ids, trims them, ignores empty entries and joins them with a comma", () => {
      const env = expectAccepted(
        policeMcpEnv(
          { ...validDotenv, NEIL_POLICE_GUILD_IDS: " 12345678901234567 ,, 12345678901234567890 , " },
          {},
        ),
      );

      expect(env.DISCORD_ALLOWED_GUILDS).toBe("12345678901234567,12345678901234567890");
    });

    it.each(["1234567890123456", "123456789012345678901", "12345abc", "12345678901234567-"])(
      "refuses naming NEIL_POLICE_GUILD_IDS when an entry is %s",
      (badId) => {
        expect(policeMcpEnv({ ...validDotenv, NEIL_POLICE_GUILD_IDS: `${GUILD_ID},${badId}` }, {})).toEqual({
          ok: false,
          problem: "check these settings: NEIL_POLICE_GUILD_IDS",
        });
      },
    );
  });

  describe("problem text", () => {
    it("never repeats a token or guild id value", () => {
      const problem = expectRefused(
        policeMcpEnv({ NEIL_POLICE_TOKEN: "tok-SECRET-123", NEIL_POLICE_GUILD_IDS: "42-LEAK" }, {}),
      );

      expect(problem).toBe("check these settings: NEIL_POLICE_GUILD_IDS");
      expect(problem).not.toContain("tok-SECRET-123");
      expect(problem).not.toContain("42-LEAK");
    });
  });

  describe("environment passed to the MCP server", () => {
    it("builds exactly the allow-listed system variables, the Police token, the guild ids and the toolsets", () => {
      const processEnv = {
        PATH: "p1",
        Path: "p2",
        PATHEXT: "p3",
        SystemRoot: "p4",
        SYSTEMROOT: "p5",
        windir: "p6",
        ComSpec: "p7",
        TEMP: "p8",
        TMP: "p9",
        HOME: "p10",
        USERPROFILE: "p11",
        APPDATA: "p12",
        LOCALAPPDATA: "p13",
        OPENAI_API_KEY: "not-passed",
        SOME_FLAG: "not-passed",
      };

      const env = expectAccepted(policeMcpEnv(validDotenv, processEnv));

      expect(Object.keys(env).sort()).toEqual(
        [
          "APPDATA",
          "ComSpec",
          "DISCORD_ALLOWED_GUILDS",
          "DISCORD_MCP_TOOLSETS",
          "DISCORD_TOKEN",
          "HOME",
          "LOCALAPPDATA",
          "Path",
          "PATH",
          "PATHEXT",
          "SYSTEMROOT",
          "SystemRoot",
          "TEMP",
          "TMP",
          "USERPROFILE",
          "windir",
        ].sort(),
      );
      expect(env.PATH).toBe("p1");
      expect(env.Path).toBe("p2");
      expect(env.LOCALAPPDATA).toBe("p13");
    });

    it("builds only the Police settings when the process has no system variables", () => {
      const env = expectAccepted(policeMcpEnv(validDotenv, {}));

      expect(Object.keys(env).sort()).toEqual(["DISCORD_ALLOWED_GUILDS", "DISCORD_MCP_TOOLSETS", "DISCORD_TOKEN"]);
    });

    it("trims the token before passing it on", () => {
      const env = expectAccepted(policeMcpEnv({ ...validDotenv, NEIL_POLICE_TOKEN: "  police-token-abc  " }, {}));

      expect(env.DISCORD_TOKEN).toBe(POLICE_TOKEN);
    });

    it("passes none of Neil's secrets or settings, from the process or the dotenv", () => {
      const neilSecrets = {
        DISCORD_TOKEN: "neil-token-value",
        DISCORD_GUILD_ID: "999999999999999999",
        LAP_TRACKER_API_KEY: "neil-lap-key-value",
      };

      const env = expectAccepted(policeMcpEnv({ ...validDotenv, ...neilSecrets }, neilSecrets));

      expect(env.DISCORD_TOKEN).toBe(POLICE_TOKEN);
      expect(env).not.toHaveProperty("DISCORD_GUILD_ID");
      expect(env).not.toHaveProperty("LAP_TRACKER_API_KEY");
      expect(Object.values(env)).not.toContain("neil-token-value");
      expect(Object.values(env)).not.toContain("neil-lap-key-value");
      expect(Object.values(env)).not.toContain("999999999999999999");
    });

    it("replaces a Neil DISCORD_TOKEN found in the process environment with the Police token", () => {
      const env = expectAccepted(policeMcpEnv(validDotenv, { DISCORD_TOKEN: "neil-token-value" }));

      expect(env.DISCORD_TOKEN).toBe(POLICE_TOKEN);
      expect(Object.values(env)).not.toContain("neil-token-value");
    });

    it("does not pass the Police settings themselves on", () => {
      const env = expectAccepted(
        policeMcpEnv({ ...validDotenv, NEIL_POLICE_TOOLSETS: "messages" }, { NEIL_POLICE_TOOLSETS: "messages" }),
      );

      expect(env).not.toHaveProperty("NEIL_POLICE_TOKEN");
      expect(env).not.toHaveProperty("NEIL_POLICE_GUILD_IDS");
      expect(env).not.toHaveProperty("NEIL_POLICE_TOOLSETS");
    });
  });

  describe("toolsets", () => {
    it("defaults DISCORD_MCP_TOOLSETS to the Police toolsets", () => {
      const env = expectAccepted(policeMcpEnv(validDotenv, {}));

      expect(DEFAULT_TOOLSETS).toBe(
        "discovery,messages,members,roles,permissions,forums,scheduled_events,stats,moderation",
      );
      expect(env.DISCORD_MCP_TOOLSETS).toBe(DEFAULT_TOOLSETS);
    });

    it("overrides the default with NEIL_POLICE_TOOLSETS from the dotenv", () => {
      const env = expectAccepted(policeMcpEnv({ ...validDotenv, NEIL_POLICE_TOOLSETS: "discovery,messages" }, {}));

      expect(env.DISCORD_MCP_TOOLSETS).toBe("discovery,messages");
    });

    it("prefers NEIL_POLICE_TOOLSETS from the process environment over the dotenv", () => {
      const env = expectAccepted(
        policeMcpEnv({ ...validDotenv, NEIL_POLICE_TOOLSETS: "discovery" }, { NEIL_POLICE_TOOLSETS: "messages" }),
      );

      expect(env.DISCORD_MCP_TOOLSETS).toBe("messages");
    });
  });
});
