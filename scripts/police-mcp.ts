// Starts the Discord MCP server under Neil Police's token (ADR 15, documentation/NEIL-POLICE.md). Claude Code runs it
// through .mcp.json. stdout belongs to the MCP protocol: this file writes only to stderr.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { policeMcpEnv } from "./police-mcp-env.js";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));
const dotenv = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const settings = policeMcpEnv(dotenv, process.env);

if (!settings.ok) {
  process.stderr.write(`Neil Police MCP cannot start: ${settings.problem}\n`);
  process.exit(1);
}

const server = createRequire(import.meta.url).resolve("@pasympa/discord-mcp/dist/index.js");
// An empty folder as working directory: the server loads `.env` from there, and must never find Neil's.
const workDir = mkdtempSync(join(tmpdir(), "neil-police-"));
const child = spawn(process.execPath, [server], { cwd: workDir, env: settings.env, stdio: "inherit" });

const cleanUp = (): void => {
  rmSync(workDir, { recursive: true, force: true });
};
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("error", (error) => {
  process.stderr.write(`Neil Police MCP cannot start: ${error.message}\n`);
  cleanUp();
  process.exit(1);
});
child.on("exit", (code) => {
  cleanUp();
  process.exit(code ?? 1);
});
