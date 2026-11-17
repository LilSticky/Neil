import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { addPhase, assign, newRaid, publish, setNotes, type Raid, type RaidResult } from "../domain/raid.js";
import { openDatabase } from "./database.js";
import { RaidStore } from "./raid-store.js";

const RAID_ID = "2026-11-21";
const START = new Date("2026-11-21T22:00:00.000Z");
const PUBLISHED_AT = new Date("2026-11-20T10:00:00.000Z");
const ALICE = "111111111111111111";
const BOB = "222222222222222222";

function ok(result: RaidResult): Raid {
  if (!result.ok) throw new Error(result.refusal.kind);
  return result.raid;
}

function publishedRaid(): Raid {
  let raid = ok(addPhase(newRaid(RAID_ID, START), "Opening", "20:00"));
  raid = ok(assign(raid, { tag: "NML", objective: "Royal City", phase: "Opening", task: "Hold" }, ["NML", "ABC"]));
  raid = ok(assign(raid, { tag: "ABC", objective: "Enemy sanctuaries", phase: undefined, task: undefined }, ["NML", "ABC"]));
  raid = ok(setNotes(raid, "Shields at 19:00"));
  return ok(publish(raid, PUBLISHED_AT));
}

describe("RaidStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-raid-store-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("migration 17 applies to a version-16 database", () => {
    db.exec("DROP TABLE nap_list; DROP TABLE king_moves; DROP TABLE nap_history; DROP TABLE nap_join_requests");
    db.exec("DROP TABLE availability_answers; DROP TABLE availability_cards; DROP TABLE availability_polls");
    db.exec("DROP TABLE handover_posts; DROP TABLE city_rotation; DROP TABLE raid_notices_sent; DROP TABLE raid_confirmations; DROP TABLE raids");
    db.exec("DELETE FROM schema_migrations WHERE version >= 17");
    db.close();

    db = openDatabase(dataDir);

    expect(db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get()).toEqual({ version: 23 });
    expect(new RaidStore(db).find(RAID_ID)).toBeUndefined();
  });

  test("a Raid, its cards, confirmations and notices read back the same after reopening the database", () => {
    const store = new RaidStore(db);
    const raid = publishedRaid();
    store.save(raid);
    store.savePlanCard(RAID_ID, { channelId: "333333333333333333", messageId: "444444444444444444" });
    store.saveConfirmationCard(RAID_ID, { channelId: "555555555555555555", messageId: "666666666666666666" });
    expect(store.addConfirmation(RAID_ID, { tag: "NML", memberId: ALICE, at: PUBLISHED_AT })).toBe(true);
    store.recordNotice(raid, "chase:12h", PUBLISHED_AT);
    db.close();

    db = openDatabase(dataDir);
    const reopened = new RaidStore(db);

    expect(reopened.find(RAID_ID)).toEqual({
      raid,
      planCard: { channelId: "333333333333333333", messageId: "444444444444444444" },
      confirmationCard: { channelId: "555555555555555555", messageId: "666666666666666666" },
    });
    expect(reopened.confirmations(RAID_ID)).toEqual([{ tag: "NML", memberId: ALICE, at: PUBLISHED_AT }]);
    expect(reopened.noticesHandled(RAID_ID)).toEqual(new Set(["chase:12h"]));
  });

  test("keeps one Plan Confirmation per Alliance: the first", () => {
    const store = new RaidStore(db);
    store.save(publishedRaid());

    expect(store.addConfirmation(RAID_ID, { tag: "NML", memberId: ALICE, at: PUBLISHED_AT })).toBe(true);
    expect(store.addConfirmation(RAID_ID, { tag: "NML", memberId: BOB, at: START })).toBe(false);
    expect(store.confirmations(RAID_ID)).toEqual([{ tag: "NML", memberId: ALICE, at: PUBLISHED_AT }]);
  });

  test("recording a notice for a Raid never stored keeps it as a draft, and a notice only once", () => {
    const store = new RaidStore(db);
    const raid = newRaid(RAID_ID, START);

    store.recordNotice(raid, "plan-deadline", PUBLISHED_AT);
    store.recordNotice(raid, "plan-deadline", START);

    expect(store.find(RAID_ID)?.raid).toEqual(raid);
    expect(store.noticesHandled(RAID_ID)).toEqual(new Set(["plan-deadline"]));
  });

  test("a corrupt row is an error, not a reset", () => {
    const store = new RaidStore(db);
    store.save(publishedRaid());
    db.prepare("UPDATE raids SET plan = 'not json' WHERE id = ?").run(RAID_ID);

    expect(() => store.find(RAID_ID)).toThrow("corrupt");
  });

  test("a published Raid without its publish time is corrupt", () => {
    const store = new RaidStore(db);
    store.save(publishedRaid());
    db.prepare("UPDATE raids SET published_at = NULL WHERE id = ?").run(RAID_ID);

    expect(() => store.find(RAID_ID)).toThrow("corrupt");
  });
});
