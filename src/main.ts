import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readBuildInfo } from "./build-info.js";
import { connect } from "./discord/client.js";
import { GameApiClient } from "./game-api/client.js";
import { prepareDataDir } from "./storage/data-dir.js";
import { openDatabase } from "./storage/database.js";
import { DailyQuotaStore } from "./storage/daily-quota-store.js";
import { StartRecordStore } from "./storage/start-record-store.js";
import { start } from "./startup.js";

// Wispbyte writes its panel variables to .env instead of exporting them; exported variables win.
if (existsSync(".env")) process.loadEnvFile(".env");

await start({
  env: process.env,
  now: () => new Date(),
  readBuildInfo: () => readBuildInfo(fileURLToPath(new URL("../build-info.json", import.meta.url))),
  prepareDataDir,
  openStore: (dataDir) => {
    const db = openDatabase(dataDir);
    const store = new StartRecordStore(db);
    return {
      load: () => store.load(),
      save: (record) => { store.save(record); },
      close: () => { db.close(); },
      dailyQuota: new DailyQuotaStore(db),
    };
  },
  createGameApi: (apiKey, version, cacheTtlMs, quota) =>
    new GameApiClient({
      apiKey,
      version,
      fetch: globalThis.fetch,
      now: () => new Date(),
      quota,
      cacheTtlMs,
      logError: (line) => {
        console.error(line);
      },
    }),
  connect,
  onStopSignal: (handler) => {
    for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => void handler());
  },
  writeError: (text) => {
    console.error(text);
  },
  // Let open handles (the websocket) finish closing; process.exit() mid-close crashes libuv on Windows.
  exit: (code) => {
    process.exitCode = code;
  },
});
