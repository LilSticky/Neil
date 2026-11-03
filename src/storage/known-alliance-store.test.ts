import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Alliance } from "../domain/player.js";
import { parseKingdom, type KingdomNumber } from "../domain/lookup-input.js";
import { openDatabase } from "./database.js";
import { KnownAllianceStore } from "./known-alliance-store.js";

const NOW = new Date("2026-11-02T12:00:00Z");
const DAY_MS = 86_400_000;
const HOME_KINGDOM = kingdomOf(330);

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

/** An Alliance as the Game API answer describes it; only the Kingdom, tag and name matter to the store. */
function allianceOf(kingdom: KingdomNumber, tag: string, name: string): Alliance {
  return { tag, name, kingdom, power: 0, memberCount: 0, capacity: 0, leaderName: undefined, roster: [] };
}

/** The tags of the Known Alliances the store gives for `now`, in a stable order. */
function tagsOf(store: KnownAllianceStore, now: Date): string[] {
  return store
    .all(now)
    .map((alliance) => alliance.tag)
    .sort();
}

describe("KnownAllianceStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-known-alliance-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("gives nothing from an empty database", () => {
    expect(new KnownAllianceStore(db).all(NOW)).toEqual([]);
  });

  test("remembers a sighting with its Kingdom, tag, full name and time", () => {
    const store = new KnownAllianceStore(db);

    store.seen(allianceOf(HOME_KINGDOM, "NML", "No Man's Land"), NOW);

    expect(store.all(NOW)).toEqual([
      { kingdom: HOME_KINGDOM, tag: "NML", name: "No Man's Land", lastSeen: NOW },
    ]);
  });

  test("a new name for a known tag replaces the old name and refreshes the time", () => {
    const store = new KnownAllianceStore(db);
    const earlier = new Date(NOW.getTime() - DAY_MS);

    store.seen(allianceOf(HOME_KINGDOM, "NML", "No Man's Land"), earlier);
    store.seen(allianceOf(HOME_KINGDOM, "NML", "No Man's Land Reborn"), NOW);

    expect(store.all(NOW)).toEqual([
      { kingdom: HOME_KINGDOM, tag: "NML", name: "No Man's Land Reborn", lastSeen: NOW },
    ]);
  });

  test("the same tag in another Kingdom is another Alliance", () => {
    const store = new KnownAllianceStore(db);

    store.seen(allianceOf(HOME_KINGDOM, "NML", "No Man's Land"), NOW);
    store.seen(allianceOf(kingdomOf(1), "NML", "Other Land"), NOW);

    expect(store.all(NOW)).toHaveLength(2);
  });

  test("leaves out an Alliance last seen more than 30 days ago, and keeps one seen exactly 30 days ago", () => {
    const store = new KnownAllianceStore(db);

    store.seen(allianceOf(HOME_KINGDOM, "NML", "No Man's Land"), new Date(NOW.getTime() - 30 * DAY_MS));
    store.seen(allianceOf(HOME_KINGDOM, "NMA", "Night Mares"), new Date(NOW.getTime() - 30 * DAY_MS - 1));

    expect(tagsOf(store, NOW)).toEqual(["NML"]);
  });

  test("forget deletes the Alliances not seen for more than 30 days and keeps the others", () => {
    const store = new KnownAllianceStore(db);

    store.seen(allianceOf(HOME_KINGDOM, "NML", "No Man's Land"), new Date(NOW.getTime() - 30 * DAY_MS));
    store.seen(allianceOf(HOME_KINGDOM, "NMA", "Night Mares"), new Date(NOW.getTime() - 31 * DAY_MS));

    store.forget(NOW);

    expect(db.prepare("SELECT tag FROM known_alliance ORDER BY tag").all()).toEqual([{ tag: "NML" }]);
  });
});
