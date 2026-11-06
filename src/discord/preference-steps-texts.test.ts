import { ComponentType, type APIButtonComponentWithCustomId, type APIStringSelectComponent } from "discord.js";
import { describe, expect, test } from "vitest";
import { EMPTY_PREFERENCES, PREFERENCE_STEPS, type PreferenceStep, type Preferences } from "../domain/preferences.js";
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

function stepOf(step: PreferenceStep, preferences: Preferences = EMPTY_PREFERENCES, rank?: "R4" | "R5") {
  return preferenceStepMessage({ memberId: MEMBER, step, preferences, rank, playerLanguage: undefined, guidesForumId: "222" });
}

function menusOf(step: PreferenceStep, preferences?: Preferences, rank?: "R4" | "R5"): APIStringSelectComponent[] {
  return stepOf(step, preferences, rank)
    .components.flatMap((row) => row.components)
    .filter((component): component is APIStringSelectComponent => component.type === ComponentType.StringSelect);
}

function buttonsOf(step: PreferenceStep, preferences?: Preferences): APIButtonComponentWithCustomId[] {
  return stepOf(step, preferences)
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
    const values = (rank?: "R4" | "R5") => menusOf("interests", undefined, rank)[0]?.options.map((option) => option.value);

    expect(values("R4")).toContain("nap");
    expect(values("R5")).not.toContain("nap");
    expect(values()).not.toContain("nap");
  });

  test.each(["region", "experience"] as const)("%s says it is optional", (step) => {
    expect(stepOf(step).content).toContain("optional");
  });

  test("shows the stored answers as chosen", () => {
    const preferences: Preferences = { ...EMPTY_PREFERENCES, region: "americas" };

    expect(menusOf("region", preferences)[0]?.options.find((option) => option.default)?.value).toBe("americas");
  });

  test("Experience gives the guides line once it is answered", () => {
    expect(stepOf("experience", { ...EMPTY_PREFERENCES, experience: "veteran" }).content).toContain("<#222>");
  });

  test("Experience says what Done does", () => {
    expect(stepOf("experience").content).toContain("/channels");
  });
});

describe("the buttons of a Preference step", () => {
  test("an unanswered step offers Skip to the next step", () => {
    expect(buttonsOf("region").find((button) => button.label === "Skip")?.custom_id).toBe(
      preferenceGoCustomId("experience", MEMBER),
    );
  });

  test("an answered step offers Next to the next step", () => {
    const answered = buttonsOf("region", { ...EMPTY_PREFERENCES, region: "americas" });

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
