import { ComponentType, type APIButtonComponentWithCustomId, type APIStringSelectComponent } from "discord.js";
import { describe, expect, test } from "vitest";
import {
  EMPTY_PREFERENCES,
  GAME_LANGUAGES,
  PREFERENCE_STEPS,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type PreferenceStep,
  type Preferences,
  type RegionKey,
} from "../domain/preferences.js";
import {
  finishedMessage,
  parsePreferenceGoCustomId,
  preferenceGoCustomId,
  preferenceStepMessage,
  preferencesCustomId,
} from "./preferences-texts.js";

const MEMBER = "111111111111111111";
const DISCORD_MESSAGE_MAX = 2000;
const OPTION_DESCRIPTION_MAX = 100;

type StepOverrides = Partial<Omit<Parameters<typeof preferenceStepMessage>[0], "memberId" | "step">>;

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

function stepOf(step: PreferenceStep, overrides: StepOverrides = {}) {
  return preferenceStepMessage({
    memberId: MEMBER,
    step,
    preferences: EMPTY_PREFERENCES,
    rank: undefined,
    playerLanguage: undefined,
    guidesForumId: "222",
    ...overrides,
  });
}

function menusOf(step: PreferenceStep, overrides: StepOverrides = {}): APIStringSelectComponent[] {
  return stepOf(step, overrides)
    .components.flatMap((row) => row.components)
    .filter((component): component is APIStringSelectComponent => component.type === ComponentType.StringSelect);
}

function menuOf(step: PreferenceStep, overrides: StepOverrides = {}): APIStringSelectComponent {
  const [menu] = menusOf(step, overrides);
  if (menu === undefined) throw new Error(`the ${step} step has no menu`);
  return menu;
}

function defaultValues(menu: APIStringSelectComponent): string[] {
  return menu.options.filter((option) => option.default === true).map((option) => option.value);
}

function buttonsOf(step: PreferenceStep, overrides: StepOverrides = {}): APIButtonComponentWithCustomId[] {
  return stepOf(step, overrides)
    .components.flatMap((row) => row.components)
    .filter((component): component is APIButtonComponentWithCustomId => component.type === ComponentType.Button);
}

describe("the go custom id", () => {
  test("round-trips a step and a Member", () => {
    const customId = preferenceGoCustomId("region", MEMBER);

    expect(customId).toBe(`pref:go:region:${MEMBER}`);
    expect(parsePreferenceGoCustomId(customId)).toEqual({ step: "region", memberId: MEMBER });
  });

  test("is not read from other custom ids", () => {
    expect(parsePreferenceGoCustomId(preferencesCustomId("region", MEMBER))).toBeUndefined();
    expect(parsePreferenceGoCustomId(`pref:go:done:${MEMBER}`)).toBeUndefined();
  });
});

