import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EMPTY_PREFERENCES, type GameLanguageCode, type InterestKey } from "../domain/preferences.js";
import { openDatabase } from "./database.js";
import { createPreferenceStore } from "./preference-store.js";

const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const POSTED_AT = new Date("2026-11-04T12:00:00.000Z");
const LATER = new Date("2026-11-04T18:00:00.000Z");

function languages(...codes: GameLanguageCode[]): ReadonlySet<GameLanguageCode> {
  return new Set(codes);
}

function interests(...keys: InterestKey[]): ReadonlySet<InterestKey> {
  return new Set(keys);
}

describe("createPreferenceStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-preference-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("get gives nothing chosen for a Member with no stored Preferences", () => {
    const store = createPreferenceStore(db);

    expect(store.get(ALICE)).toEqual(EMPTY_PREFERENCES);
  });

  test("setLanguages stores the Languages and replaces the earlier ones", () => {
    const store = createPreferenceStore(db);

    store.setLanguages(ALICE, languages("en", "it"));
    store.setLanguages(ALICE, languages("de"));

    expect(store.get(ALICE).languages).toEqual(languages("de"));
  });

  test("setLanguages with an empty set clears every Language", () => {
    const store = createPreferenceStore(db);

    store.setLanguages(ALICE, languages("en"));
    store.setLanguages(ALICE, languages());

    expect(store.get(ALICE).languages).toEqual(languages());
  });

  test("setRegion stores the Region, replaces it, and undefined clears it", () => {
    const store = createPreferenceStore(db);

    store.setRegion(ALICE, "americas");
    store.setRegion(ALICE, "asia-oceania");
    expect(store.get(ALICE).region).toBe("asia-oceania");

    store.setRegion(ALICE, undefined);
    expect(store.get(ALICE).region).toBeUndefined();
  });

  test("setInterests stores the Interests and replaces the earlier ones", () => {
    const store = createPreferenceStore(db);

    store.setInterests(ALICE, interests("pvp", "events"));
    store.setInterests(ALICE, interests("trading"));

    expect(store.get(ALICE).interests).toEqual(interests("trading"));
  });

  test("setExperience stores the Experience, replaces it, and undefined clears it", () => {
    const store = createPreferenceStore(db);

    store.setExperience(ALICE, "new");
    store.setExperience(ALICE, "veteran");
    expect(store.get(ALICE).experience).toBe("veteran");

    store.setExperience(ALICE, undefined);
    expect(store.get(ALICE).experience).toBeUndefined();
  });

  test("each setter replaces only its own question's answer", () => {
    const store = createPreferenceStore(db);
    store.setLanguages(ALICE, languages("en"));
    store.setRegion(ALICE, "europe-africa");
    store.setInterests(ALICE, interests("off-topic"));
    store.setExperience(ALICE, "intermediate");

    store.setLanguages(ALICE, languages("fr"));

    expect(store.get(ALICE)).toEqual({
      languages: languages("fr"),
      region: "europe-africa",
      interests: interests("off-topic"),
      experience: "intermediate",
    });
  });

  test("forget deletes the Member's Preferences and Preferences prompt, and leaves other Members alone", () => {
    const store = createPreferenceStore(db);
    store.setLanguages(ALICE, languages("en"));
    store.setRegion(ALICE, "americas");
    store.setInterests(ALICE, interests("pvp", "nap"));
    store.setExperience(ALICE, "new");
    store.openPrompt(ALICE, "thread-alice", POSTED_AT);
    store.setLanguages(BOB, languages("de"));
    store.openPrompt(BOB, "thread-bob", POSTED_AT);

    store.forget(ALICE);

    expect(store.get(ALICE)).toEqual(EMPTY_PREFERENCES);
    expect(store.prompt(ALICE)).toBeUndefined();
    expect(store.get(BOB).languages).toEqual(languages("de"));
    expect(store.prompt(BOB)).toEqual({ threadId: "thread-bob", postedAt: POSTED_AT });
  });

  test("openPrompt records the thread and the time it was posted", () => {
    const store = createPreferenceStore(db);

    store.openPrompt(ALICE, "thread-alice", POSTED_AT);

    expect(store.prompt(ALICE)).toEqual({ threadId: "thread-alice", postedAt: POSTED_AT });
  });

  test("prompt gives undefined for a Member with no open prompt", () => {
    const store = createPreferenceStore(db);

    expect(store.prompt(ALICE)).toBeUndefined();
  });

  test("closePrompt removes only that Member's prompt", () => {
    const store = createPreferenceStore(db);
    store.openPrompt(ALICE, "thread-alice", POSTED_AT);
    store.openPrompt(BOB, "thread-bob", POSTED_AT);

    store.closePrompt(ALICE);

    expect(store.prompt(ALICE)).toBeUndefined();
    expect(store.prompt(BOB)).toEqual({ threadId: "thread-bob", postedAt: POSTED_AT });
  });

  test("promptsPostedBefore gives only the prompts posted before the date", () => {
    const store = createPreferenceStore(db);
    store.openPrompt(ALICE, "thread-alice", POSTED_AT);
    store.openPrompt(BOB, "thread-bob", LATER);

    expect(store.promptsPostedBefore(new Date("2026-11-04T15:00:00.000Z"))).toEqual([
      { memberId: ALICE, threadId: "thread-alice", postedAt: POSTED_AT },
    ]);
  });

  test("a stored unknown value is dropped from get and reported once through onInvalid", () => {
    const onInvalid = vi.fn<(line: string) => void>();
    const store = createPreferenceStore(db, onInvalid);
    db.prepare("INSERT INTO preference (member_id, kind, value) VALUES (?, ?, ?)").run(ALICE, "language", "xx");
    store.setInterests(ALICE, interests("pvp"));

    expect(store.get(ALICE)).toEqual({
      languages: languages(),
      region: undefined,
      interests: interests("pvp"),
      experience: undefined,
    });
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining("xx"));
  });

  test("a stored unknown kind is dropped from get and reported through onInvalid", () => {
    const onInvalid = vi.fn<(line: string) => void>();
    const store = createPreferenceStore(db, onInvalid);
    db.prepare("INSERT INTO preference (member_id, kind, value) VALUES (?, ?, ?)").run(ALICE, "colour", "red");

    expect(store.get(ALICE)).toEqual(EMPTY_PREFERENCES);
    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onInvalid).toHaveBeenCalledWith(expect.stringContaining("colour"));
  });

  test("an unknown stored value is reported once, not again on every read", () => {
    const onInvalid = vi.fn<(line: string) => void>();
    const store = createPreferenceStore(db, onInvalid);
    db.prepare("INSERT INTO preference (member_id, kind, value) VALUES (?, ?, ?)").run(ALICE, "language", "xx");

    store.get(ALICE);
    store.get(ALICE);

    expect(onInvalid).toHaveBeenCalledTimes(1);
  });
});
