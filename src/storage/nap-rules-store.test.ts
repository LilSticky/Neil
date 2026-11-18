import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "./database.js";
import { NapRulesStore } from "./nap-rules-store.js";

const PROPOSER = "111111111111111111";
const PROPOSED = new Date("2026-11-18T12:00:00.000Z");
const DECIDED = new Date("2026-11-20T12:00:00.000Z");
const RULES = { text: "Nobody hits the farms of NaP Alliances.", change: "First rules.", proposedBy: PROPOSER, proposedAt: PROPOSED };

describe("NapRulesStore", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-nap-rules-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function withStore<T>(use: (store: NapRulesStore) => T): T {
    const db = openDatabase(dataDir);
    try {
      return use(new NapRulesStore(db));
    } finally {
      db.close();
    }
  }

  test("is empty before anything is proposed", () => {
    withStore((store) => {
      expect(store.versions()).toEqual([]);
    });
  });

  test("keeps a proposed version, its proposer and its NaP Motion across a reopened database", () => {
    const number = withStore((store) => {
      const proposed = store.propose(RULES);
      store.setMotion(proposed, 7);
      return proposed;
    });
    expect(number).toBe(1);
    withStore((store) => {
      expect(store.versions()).toEqual([
        { number: 1, ...RULES, status: { kind: "proposed" }, motion: 7 },
      ]);
    });
  });

  test("numbers each proposal one higher, and keeps a decided version decided across a reopened database", () => {
    withStore((store) => {
      expect(store.propose(RULES)).toBe(1);
      store.setMotion(1, 1);
      expect(store.decide(1, "rejected", DECIDED)).toBe(true);
      expect(store.propose({ ...RULES, text: "Second" })).toBe(2);
      store.setMotion(2, 2);
      expect(store.decide(2, "approved", DECIDED)).toBe(true);
    });
    withStore((store) => {
      expect(store.versions().map((version) => [version.number, version.status])).toEqual([
        [1, { kind: "rejected", decidedAt: DECIDED }],
        [2, { kind: "approved", decidedAt: DECIDED }],
      ]);
    });
  });

  test("decides a version once: a second outcome changes nothing", () => {
    withStore((store) => {
      store.propose(RULES);
      store.setMotion(1, 1);
      expect(store.decide(1, "approved", DECIDED)).toBe(true);
      expect(store.decide(1, "rejected", new Date(DECIDED.getTime() + 1000))).toBe(false);
      expect(store.versions()[0]?.status).toEqual({ kind: "approved", decidedAt: DECIDED });
    });
  });

  test("removes a proposal that was never put to a NaP Motion, but never a decided version", () => {
    withStore((store) => {
      store.propose(RULES);
      store.setMotion(1, 1);
      store.decide(1, "approved", DECIDED);
      store.propose({ ...RULES, text: "Second" });
      store.remove(2);
      store.remove(1);
      expect(store.versions().map((version) => version.number)).toEqual([1]);
      expect(store.propose({ ...RULES, text: "Third" })).toBe(2);
    });
  });
});
