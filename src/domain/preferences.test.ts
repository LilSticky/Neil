import { describe, expect, test } from "vitest";
import { isManagedRoleName } from "./managed-roles.js";
import {
  ALL_PREFERENCE_ROLE_NAMES,
  EMPTY_PREFERENCES,
  EXPERIENCES,
  GAME_LANGUAGES,
  INTERESTS,
  REGIONS,
  interestOptions,
  isKnownGuest,
  isKnownInHomeKingdom,
  preferenceRolesFor,
  preselectedLanguage,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type Preferences,
  type RegionKey,
} from "./preferences.js";
import type { AllianceRank } from "./player.js";
import { kingdomOf } from "./__fixtures__/players.js";

const NAP_ROLE = "NaP discussions";

function sorted(names: readonly string[]): string[] {
  return [...names].sort();
}

function preferencesWith(overrides: {
  readonly languages?: readonly GameLanguageCode[];
  readonly region?: RegionKey;
  readonly interests?: readonly InterestKey[];
  readonly experience?: ExperienceKey;
}): Preferences {
  return {
    languages: new Set<GameLanguageCode>(overrides.languages ?? []),
    region: overrides.region,
    interests: new Set<InterestKey>(overrides.interests ?? []),
    experience: overrides.experience,
  };
}

describe("GAME_LANGUAGES", () => {
  test("lists the 17 Game Languages of plan R2, each with its code and role name", () => {
    expect(GAME_LANGUAGES).toEqual([
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
    ]);
  });
});

describe("REGIONS, INTERESTS and EXPERIENCES", () => {
  test("REGIONS are Americas, Europe/Africa and Asia/Oceania", () => {
    expect(REGIONS.map((region) => region.roleName)).toEqual(["Americas", "Europe/Africa", "Asia/Oceania"]);
  });

  test("INTERESTS are PvP, Events, Trading, Off-topic and NaP discussions", () => {
    expect(INTERESTS).toEqual([
      { key: "pvp", roleName: "PvP" },
      { key: "events", roleName: "Events" },
      { key: "trading", roleName: "Trading" },
      { key: "off-topic", roleName: "Off-topic" },
      { key: "nap", roleName: NAP_ROLE },
    ]);
  });

  test("EXPERIENCES are New, Intermediate and Veteran", () => {
    expect(EXPERIENCES).toEqual([
      { key: "new", roleName: "New" },
      { key: "intermediate", roleName: "Intermediate" },
      { key: "veteran", roleName: "Veteran" },
    ]);
  });
});

describe("EMPTY_PREFERENCES", () => {
  test("has no Languages, no Region, no Interests and no Experience", () => {
    expect(EMPTY_PREFERENCES.languages.size).toBe(0);
    expect(EMPTY_PREFERENCES.region).toBeUndefined();
    expect(EMPTY_PREFERENCES.interests.size).toBe(0);
    expect(EMPTY_PREFERENCES.experience).toBeUndefined();
  });
});

describe("preferenceRolesFor", () => {
  test("gives the Preference Roles for the chosen Languages, Region and Experience", () => {
    const preferences = preferencesWith({
      languages: ["it", "en"],
      region: "europe-africa",
      experience: "veteran",
    });

    expect(sorted(preferenceRolesFor(preferences, "R1"))).toEqual(
      sorted(["Italian", "English", "Europe/Africa", "Veteran"]),
    );
  });

  test("gives nothing for empty Preferences", () => {
    expect(preferenceRolesFor(EMPTY_PREFERENCES, "R1")).toEqual([]);
  });

  test("gives NaP discussions to an R4 who chose it", () => {
    const preferences = preferencesWith({ interests: ["pvp", "nap"] });

    expect(sorted(preferenceRolesFor(preferences, "R4"))).toEqual(sorted(["PvP", NAP_ROLE]));
  });

  test("does not give NaP discussions to an R4 who did not choose it", () => {
    const preferences = preferencesWith({ interests: ["pvp"] });

    expect(preferenceRolesFor(preferences, "R4")).toEqual(["PvP"]);
  });

  test("gives NaP discussions to an R5 without choosing it", () => {
    expect(preferenceRolesFor(EMPTY_PREFERENCES, "R5")).toEqual([NAP_ROLE]);
  });

  test("gives NaP discussions to an R5 once, even when it was chosen", () => {
    const preferences = preferencesWith({ interests: ["nap"] });

    expect(preferenceRolesFor(preferences, "R5")).toEqual([NAP_ROLE]);
  });

  test.each<AllianceRank | undefined>(["R1", "R2", "R3", "unknown", undefined])(
    "never gives NaP discussions for rank %s, even when chosen",
    (rank) => {
      const preferences = preferencesWith({ interests: ["nap"] });

      expect(preferenceRolesFor(preferences, rank)).not.toContain(NAP_ROLE);
    },
  );
});