describe("a Preference step", () => {
  test.each(PREFERENCE_STEPS.map((step, index) => [step, index + 1] as const))(
    "%s shows one menu and its place among the four steps",
    (step, place) => {
      expect(menusOf(step)).toHaveLength(1);
      expect(stepOf(step).content).toContain(`Step ${place.toString()} of 4`);
    },
  );

  test.each(PREFERENCE_STEPS)("%s fits Discord's limits and pings nobody", (step) => {
    const message = stepOf(step);

    expect(message.content.length).toBeLessThanOrEqual(DISCORD_MESSAGE_MAX);
    expect(message.allowedMentions).toEqual({ parse: [] });
    for (const option of menusOf(step)[0]?.options ?? []) {
      expect((option.description ?? "").length).toBeLessThanOrEqual(OPTION_DESCRIPTION_MAX);
    }
  });

  test.each(PREFERENCE_STEPS)("%s has a menu whose custom id carries the Member's id", (step) => {
    expect(menuOf(step).custom_id).toBe(preferencesCustomId(step, MEMBER));
  });

  test("Languages explains what the steps are for and that they can be skipped", () => {
    expect(stepOf("languages").content).toContain("you can skip anything");
  });

  test("Interests explains each Interest it offers", () => {
    for (const option of menusOf("interests")[0]?.options ?? []) expect(option.description).toBeTruthy();
  });

  test("Interests says either PvP or Events shows Alliance Duel and Kingdom vs Kingdom", () => {
    expect(stepOf("interests").content).toContain("PvP or Events also shows Alliance Duel and Kingdom vs Kingdom.");
  });

  test("Recruitment says it holds a channel per Region", () => {
    const recruitment = menusOf("interests")[0]?.options.find((option) => option.value === "recruitment");

    expect(recruitment?.description).toContain("each Region");
  });

  test("Interests offers NaP discussions to an R4 only", () => {
    const values = (rank?: "R4" | "R5") => menusOf("interests", { rank })[0]?.options.map((option) => option.value);

    expect(values("R4")).toContain("nap");
    expect(values("R5")).not.toContain("nap");
    expect(values()).not.toContain("nap");
  });

  test.each(["region", "experience"] as const)("%s says it is optional", (step) => {
    expect(stepOf(step).content).toContain("optional");
  });

  test("shows the stored answers as chosen", () => {
    const preferences: Preferences = { ...EMPTY_PREFERENCES, region: "americas" };

    expect(menusOf("region", { preferences })[0]?.options.find((option) => option.default)?.value).toBe("americas");
  });

  test("Experience gives the guides line once it is answered", () => {
    expect(stepOf("experience", { preferences: preferencesWith({ experience: "veteran" }) }).content).toContain("<#222>");
  });

  test("Experience says what Done does", () => {
    expect(stepOf("experience").content).toContain("/channels");
  });
});

describe("the menus of a Preference step", () => {
  test("the Languages menu offers every Game Language by code, labelled with its role name, up to all of them", () => {
    const languages = menuOf("languages");

    expect(languages.min_values).toBe(0);
    expect(languages.max_values).toBe(GAME_LANGUAGES.length);
    expect(languages.options.map((option) => ({ value: option.value, label: option.label }))).toEqual(
      GAME_LANGUAGES.map((language) => ({ value: language.code, label: language.roleName })),
    );
  });

  test("the Region menu offers the three Regions by key, one at most", () => {
    const region = menuOf("region");

    expect(region.min_values).toBe(0);
    expect(region.max_values).toBe(1);
    expect(region.options.map((option) => ({ value: option.value, label: option.label }))).toEqual([
      { value: "americas", label: "Americas" },
      { value: "europe-africa", label: "Europe/Africa" },
      { value: "asia-oceania", label: "Asia/Oceania" },
    ]);
  });

  test("the Experience menu offers New, Intermediate and Veteran, one at most", () => {
    const experience = menuOf("experience");

    expect(experience.min_values).toBe(0);
    expect(experience.max_values).toBe(1);
    expect(experience.options.map((option) => ({ value: option.value, label: option.label }))).toEqual([
      { value: "new", label: "New" },
      { value: "intermediate", label: "Intermediate" },
      { value: "veteran", label: "Veteran" },
    ]);
  });

  test("the Interests menu for no rank, R1, R3, R5 and unknown ranks has the four Interests, up to four", () => {
    for (const rank of [undefined, "R1", "R3", "R5", "unknown"] as const) {
      const interests = menuOf("interests", { rank });

      expect(interests.min_values).toBe(0);
      expect(interests.max_values).toBe(4);
      expect(interests.options.map((option) => option.value)).toEqual(["pvp", "events", "recruitment", "off-topic"]);
    }
  });

  test("the Interests menu for R4 adds NaP discussions, labelled with its role name", () => {
    const interests = menuOf("interests", { rank: "R4" });

    expect(interests.max_values).toBe(5);
    expect(interests.options.map((option) => ({ value: option.value, label: option.label }))).toEqual([
      { value: "pvp", label: "PvP" },
      { value: "events", label: "Events" },
      { value: "recruitment", label: "Recruitment" },
      { value: "off-topic", label: "Off-topic" },
      { value: "nap", label: "NaP discussions" },
    ]);
  });
});

