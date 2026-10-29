import { accessSync, constants, mkdirSync } from "node:fs";
import { ConfigError } from "../config.js";
/** Makes sure the data folder exists and is writable, or fails naming DATA_DIR. */
export function prepareDataDir(dataDir) {
    try {
        mkdirSync(dataDir, { recursive: true });
        accessSync(dataDir, constants.W_OK);
    }
    catch {
        throw new ConfigError([`DATA_DIR: ${dataDir} is not writable`]);
    }
}
//# sourceMappingURL=data-dir.js.map