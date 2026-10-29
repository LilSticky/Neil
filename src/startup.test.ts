import { describe, expect, test } from "vitest";
import { ConfigError } from "./config.js";
import { startCount, type StartRecord } from "./domain/start-record.js";
import { formatStartupError, start, type StartupDeps } from "./startup.js";

const FAKE_TOKEN = "fake-token-never-shown-7f3a9c";
const FAKE_API_KEY = "fake-api-key-never-shown-b81e4d";

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

  test("takes another heading for other tools", () => {
    expect(formatStartupError(new Error("x"), [], "Cannot register commands")).toBe("Cannot register commands: x");
  });
});

const VALID_ENV = {
  DISCORD_TOKEN: FAKE_TOKEN,
  DISCORD_APPLICATION_ID: "123456789012345678",
  DISCORD_GUILD_ID: "123456789012345678",
  LAP_TRACKER_API_KEY: FAKE_API_KEY,
  DATA_DIR: "./data",
};

function fakeDeps(overrides: Partial<StartupDeps> = {}) {
  const calls: string[] = [];
  const saved: StartRecord[] = [];
  let stop: (() => Promise<void>) | undefined;
  const built: { apiKey: string; version: string }[] = [];
  const gameApi = {
    getPlayer: () => Promise.resolve({ kind: "not-found" } as const),
    getAlliance: () => Promise.resolve({ kind: "not-found" } as const),
  };
  const connected: unknown[] = [];
  const deps: StartupDeps = {
    env: VALID_ENV,
    now: () => new Date("2026-10-29T12:00:00Z"),
    readBuildInfo: () => "dev",
    prepareDataDir: (dir) => calls.push(`prepareDataDir ${dir}`),
    openStore: () => {
      calls.push("openStore");
      return {
        load: () => ({ firstStartedAt: new Date("2026-10-01T00:00:00Z"), startCount: startCount(2) }),
        save: (record) => saved.push(record),
        close: () => calls.push("closeStore"),
      };
    },
    createGameApi: (apiKey, version) => {
      built.push({ apiKey, version });
      return gameApi;
    },
    connect: (token, ping) => {
      calls.push(`connect ${token === FAKE_TOKEN ? "token" : "?"} #${ping.startRecord.startCount.toString()}`);
      connected.push(ping.gameApi);
      return Promise.resolve({
        disconnect: () => {
          calls.push("disconnect");
          return Promise.resolve();
        },
      });
    },
    onStopSignal: (handler) => (stop = handler),
    writeError: (text) => calls.push(`stderr ${text}`),
    exit: (code) => calls.push(`exit ${code.toString()}`),
    ...overrides,
  };
  return { deps, calls, saved, built, connected, gameApi, stop: () => stop?.() };
}

describe("start", () => {
  test("validates, prepares the data folder, records the start, then connects", async () => {
    const { deps, calls, saved } = fakeDeps();

    await start(deps);

    expect(calls).toEqual(["prepareDataDir ./data", "openStore", "connect token #3"]);
    expect(saved).toEqual([{ firstStartedAt: new Date("2026-10-01T00:00:00Z"), startCount: 3 }]);
  });

  test("builds the Game API client with the configured key and hands that client to connect", async () => {
    const fake = fakeDeps();

    await start(fake.deps);

    expect(fake.built).toEqual([{ apiKey: FAKE_API_KEY, version: "dev" }]);
    expect(fake.connected).toEqual([fake.gameApi]);
  });

  test("gives the Game API client the build version for its User-Agent", async () => {
    const fake = fakeDeps({ readBuildInfo: () => ({ version: "2f7a537", builtAt: new Date("2026-10-29T14:02:31Z") }) });

    await start(fake.deps);

    expect(fake.built).toEqual([{ apiKey: FAKE_API_KEY, version: "2f7a537" }]);
  });

  test("invalid configuration is printed and exits 1 without connecting", async () => {
    const { deps, calls } = fakeDeps({ env: { DISCORD_TOKEN: FAKE_TOKEN } });

    await start(deps);

    expect(calls).toEqual([
      "stderr Neil cannot start, configuration is invalid:\n- DISCORD_APPLICATION_ID: required\n- DISCORD_GUILD_ID: required\n- LAP_TRACKER_API_KEY: required",
      "exit 1",
    ]);
  });

  test("the game API key is redacted from a startup failure like the token", async () => {
    const { deps, calls } = fakeDeps({
      readBuildInfo: () => {
        throw new Error(`build-info.json is invalid, key ${FAKE_API_KEY}`);
      },
    });

    await start(deps);

    expect(calls).toEqual(["stderr Neil cannot start: build-info.json is invalid, key [redacted]", "exit 1"]);
  });

  test("a corrupt start record closes the store and exits 1 without connecting", async () => {
    const { deps, calls } = fakeDeps({
      openStore: () => ({
        load: () => {
          throw new Error("the start record in neil.db is corrupt");
        },
        save: () => undefined,
        close: () => calls.push("closeStore"),
      }),
    });

    await start(deps);

    expect(calls).toEqual([
      "prepareDataDir ./data",
      "closeStore",
      "stderr Neil cannot start: the start record in neil.db is corrupt",
      "exit 1",
    ]);
  });

  test("invalid build info exits 1 without connecting", async () => {
    const { deps, calls } = fakeDeps({
      readBuildInfo: () => {
        throw new Error("build-info.json is invalid");
      },
    });

    await start(deps);

    expect(calls).toEqual(["stderr Neil cannot start: build-info.json is invalid", "exit 1"]);
  });

  test("a rejected login exits 1 and never shows the token", async () => {
    const { deps, calls } = fakeDeps({
      connect: () => Promise.reject(new Error(`An invalid token was provided: ${FAKE_TOKEN}`)),
    });

    await start(deps);

    expect(calls).toEqual([
      "prepareDataDir ./data",
      "openStore",
      "closeStore",
      "stderr Neil cannot start: An invalid token was provided: [redacted]",
      "exit 1",
    ]);
  });

  test("a stop signal disconnects, closes the store and exits 0", async () => {
    const fake = fakeDeps();
    await start(fake.deps);

    await fake.stop();

    expect(fake.calls.slice(-3)).toEqual(["disconnect", "closeStore", "exit 0"]);
  });

  test("a failed disconnect still closes the store, is printed and exits 1", async () => {
    const fake = fakeDeps({
      connect: () => Promise.resolve({ disconnect: () => Promise.reject(new Error(`gone ${FAKE_TOKEN}`)) }),
    });
    await start(fake.deps);

    await fake.stop();

    expect(fake.calls.slice(-3)).toEqual(["closeStore", "stderr Neil stopped uncleanly: gone [redacted]", "exit 1"]);
  });

  test("a second stop signal does nothing", async () => {
    const fake = fakeDeps();
    await start(fake.deps);

    await Promise.all([fake.stop(), fake.stop()]);

    expect(fake.calls.filter((call) => call === "closeStore" || call === "disconnect")).toEqual([
      "disconnect",
      "closeStore",
    ]);
  });
});