describe("the defaults of a Preference step", () => {
  test("the stored answers are the options marked as chosen, on each step", () => {
    const preferences = preferencesWith({
      languages: ["it", "en"],
      region: "europe-africa",
      interests: ["pvp", "events"],
      experience: "veteran",
    });

    expect(defaultValues(menuOf("languages", { preferences })).sort()).toEqual(["en", "it"]);
    expect(defaultValues(menuOf("region", { preferences }))).toEqual(["europe-africa"]);
    expect(defaultValues(menuOf("interests", { preferences, rank: "R4" })).sort()).toEqual(["events", "pvp"]);
    expect(defaultValues(menuOf("experience", { preferences }))).toEqual(["veteran"]);
  });

  test("with nothing stored, the Language menu preselects the Player's language, matching a regional code by its first part", () => {
    expect(defaultValues(menuOf("languages", { playerLanguage: "zh-TW" }))).toEqual(["zh"]);
  });

  test("the Player's language is preselected on the Language step only", () => {
    for (const step of ["region", "interests", "experience"] as const) {
      expect(defaultValues(menuOf(step, { playerLanguage: "zh-TW" }))).toEqual([]);
    }
  });

  test("a Player language outside the Game Languages preselects nothing", () => {
    expect(defaultValues(menuOf("languages", { playerLanguage: "sv" }))).toEqual([]);
  });

  test("a stored Language wins over the Player's language", () => {
    const languages = menuOf("languages", {
      preferences: preferencesWith({ languages: ["it"] }),
      playerLanguage: "ja",
    });

    expect(defaultValues(languages)).toEqual(["it"]);
  });

  test("the Player's language is not preselected once another Preference is stored", () => {
    const preferences = preferencesWith({ region: "americas" });

    expect(defaultValues(menuOf("languages", { preferences, playerLanguage: "ja" }))).toEqual([]);
    expect(defaultValues(menuOf("region", { preferences, playerLanguage: "ja" }))).toEqual(["americas"]);
  });
});

describe("the buttons of a Preference step", () => {
  test("an unanswered step offers Skip to the next step", () => {
    expect(buttonsOf("region").find((button) => button.label === "Skip")?.custom_id).toBe(
      preferenceGoCustomId("experience", MEMBER),
    );
  });

  test("an answered step offers Next to the next step", () => {
    const answered = buttonsOf("region", { preferences: preferencesWith({ region: "americas" }) });

    expect(answered.find((button) => button.label === "Next")?.custom_id).toBe(preferenceGoCustomId("experience", MEMBER));
    expect(answered.find((button) => button.label === "Skip")).toBeUndefined();
  });

  test("the first step has no Back; the others go to the step before", () => {
    expect(buttonsOf("languages").find((button) => button.label === "Back")).toBeUndefined();
    expect(buttonsOf("interests").find((button) => button.label === "Back")?.custom_id).toBe(
      preferenceGoCustomId("languages", MEMBER),
    );
  });

  test("the last step offers Done and no Skip", () => {
    const labels = buttonsOf("experience").map((button) => button.label);

    expect(labels).toContain("Done");
    expect(labels).not.toContain("Skip");
    expect(buttonsOf("experience").find((button) => button.label === "Done")?.custom_id).toBe(
      preferencesCustomId("done", MEMBER),
    );
  });
});

describe("the finishing message", () => {
  test("names /channels, gives the guides line and has no menus", () => {
    const message = finishedMessage("new", "222");

    expect(message.content).toContain("/channels");
    expect(message.content).toContain("<#222>");
    expect(message.components).toEqual([]);
  });

  test("has no guides line for an Intermediate Member", () => {
    expect(finishedMessage("intermediate", "222").content).not.toContain("<#222>");
  });
});
