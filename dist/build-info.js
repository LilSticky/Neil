import { readFileSync } from "node:fs";
import { z } from "zod";
const schema = z.object({ version: z.string().min(1), builtAt: z.iso.datetime({ offset: true }) });
/** Reads build-info.json, written by the deploy job; a missing file means a local build. */
export function readBuildInfo(path) {
    let content;
    try {
        content = readFileSync(path, "utf8");
    }
    catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT")
            return "dev";
        throw error;
    }
    let parsed;
    try {
        parsed = schema.safeParse(JSON.parse(content));
    }
    catch {
        parsed = undefined;
    }
    if (!parsed?.success)
        throw new Error("build-info.json is invalid");
    return { version: parsed.data.version, builtAt: new Date(parsed.data.builtAt) };
}
//# sourceMappingURL=build-info.js.map