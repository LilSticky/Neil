import { ConfigError, loadConfig } from "./config.js";
import { recordStart } from "./domain/start-record.js";
/** Turns a startup failure into the text printed to stderr, with every secret replaced. */
export function formatStartupError(error, secrets, heading = "Neil cannot start") {
    const text = error instanceof ConfigError && heading === "Neil cannot start"
        ? error.message
        : `${heading}: ${error instanceof ConfigError ? error.problems.join("; ") : messageOf(error)}`;
    return redact(text, secrets);
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
export function redact(text, secrets) {
    return secrets.filter((secret) => secret !== "").reduce((out, secret) => out.replaceAll(secret, "[redacted]"), text);
}
/** Config → build info → data folder → start record → Discord; any failure exits 1 before going on. */
export async function start(deps) {
    const secrets = [deps.env.DISCORD_TOKEN ?? ""];
    let store;
    const fail = (error) => {
        store?.close();
        deps.writeError(formatStartupError(error, secrets));
        deps.exit(1);
    };
    let connection;
    try {
        const config = loadConfig(deps.env);
        const buildInfo = deps.readBuildInfo();
        deps.prepareDataDir(config.dataDir);
        store = deps.openStore(config.dataDir);
        const startRecord = recordStart(store.load(), deps.now());
        store.save(startRecord);
        connection = await deps.connect(config.discordToken, { buildInfo, startRecord });
    }
    catch (error) {
        fail(error);
        return;
    }
    const openStore = store;
    let stopping = false;
    deps.onStopSignal(async () => {
        if (stopping)
            return;
        stopping = true;
        try {
            await connection.disconnect();
            openStore.close();
            deps.exit(0);
        }
        catch (error) {
            openStore.close();
            deps.writeError(redact(`Neil stopped uncleanly: ${messageOf(error)}`, secrets));
            deps.exit(1);
        }
    });
}
//# sourceMappingURL=startup.js.map