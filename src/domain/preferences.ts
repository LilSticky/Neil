import type { RankOnLink } from "./link.js";
import type { AllianceRank } from "./player.js";

/** The code of a Game Language offered in the Preferences message (plan R2). */
export type GameLanguageCode =
  | "en"
  | "de"
  | "fr"
  | "es"
  | "it"
  | "pt"
  | "ru"
  | "tr"
  | "pl"
  | "nl"
  | "ar"
  | "ja"
  | "ko"
  | "zh"
  | "th"
  | "vi"
  | "id";

/** A Game Language Neil offers in the Preferences message: its code and the Preference Role it gives. */
export interface GameLanguage {
  readonly code: GameLanguageCode;
  readonly roleName: string;
}

/** The Game Languages Neil offers. The list is fixed in the domain (plan R2). */
export const GAME_LANGUAGES: readonly GameLanguage[] = [
  { code: "en", roleName: "English" },
  { code: "de", roleName: "German" },
  { code: "fr", roleName: "French" },
  { code: "es", roleName: "Spanish" },
  { code: "it", roleName: "Italian" },
  { code: "pt", roleName: "Portuguese" },
  { code: "ru", roleName: "Russian" },
  { code: "tr", roleName: "Turkish" },
  { code: "pl", roleName: "Polish" },
  { code: "nl", roleName: "Dutch" },
  { code: "ar", roleName: "Arabic" },
  { code: "ja", roleName: "Japanese" },
  { code: "ko", roleName: "Korean" },
  { code: "zh", roleName: "Chinese" },
  { code: "th", roleName: "Thai" },
  { code: "vi", roleName: "Vietnamese" },
  { code: "id", roleName: "Indonesian" },
];

/** The key of a Region, as stored in a Preference. */
export type RegionKey = "americas" | "europe-africa" | "asia-oceania";

/** A Region a Member can choose: its key and the Preference Role it gives. */
export interface Region {
  readonly key: RegionKey;
  readonly roleName: string;
}

/** The Regions a Member can choose (one at most). */
export const REGIONS: readonly Region[] = [
  { key: "americas", roleName: "Americas" },
  { key: "europe-africa", roleName: "Europe/Africa" },
  { key: "asia-oceania", roleName: "Asia/Oceania" },
];

/** The key of an Interest, as stored in a Preference. `nap` is offered to R4 only and given to R5 (plan R3, R5). */
export type InterestKey = "pvp" | "events" | "trading" | "off-topic" | "nap";

/** An Interest a Member can choose: its key and the Preference Role it gives. */
export interface Interest {
  readonly key: InterestKey;
  readonly roleName: string;
}

/** The Interests a Member can choose. */
export const INTERESTS: readonly Interest[] = [
  { key: "pvp", roleName: "PvP" },
  { key: "events", roleName: "Events" },
  { key: "trading", roleName: "Trading" },
  { key: "off-topic", roleName: "Off-topic" },
  { key: "nap", roleName: "NaP discussions" },
];

/** The key of an Experience, as stored in a Preference. */
export type ExperienceKey = "new" | "intermediate" | "veteran";

/** An Experience a Member can choose: its key and the Preference Role it gives. */
export interface Experience {
  readonly key: ExperienceKey;
  readonly roleName: string;
}

/** The Experiences a Member can choose (one at most). */
export const EXPERIENCES: readonly Experience[] = [
  { key: "new", roleName: "New" },
  { key: "intermediate", roleName: "Intermediate" },
  { key: "veteran", roleName: "Veteran" },
];

/** A Member's Preferences: any number of Languages and Interests, at most one Region and one Experience. */
export interface Preferences {
  readonly languages: ReadonlySet<GameLanguageCode>;
  readonly region: RegionKey | undefined;
  readonly interests: ReadonlySet<InterestKey>;
  readonly experience: ExperienceKey | undefined;
}

/** Preferences with nothing chosen. */
export const EMPTY_PREFERENCES: Preferences = {
  languages: new Set<GameLanguageCode>(),
  region: undefined,
  interests: new Set<InterestKey>(),
  experience: undefined,
};

/** The Preference Role name for NaP discussions, given by rank (plan R3, R5). */
const NAP_ROLE_NAME = "NaP discussions";

/**
 * The Preference Role names a Member should hold for their Preferences and Alliance Rank (plan R3, R5). NaP discussions
 * is given to an R5 always, to an R4 only when chosen, and never to any other rank.
 */
export function preferenceRolesFor(preferences: Preferences, rank: AllianceRank | undefined): string[] {
  const names: string[] = [];
  for (const language of GAME_LANGUAGES) {
    if (preferences.languages.has(language.code)) names.push(language.roleName);
  }
  for (const region of REGIONS) {
    if (preferences.region === region.key) names.push(region.roleName);
  }
  for (const interest of INTERESTS) {
    if (interest.key === "nap") continue;
    if (preferences.interests.has(interest.key)) names.push(interest.roleName);
  }
  if (rank === "R5" || (rank === "R4" && preferences.interests.has("nap"))) names.push(NAP_ROLE_NAME);
  for (const experience of EXPERIENCES) {
    if (preferences.experience === experience.key) names.push(experience.roleName);
  }
  return names;
}

/** The Alliance Rank a Link carries, when it has one: a Link waiting for a Rank Approval or outside an Alliance has none. */
export function allianceRankOf(rank: RankOnLink): AllianceRank | undefined {
  return rank.source === "game-api" || rank.source === "rank-approval" ? rank.rank : undefined;
}

/** The Interests offered to a Member of a rank: all of them for R4, the others for everyone else (plan R3, R5). */
export function interestOptions(rank: AllianceRank | undefined): readonly Interest[] {
  if (rank === "R4") return INTERESTS;
  return INTERESTS.filter((interest) => interest.key !== "nap");
}

/**
 * The Game Language to preselect for a Player's in-game language code, matching by the first part of a regional code
 * (`zh-TW` is `zh`) and ignoring case. Undefined when the code is missing or not in the list (plan R2).
 */
export function preselectedLanguage(playerLanguage: string | undefined): GameLanguage | undefined {
  if (playerLanguage === undefined) return undefined;
  const code = playerLanguage.toLowerCase().replace(/-.*$/, "");
  return GAME_LANGUAGES.find((language) => language.code === code);
}

/** Every Preference Role name, each exactly once. None of them is a Managed Role name (plan R3). */
export const ALL_PREFERENCE_ROLE_NAMES: readonly string[] = [
  ...GAME_LANGUAGES.map((language) => language.roleName),
  ...REGIONS.map((region) => region.roleName),
  ...INTERESTS.map((interest) => interest.roleName),
  ...EXPERIENCES.map((experience) => experience.roleName),
];
