import { mkdtempSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { uidOf } from "../domain/__fixtures__/players.js";
import { CityRotationStore, EMPTY_CITY_ROTATION, type CityRotationState } from "./city-rotation-store.js";
import { openDatabase } from "./database.js";

const FULL: CityRotationState = {
  order: ["NML", "ABC", "XYZ"],
  holding: "ABC",
  handover: {
    expected: "XYZ",
    leaderUid: uidOf("145563254785"),
    siegeAt: new Date("2026-11-20T20:00:00.000Z"),
    messageId: "123456789012345678",
  },
  lastHandledSiege: new Date("2026-11-20T20:00:00.000Z"),
  cardMessageId: "223456789012345678",
  paused: true,
  next: "NML",
};

describe("CityRotationStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-city-rotation-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("is empty before anything is stored", () => {
    expect(new CityRotationStore(db).load()).toEqual(EMPTY_CITY_ROTATION);
  });

  test("keeps the rotation, the waiting Handover, the last handled siege and the card across a reopen", () => {
    new CityRotationStore(db).save(FULL);
    db.close();
    db = openDatabase(dataDir);

    expect(new CityRotationStore(db).load()).toEqual(FULL);
  });

  test("keeps a Handover whose R5 and message are unknown", () => {
    const store = new CityRotationStore(db);
    const state: CityRotationState = {
      ...FULL,
      handover: { expected: "XYZ", leaderUid: undefined, siegeAt: new Date("2026-11-20T20:00:00.000Z"), messageId: undefined },
    };
    store.save(state);

    expect(store.load()).toEqual(state);
  });

  test("update replaces the stored state with the changed one", () => {
    const store = new CityRotationStore(db);
    store.save(FULL);

    const next = store.update((state) => ({ ...state, holding: "XYZ", handover: undefined }));

    expect(next).toEqual({ ...FULL, holding: "XYZ", handover: undefined });
    expect(store.load()).toEqual(next);
  });

  test.each([
    ["an order that is not JSON", "UPDATE city_rotation SET order_json = 'not json'"],
    ["an order that is not a tag list", "UPDATE city_rotation SET order_json = '[1, 2]'"],
    ["an unreadable R5 uid", "UPDATE city_rotation SET pending_leader_uid = 'abc'"],
    ["an unreadable siege time", "UPDATE city_rotation SET last_siege_at = 'Friday'"],
  ])("throws on a corrupt row: %s", (_label, sql) => {
    const store = new CityRotationStore(db);
    store.save(FULL);
    db.exec(sql);

    expect(() => store.load()).toThrow(/corrupt/);
  });
});
