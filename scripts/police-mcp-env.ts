// The environment the Police MCP server starts with (documentation/NEIL-POLICE.md section 3): Police's token and guild
// ids from the process or the .env, and nothing else that Neil or the machine holds.

export type PoliceMcpEnv = { ok: true; env: Record<string, string> } | { ok: false; problem: string };

export const DEFAULT_TOOLSETS = "discovery,messages,members,roles,permissions,forums,scheduled_events,stats,moderation";

/** System variables the MCP server may inherit; everything else from the process stays out. */
const SYSTEM_VARIABLES = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "windir",
  "ComSpec",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
] as const;

const GUILD_ID_PATTERN = /^\d{17,20}$/;

/** A setting from the process environment wins over the dotenv; a blank value counts as unset. */
function readSetting(
  name: string,
  dotenv: Record<string, string | undefined>,
  processEnv: Record<string, string | undefined>,
): string | undefined {
  const fromProcess = processEnv[name]?.trim();
  if (fromProcess !== undefined && fromProcess !== "") {
    return fromProcess;
  }
  const fromDotenv = dotenv[name]?.trim();
  if (fromDotenv !== undefined && fromDotenv !== "") {
    return fromDotenv;
  }
  return undefined;
}

export function policeMcpEnv(
  dotenv: Record<string, string | undefined>,
  processEnv: Record<string, string | undefined>,
): PoliceMcpEnv {
  const token = readSetting("NEIL_POLICE_TOKEN", dotenv, processEnv);
  const guildIds = (readSetting("NEIL_POLICE_GUILD_IDS", dotenv, processEnv) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const toolsets = readSetting("NEIL_POLICE_TOOLSETS", dotenv, processEnv) ?? DEFAULT_TOOLSETS;

  const wrong: string[] = [];
  if (token === undefined) {
    wrong.push("NEIL_POLICE_TOKEN");
  }
  if (guildIds.length === 0 || !guildIds.every((id) => GUILD_ID_PATTERN.test(id))) {
    wrong.push("NEIL_POLICE_GUILD_IDS");
  }
  if (token === undefined || wrong.length > 0) {
    return { ok: false, problem: `check these settings: ${wrong.join(", ")}` };
  }

  const env: Record<string, string> = {};
  for (const name of SYSTEM_VARIABLES) {
    const value = processEnv[name];
    if (value !== undefined) {
      env[name] = value;
    }
  }
  env.DISCORD_TOKEN = token;
  env.DISCORD_ALLOWED_GUILDS = guildIds.join(",");
  env.DISCORD_MCP_TOOLSETS = toolsets;
  return { ok: true, env };
}
