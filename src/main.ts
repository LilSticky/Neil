import { existsSync } from "node:fs";
import { setTimeout as sleepFor } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readBuildInfo } from "./build-info.js";
import { connect } from "./discord/client.js";
import { GameApiClient } from "./game-api/client.js";
import { AppliedStore } from "./storage/applied-store.js";
import { prepareDataDir } from "./storage/data-dir.js";
import { openDatabase } from "./storage/database.js";
import { DailyQuotaStore } from "./storage/daily-quota-store.js";
import { DailySyncStore } from "./storage/daily-sync-store.js";
import { InterviewStore } from "./storage/interview-store.js";
import { KnownAllianceStore } from "./storage/known-alliance-store.js";
import { LinkStore } from "./storage/link-store.js";
import { createPreferenceStore } from "./storage/preference-store.js";
import { StartRecordStore } from "./storage/start-record-store.js";
import { start } from "./startup.js";

// Wispbyte writes its panel variables to .env instead of exporting them; exported variables win.
if (existsSync(".env")) process.loadEnvFile(".env");

await start({
  env: process.env,
  now: () => new Date(),
  readBuildInfo: () => readBuildInfo(fileURLToPath(new URL("../build-info.json", import.meta.url))),
  prepareDataDir,
  openStore: (dataDir, interviewTimeoutMs) => {
    const db = openDatabase(dataDir);
    const store = new StartRecordStore(db);
    return {
      load: () => store.load(),
      save: (record) => { store.save(record); },
      close: () => { db.close(); },
      dailyQuota: new DailyQuotaStore(db),
      interviews: new InterviewStore(db, interviewTimeoutMs),
      links: new LinkStore(db),
      applied: new AppliedStore(db),
      knownAlliances: new KnownAllianceStore(db),
      dailySync: new DailySyncStore(db),
      preferences: createPreferenceStore(db),
    };
  },
  createGameApi: (apiKey, version, cacheTtlMs, quota, onAllianceSeen) =>
    new GameApiClient({
      apiKey,
      version,
      fetch: globalThis.fetch,
      now: () => new Date(),
      quota,
      cacheTtlMs,
      onAllianceSeen,
      sleep: (ms) => sleepFor(ms),
      random: Math.random,
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
  writeWarning: (text) => {
    console.warn(text);
  },
  // Let open handles (the websocket) finish closing; process.exit() mid-close crashes libuv on Windows.
  exit: (code) => {
    process.exitCode = code;
  },
});
