import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ConfigError } from "../config.js";
import { prepareDataDir } from "./data-dir.js";

describe("prepareDataDir", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "neil-data-dir-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("creates a missing folder, including parents", () => {
    const dataDir = join(root, "nested", "data");

    prepareDataDir(dataDir);

    expect(statSync(dataDir).isDirectory()).toBe(true);
  });

  test("accepts an existing writable folder and leaves its files alone", () => {
    writeFileSync(join(root, "neil.db"), "keep me");

    prepareDataDir(root);

    expect(existsSync(join(root, "neil.db"))).toBe(true);
  });

  test("fails naming DATA_DIR and the path when the folder cannot be created", () => {
    const file = join(root, "a-file");
    writeFileSync(file, "");
    const dataDir = join(file, "data");

    let caught: unknown;
    try {
      prepareDataDir(dataDir);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).problems).toEqual([`DATA_DIR: ${dataDir} is not writable`]);
  });
});
