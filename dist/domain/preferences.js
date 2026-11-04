/** The Game Languages Neil offers. The list is fixed in the domain (plan R2). */
export const GAME_LANGUAGES = [
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
/** The Regions a Member can choose (one at most). */
export const REGIONS = [
    { key: "americas", roleName: "Americas" },
    { key: "europe-africa", roleName: "Europe/Africa" },
    { key: "asia-oceania", roleName: "Asia/Oceania" },
];
/** The Interests a Member can choose. */
export const INTERESTS = [
    { key: "pvp", roleName: "PvP" },
    { key: "events", roleName: "Events" },
    { key: "trading", roleName: "Trading" },
    { key: "off-topic", roleName: "Off-topic" },
    { key: "nap", roleName: "NaP discussions" },
];
/** The Experiences a Member can choose (one at most). */
export const EXPERIENCES = [
    { key: "new", roleName: "New" },
    { key: "intermediate", roleName: "Intermediate" },
    { key: "veteran", roleName: "Veteran" },
];
/** Preferences with nothing chosen. */
export const EMPTY_PREFERENCES = {
    languages: new Set(),
    region: undefined,
    interests: new Set(),
    experience: undefined,
};
/** The Preference Role name for NaP discussions, given by rank (plan R3, R5). */
const NAP_ROLE_NAME = "NaP discussions";
/**
 * The Preference Role names a Member should hold for their Preferences and Alliance Rank (plan R3, R5). NaP discussions
 * is given to an R5 always, to an R4 only when chosen, and never to any other rank.
 */
export function preferenceRolesFor(preferences, rank) {
    const names = [];
    for (const language of GAME_LANGUAGES) {
        if (preferences.languages.has(language.code))
            names.push(language.roleName);
    }
    for (const region of REGIONS) {
        if (preferences.region === region.key)
            names.push(region.roleName);
    }
    for (const interest of INTERESTS) {
        if (interest.key === "nap")
            continue;
        if (preferences.interests.has(interest.key))
            names.push(interest.roleName);
    }
    if (rank === "R5" || (rank === "R4" && preferences.interests.has("nap")))
        names.push(NAP_ROLE_NAME);
    for (const experience of EXPERIENCES) {
        if (preferences.experience === experience.key)
            names.push(experience.roleName);
    }
    return names;
}
/** The Alliance Rank a Link carries, when it has one: a Link waiting for a Rank Approval or outside an Alliance has none. */
export function allianceRankOf(rank) {
    return rank.source === "game-api" || rank.source === "rank-approval" ? rank.rank : undefined;
}
/** The Interests offered to a Member of a rank: all of them for R4, the others for everyone else (plan R3, R5). */
export function interestOptions(rank) {
    if (rank === "R4")
        return INTERESTS;
    return INTERESTS.filter((interest) => interest.key !== "nap");
}
/**
 * The Game Language to preselect for a Player's in-game language code, matching by the first part of a regional code
 * (`zh-TW` is `zh`) and ignoring case. Undefined when the code is missing or not in the list (plan R2).
 */
export function preselectedLanguage(playerLanguage) {
    if (playerLanguage === undefined)
        return undefined;
    const code = playerLanguage.toLowerCase().replace(/-.*$/, "");
    return GAME_LANGUAGES.find((language) => language.code === code);
}
/** Every Preference Role name, each exactly once. None of them is a Managed Role name (plan R3). */
export const ALL_PREFERENCE_ROLE_NAMES = [
    ...GAME_LANGUAGES.map((language) => language.roleName),
    ...REGIONS.map((region) => region.roleName),
    ...INTERESTS.map((interest) => interest.roleName),
    ...EXPERIENCES.map((experience) => experience.roleName),
];
//# sourceMappingURL=preferences.js.map