describe("interestOptions", () => {
  test("offers all five Interests to an R4, NaP discussions included", () => {
    expect(interestOptions("R4")).toEqual(INTERESTS);
  });

  test("offers the four other Interests to an R5, without NaP discussions since it is given automatically", () => {
    expect(interestOptions("R5")).toEqual(INTERESTS.filter((interest) => interest.key !== "nap"));
  });

  test.each<AllianceRank | undefined>(["R1", "R2", "R3", "unknown", undefined])(
    "offers the four other Interests, not NaP discussions, for rank %s",
    (rank) => {
      expect(interestOptions(rank)).toEqual(INTERESTS.filter((interest) => interest.key !== "nap"));
    },
  );
});

describe("preselectedLanguage", () => {
  test("returns the Game Language for a code", () => {
    expect(preselectedLanguage("it")).toEqual({ code: "it", roleName: "Italian" });
  });

  test("matches a code case-insensitively", () => {
    expect(preselectedLanguage("IT")).toEqual({ code: "it", roleName: "Italian" });
  });

  test("matches a regional code by its first part", () => {
    expect(preselectedLanguage("zh-TW")).toEqual({ code: "zh", roleName: "Chinese" });
    expect(preselectedLanguage("pt-BR")).toEqual({ code: "pt", roleName: "Portuguese" });
  });

  test("returns undefined for a code outside the list", () => {
    expect(preselectedLanguage("xx")).toBeUndefined();
  });

  test("returns undefined when the Player has no Language", () => {
    expect(preselectedLanguage(undefined)).toBeUndefined();
  });
});

describe("ALL_PREFERENCE_ROLE_NAMES", () => {
  test("holds every Preference Role name exactly once", () => {
    expect(new Set(ALL_PREFERENCE_ROLE_NAMES).size).toBe(ALL_PREFERENCE_ROLE_NAMES.length);
    expect(sorted(ALL_PREFERENCE_ROLE_NAMES)).toEqual(
      sorted([
        ...GAME_LANGUAGES.map((language) => language.roleName),
        ...REGIONS.map((region) => region.roleName),
        ...INTERESTS.map((interest) => interest.roleName),
        ...EXPERIENCES.map((experience) => experience.roleName),
      ]),
    );
  });

  test("holds no name that is a Managed Role name for any Alliance tag", () => {
    const allianceTags = ["NML", "DRK", "R4", "#12", "T10"];

    for (const name of ALL_PREFERENCE_ROLE_NAMES) {
      expect(isManagedRoleName(name, allianceTags)).toBe(false);
    }
  });
});

describe("isKnownInHomeKingdom", () => {
  test("is true when the Applied State roles include the Home Kingdom's role", () => {
    expect(isKnownInHomeKingdom(["NML", "#330", "R4"], kingdomOf(330))).toBe(true);
  });

  test("is false when the roles hold only a role of another Kingdom", () => {
    expect(isKnownInHomeKingdom(["#12", "NML"], kingdomOf(330))).toBe(false);
  });

  test("is false for an empty list of roles", () => {
    expect(isKnownInHomeKingdom([], kingdomOf(330))).toBe(false);
  });

  test("is false for a Kingdom number that is a prefix of the role's Kingdom (#33 is not #330)", () => {
    expect(isKnownInHomeKingdom(["#330"], kingdomOf(33))).toBe(false);
  });

  test("is false for a role whose Kingdom number is a prefix of the Home Kingdom (#330 is not #33)", () => {
    expect(isKnownInHomeKingdom(["#33"], kingdomOf(330))).toBe(false);
  });

  test("is false when there is no Applied State", () => {
    expect(isKnownInHomeKingdom(undefined, kingdomOf(330))).toBe(false);
  });
});

describe("isKnownGuest", () => {
  test("is true when the Applied State roles do not include the Home Kingdom's role", () => {
    expect(isKnownGuest(["NML", "#12", "R4"], kingdomOf(330))).toBe(true);
  });

  test("is false when the roles include the Home Kingdom's role", () => {
    expect(isKnownGuest(["NML", "#330", "R4"], kingdomOf(330))).toBe(false);
  });

  test("is true for a role of another Kingdom whose number has the Home Kingdom as a prefix (#330 is not #33)", () => {
    expect(isKnownGuest(["#330"], kingdomOf(33))).toBe(true);
  });

  test("is true for an empty list of roles, since the list is given and holds no Home Kingdom role", () => {
    expect(isKnownGuest([], kingdomOf(330))).toBe(true);
  });

  test("is false when there is no Applied State", () => {
    expect(isKnownGuest(undefined, kingdomOf(330))).toBe(false);
  });
});
