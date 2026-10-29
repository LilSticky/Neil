// Records Game API answers as test fixtures: `npx tsx scripts/record-fixtures.ts`.
// Costs one request of the daily quota per fixture. Bodies carry no key; review the diff anyway.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (existsSync(".env")) process.loadEnvFile(".env");

const apiKey = process.env.LAP_TRACKER_API_KEY ?? "";
if (apiKey === "") {
  console.error("LAP_TRACKER_API_KEY is not set (.env).");
  process.exit(1);
}

const baseUrl = "https://api.lastasylumtracker.com/v1";
const fixtures: Record<string, string> = {
  "player-in-alliance.json": "/players/145563254785",
  "player-not-found.json": "/players/1",
  "alliance.json": "/alliances/1/NML",
  "alliance-not-found.json": "/alliances/1/ZZZQX",
};
const folder = fileURLToPath(new URL("../src/game-api/__fixtures__/", import.meta.url));
mkdirSync(folder, { recursive: true });

for (const [file, path] of Object.entries(fixtures)) {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "Neil/fixtures (+https://github.com/LilSticky/Neil)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.text();
    const remaining = response.headers.get("x-ratelimit-remaining") ?? "–";
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
    if (response.status < 500 && isJson) {
      writeFileSync(`${folder}${file}`, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
      console.log(`${path}: ${response.status.toString()} → ${file} (remaining ${remaining})`);
    } else {
      console.log(`${path}: ${response.status.toString()}, not recorded (remaining ${remaining})`);
    }
  } catch (error) {
    console.log(`${path}: ${error instanceof Error ? error.name : "error"}, not recorded`);
  }
}
