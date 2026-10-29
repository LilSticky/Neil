import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readBuildInfo } from "./build-info.js";

describe("readBuildInfo", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "neil-build-info-"));
    file = join(dir, "build-info.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("is dev when there is no build info (local runs)", () => {
    expect(readBuildInfo(file)).toBe("dev");
  });

  test("reads version and build time written by the deploy job", () => {
    writeFileSync(file, JSON.stringify({ version: "2f7a537", builtAt: "2026-10-29T14:02:31Z" }));

    expect(readBuildInfo(file)).toEqual({ version: "2f7a537", builtAt: new Date("2026-10-29T14:02:31Z") });
  });

  test.each([
    ["not JSON", "{"],
    ["an empty version", JSON.stringify({ version: "", builtAt: "2026-10-29T14:02:31Z" })],
    ["a build time that is not ISO 8601", JSON.stringify({ version: "2f7a537", builtAt: "today" })],
  ])("refuses build info that is %s", (_label, content) => {
    writeFileSync(file, content);

    expect(() => readBuildInfo(file)).toThrow(/build-info\.json is invalid/);
  });
});
