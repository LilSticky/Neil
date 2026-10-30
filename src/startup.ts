import type { BuildInfo } from "./build-info.js";
import { ConfigError, loadConfig } from "./config.js";
import type { GameApi } from "./discord/client.js";
import { recordStart, type StartRecord } from "./domain/start-record.js";
import { QuotaKeeper, type DailyQuotaStorage } from "./game-api/quota-keeper.js";

/** Turns a startup failure into the text printed to stderr, with every secret replaced. */
export function formatStartupError(
  error: unknown,
  secrets: readonly string[],
  heading = "Neil cannot start",
): string {
  const text =
    error instanceof ConfigError && heading === "Neil cannot start"
      ? error.message
      : `${heading}: ${error instanceof ConfigError ? error.problems.join("; ") : messageOf(error)}`;
  return redact(text, secrets);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function redact(text: string, secrets: readonly string[]): string {
  return secrets.filter((secret) => secret !== "").reduce((out, secret) => out.replaceAll(secret, "[redacted]"), text);
}

export interface StartRecordStorage {
  load(): StartRecord | undefined;
  save(record: StartRecord): void;
  close(): void;
}

/** The storage start() opens: the start record and the Daily Quota, both in neil.db. */
export interface StartupStorage extends StartRecordStorage {
  readonly dailyQuota: DailyQuotaStorage;
}

export interface Connection {
  disconnect(): Promise<void>;
}

/** Everything start() touches in the outside world, so it can be tested with fakes. */
export interface StartupDeps {
  readonly env: Record<string, string | undefined>;
  readonly now: () => Date;
  readonly readBuildInfo: () => BuildInfo;
  readonly prepareDataDir: (dataDir: string) => void;
  readonly openStore: (dataDir: string) => StartupStorage;
  readonly createGameApi: (apiKey: string, version: string, cacheTtlMs: number, quota: QuotaKeeper) => GameApi;
  readonly connect: (
    token: string,
    options: {
      readonly buildInfo: BuildInfo;
      readonly startRecord: StartRecord;
      readonly gameApi: GameApi;
      readonly officerRoleIds: readonly string[];
    },
  ) => Promise<Connection>;
  readonly onStopSignal: (handler: () => Promise<void>) => void;
  readonly writeError: (text: string) => void;
  readonly exit: (code: number) => void;
}

/** Config → build info → data folder → start record → Discord; any failure exits 1 before going on. */
export async function start(deps: StartupDeps): Promise<void> {
  const secrets = [deps.env.DISCORD_TOKEN ?? "", deps.env.LAP_TRACKER_API_KEY ?? ""];
  let store: StartupStorage | undefined;
  const fail = (error: unknown): void => {
    store?.close();
    deps.writeError(formatStartupError(error, secrets));
    deps.exit(1);
  };

  let connection: Connection;
  try {
    const config = loadConfig(deps.env);
    const buildInfo = deps.readBuildInfo();
    deps.prepareDataDir(config.dataDir);
    store = deps.openStore(config.dataDir);
    const startRecord = recordStart(store.load(), deps.now());
    store.save(startRecord);
    const quota = new QuotaKeeper({ store: store.dailyQuota, now: deps.now });
    // Reads today's Daily Quota now, so a corrupt row stops startup as a corrupt start record does.
    quota.today();
    const gameApi = deps.createGameApi(
      config.gameApiKey,
      buildInfo === "dev" ? "dev" : buildInfo.version,
      config.cacheTtlMs,
      quota,
    );
    connection = await deps.connect(config.discordToken, {
      buildInfo,
      startRecord,
      gameApi,
      officerRoleIds: config.officerRoleIds,
    });
  } catch (error) {
    fail(error);
    return;
  }

  const openStore = store;
  let stopping = false;
  deps.onStopSignal(async () => {
    if (stopping) return;
    stopping = true;
    try {
      await connection.disconnect();
      openStore.close();
      deps.exit(0);
    } catch (error) {
      openStore.close();
      deps.writeError(redact(`Neil stopped uncleanly: ${messageOf(error)}`, secrets));
      deps.exit(1);
    }
  });
}
