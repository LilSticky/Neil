import { readFileSync } from "node:fs";
import { z } from "zod";

/** The running build, or `dev` when no build info was written (local runs). */
export type BuildInfo = "dev" | { readonly version: string; readonly builtAt: Date };

const schema = z.object({ version: z.string().min(1), builtAt: z.iso.datetime({ offset: true }) });

/** Reads build-info.json, written by the deploy job; a missing file means a local build. */
export function readBuildInfo(path: string): BuildInfo {
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return "dev";
    throw error;
  }
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(content));
  } catch {
    parsed = undefined;
  }
  if (!parsed?.success) throw new Error("build-info.json is invalid");
  return { version: parsed.data.version, builtAt: new Date(parsed.data.builtAt) };
}
