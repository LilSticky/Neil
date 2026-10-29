// Placeholder on the deploy branch until the first CI deploy replaces it (slice 001).
import { existsSync } from "node:fs";

console.log("Neil deploy placeholder");
console.log(`node ${process.version}, cwd ${process.cwd()}, git checkout: ${existsSync(".git") ? "yes" : "no"}`);
console.log(`env: DISCORD_TOKEN ${process.env.DISCORD_TOKEN ? "set" : "missing"}, DATA_DIR ${process.env.DATA_DIR ?? "missing"}`);
