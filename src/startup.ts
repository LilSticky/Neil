import type { BuildInfo } from "./build-info.js";
import { ConfigError, loadConfig } from "./config.js";
import { recordStart, type StartRecord } from "./domain/start-record.js";

/** Turns a startup failure into the text printed to stderr, with every secret replaced. */
export function formatStartupError(error: unknown, secrets: readonly string[]): string {
  const text =
    error instanceof ConfigError
      ? error.message
      : `Neil cannot start: ${error instanceof Error ? error.message : String(error)}`;
  return redact(text, secrets);
}

export function redact(text: string, secrets: readonly string[]): string {
  return secrets.filter((secret) => secret !== "").reduce((out, secret) => out.replaceAll(secret, "[redacted]"), text);
}

export interface StartRecordStorage {
  load(): StartRecord | undefined;
  save(record: StartRecord): void;
  close(): void;
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
  readonly openStore: (dataDir: string) => StartRecordStorage;
  readonly connect: (
    token: string,
    ping: { readonly buildInfo: BuildInfo; readonly startRecord: StartRecord },
  ) => Promise<Connection>;
  readonly onStopSignal: (handler: () => Promise<void>) => void;
  readonly writeError: (text: string) => void;
  readonly exit: (code: number) => void;
}

/** Config → build info → data folder → start record → Discord; any failure exits 1 before going on. */
export async function start(deps: StartupDeps): Promise<void> {
  const secrets = [deps.env.DISCORD_TOKEN ?? ""];
  let store: StartRecordStorage | undefined;
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
    connection = await deps.connect(config.discordToken, { buildInfo, startRecord });
  } catch (error) {
    fail(error);
    return;
  }

  const openStore = store;
  deps.onStopSignal(async () => {
    await connection.disconnect();
    openStore.close();
    deps.exit(0);
  });
}
