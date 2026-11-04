import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  EXPERIENCES,
  GAME_LANGUAGES,
  INTERESTS,
  REGIONS,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type Preferences,
  type RegionKey,
} from "../domain/preferences.js";
import type { MemberId } from "../domain/rank-approval.js";

/** The open Preferences message of a Member: the thread it is in, and when it was posted. */
export interface PreferencePrompt {
  readonly threadId: string;
  readonly postedAt: Date;
}

/** An open Preferences message together with the Member it belongs to. */
export interface PostedPreferencePrompt extends PreferencePrompt {
  readonly memberId: MemberId;
}

export interface PreferenceStore {
  /** The Member's Preferences; a stored value that is not a known answer is dropped (and reported once). */
  get(memberId: MemberId): Preferences;
  setLanguages(memberId: MemberId, languages: ReadonlySet<GameLanguageCode>): void;
  setRegion(memberId: MemberId, region: RegionKey | undefined): void;
  setInterests(memberId: MemberId, interests: ReadonlySet<InterestKey>): void;
  setExperience(memberId: MemberId, experience: ExperienceKey | undefined): void;
  /** Deletes the Member's Preferences and open Preferences message. */
  forget(memberId: MemberId): void;
  openPrompt(memberId: MemberId, threadId: string, postedAt: Date): void;
  prompt(memberId: MemberId): PreferencePrompt | undefined;
  closePrompt(memberId: MemberId): void;
  /** The open Preferences messages posted before the given time. */
  promptsPostedBefore(cutoff: Date): PostedPreferencePrompt[];
}

type PreferenceKind = "language" | "region" | "interest" | "experience";

const memberIdColumn = z.string().regex(/^\d+$/);
const isoDateColumn = z.iso.datetime().transform((value) => new Date(value));

const storedPair = z.object({ kind: z.string(), value: z.string() });

const languageValue = z.custom<GameLanguageCode>((value) => GAME_LANGUAGES.some((language) => language.code === value));
const regionValue = z.custom<RegionKey>((value) => REGIONS.some((region) => region.key === value));
const interestValue = z.custom<InterestKey>((value) => INTERESTS.some((interest) => interest.key === value));
const experienceValue = z.custom<ExperienceKey>((value) => EXPERIENCES.some((experience) => experience.key === value));

/** A stored Preference, known kind and known answer; anything else is dropped. */
const preference = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("language"), value: languageValue }),
  z.object({ kind: z.literal("region"), value: regionValue }),
  z.object({ kind: z.literal("interest"), value: interestValue }),
  z.object({ kind: z.literal("experience"), value: experienceValue }),
]);

const promptRow = z.object({
  member_id: memberIdColumn,
  thread_id: z.string().min(1),
  posted_at: isoDateColumn,
});

/**
 * Keeps the Preferences and the open Preferences messages in neil.db. A stored answer of an unknown kind or value is
 * dropped from the Preferences read, and reported through onInvalid once per row for the life of the store.
 */
export function createPreferenceStore(
  db: DatabaseSync,
  onInvalid: (line: string) => void = console.warn,
): PreferenceStore {
  const reported = new Set<string>();

  function reportUnknown(memberId: MemberId, kind: string, value: string): void {
    const key = `${memberId}\u0000${kind}\u0000${value}`;
    if (reported.has(key)) return;
    reported.add(key);
    onInvalid(`Unknown Preference in neil.db dropped: kind "${kind}", value "${value}" (Member ${memberId})`);
  }

  /** Replaces every stored value of one kind for a Member, in one transaction. */
  function replaceKind(memberId: MemberId, kind: PreferenceKind, values: readonly string[]): void {
    inTransaction(db, () => {
      db.prepare("DELETE FROM preference WHERE member_id = ? AND kind = ?").run(memberId, kind);
      const insert = db.prepare("INSERT INTO preference (member_id, kind, value) VALUES (?, ?, ?)");
      for (const value of values) insert.run(memberId, kind, value);
    });
  }

  return {
    get(memberId) {
      const languages = new Set<GameLanguageCode>();
      const interests = new Set<InterestKey>();
      let region: RegionKey | undefined;
      let experience: ExperienceKey | undefined;
      const rows = db.prepare("SELECT kind, value FROM preference WHERE member_id = ? ORDER BY rowid").all(memberId);
      for (const raw of rows) {
        const pair = storedPair.safeParse(raw);
        if (!pair.success) throw new Error("a Preference in neil.db is corrupt; fix or remove it by hand");
        const parsed = preference.safeParse(pair.data);
        if (!parsed.success) {
          reportUnknown(memberId, pair.data.kind, pair.data.value);
          continue;
        }
        switch (parsed.data.kind) {
          case "language":
            languages.add(parsed.data.value);
            break;
          case "region":
            region = parsed.data.value;
            break;
          case "interest":
            interests.add(parsed.data.value);
            break;
          case "experience":
            experience = parsed.data.value;
            break;
        }
      }
      return { languages, region, interests, experience };
    },

    setLanguages(memberId, languages) {
      replaceKind(memberId, "language", [...languages]);
    },

    setRegion(memberId, region) {
      replaceKind(memberId, "region", region === undefined ? [] : [region]);
    },

    setInterests(memberId, interests) {
      replaceKind(memberId, "interest", [...interests]);
    },

    setExperience(memberId, experience) {
      replaceKind(memberId, "experience", experience === undefined ? [] : [experience]);
    },

    forget(memberId) {
      inTransaction(db, () => {
        db.prepare("DELETE FROM preference WHERE member_id = ?").run(memberId);
        db.prepare("DELETE FROM preference_prompt WHERE member_id = ?").run(memberId);
      });
    },

    openPrompt(memberId, threadId, postedAt) {
      db.prepare("INSERT OR REPLACE INTO preference_prompt (member_id, thread_id, posted_at) VALUES (?, ?, ?)").run(
        memberId,
        threadId,
        postedAt.toISOString(),
      );
    },

    prompt(memberId) {
      const raw = db.prepare("SELECT member_id, thread_id, posted_at FROM preference_prompt WHERE member_id = ?").get(memberId);
      if (raw === undefined) return undefined;
      const parsed = promptRow.safeParse(raw);
      if (!parsed.success) throw new Error("a Preferences message in neil.db is corrupt; fix or remove it by hand");
      return { threadId: parsed.data.thread_id, postedAt: parsed.data.posted_at };
    },

    closePrompt(memberId) {
      db.prepare("DELETE FROM preference_prompt WHERE member_id = ?").run(memberId);
    },

    promptsPostedBefore(cutoff) {
      return db
        .prepare("SELECT member_id, thread_id, posted_at FROM preference_prompt WHERE posted_at < ? ORDER BY posted_at")
        .all(cutoff.toISOString())
        .map((raw) => {
          const parsed = promptRow.safeParse(raw);
          if (!parsed.success) throw new Error("a Preferences message in neil.db is corrupt; fix or remove it by hand");
          return { memberId: parsed.data.member_id, threadId: parsed.data.thread_id, postedAt: parsed.data.posted_at };
        });
    },
  };
}

/** Runs work between BEGIN and COMMIT; any error rolls back and is rethrown. */
function inTransaction(db: DatabaseSync, work: () => void): void {
  db.exec("BEGIN");
  try {
    work();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
