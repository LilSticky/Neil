import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readBuildInfo } from "./build-info.js";
import { connect } from "./discord/client.js";
import { prepareDataDir } from "./storage/data-dir.js";
import { openDatabase } from "./storage/database.js";
import { StartRecordStore } from "./storage/start-record-store.js";
import { start } from "./startup.js";
// Wispbyte writes its panel variables to .env instead of exporting them; exported variables win.
if (existsSync(".env"))
    process.loadEnvFile(".env");
await start({
    env: process.env,
    now: () => new Date(),
    readBuildInfo: () => readBuildInfo(fileURLToPath(new URL("../build-info.json", import.meta.url))),
    prepareDataDir,
    openStore: (dataDir) => {
        const db = openDatabase(dataDir);
        const store = new StartRecordStore(db);
        return { load: () => store.load(), save: (record) => { store.save(record); }, close: () => { db.close(); } };
    },
    connect,
    onStopSignal: (handler) => {
        for (const signal of ["SIGINT", "SIGTERM"])
            process.once(signal, () => void handler());
    },
    writeError: (text) => {
        console.error(text);
    },
    // Let open handles (the websocket) finish closing; process.exit() mid-close crashes libuv on Windows.
    exit: (code) => {
        process.exitCode = code;
    },
});
//# sourceMappingURL=main.js.map