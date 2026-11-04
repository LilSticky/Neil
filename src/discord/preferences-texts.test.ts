import { ComponentType, MessageFlags, type APIStringSelectComponent } from "discord.js";
import { describe, expect, test } from "vitest";
import {
  EMPTY_PREFERENCES,
  GAME_LANGUAGES,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type Preferences,
  type RegionKey,
} from "../domain/preferences.js";
import {
  guidesLine,
  notLinkedReply,
  notYoursReply,
  parsePreferencesCustomId,
  preferencesCustomId,
  preferencesLogLine,
  preferencesMessage,
  PREFERENCES_PREFIX,
} from "./preferences-texts.js";

const MEMBER = "111111111111111111";
const FORUM = "777777777777777777";

type PreferencesMessage = ReturnType<typeof preferencesMessage>;
type MessageOptions = Parameters<typeof preferencesMessage>[0];
type SelectQuestion = "languages" | "region" | "interests" | "experience";

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

function messageFor(overrides: Partial<MessageOptions> = {}): PreferencesMessage {
  return preferencesMessage({
    memberId: MEMBER,
    preferences: EMPTY_PREFERENCES,
    rank: undefined,
    playerLanguage: undefined,
    guidesForumId: undefined,
    ...overrides,
  });
}

function menu(message: PreferencesMessage, question: SelectQuestion): APIStringSelectComponent {
  const found = message.components
    .flatMap((row) => row.components)
    .find((component) => component.type === ComponentType.StringSelect && component.custom_id === `pref:${question}:${MEMBER}`);
  if (found === undefined || found.type !== ComponentType.StringSelect) {
    throw new Error(`the Preferences message has no ${question} menu`);
  }
  return found;
}

function optionValues(component: APIStringSelectComponent): string[] {
  return component.options.map((option) => option.value);
}

function defaultValues(component: APIStringSelectComponent): string[] {
  return component.options.filter((option) => option.default === true).map((option) => option.value);
}

describe("preferences custom ids", () => {
  test("builds pref:{question}:{memberId}", () => {
    expect(PREFERENCES_PREFIX).toBe("pref:");
    expect(preferencesCustomId("languages", MEMBER)).toBe(`pref:languages:${MEMBER}`);
  });

  test.each(["languages", "region", "interests", "experience", "done"] as const)(
    "%s round-trips through parsePreferencesCustomId",
    (question) => {
      expect(parsePreferencesCustomId(preferencesCustomId(question, MEMBER))).toEqual({ question, memberId: MEMBER });
    },
  );

  test.each([
    ["another prefix", "interview:uid:7"],
    ["a rank custom id", "rank:7:R1"],
    ["an unknown question", `pref:bogus:${MEMBER}`],
    ["a non-snowflake member id", "pref:languages:abc"],
    ["an empty member id", "pref:languages:"],
    ["a fractional member id", "pref:languages:1.5"],
    ["an extra segment", `pref:languages:${MEMBER}:extra`],
    ["the empty string", ""],
  ])("parsePreferencesCustomId gives undefined for %s", (_label, customId) => {
    expect(parsePreferencesCustomId(customId)).toBeUndefined();
  });

  test("every preferences custom id is at most 100 characters, even for a long member id", () => {
    for (const question of ["languages", "region", "interests", "experience", "done"] as const) {
      expect(preferencesCustomId(question, "9".repeat(20)).length).toBeLessThanOrEqual(100);
    }
  });
});

describe("preferencesMessage components", () => {
  test("has five action rows: four select menus, then one row with the Done button", () => {
    const message = messageFor();

    expect(message.components.map((row) => row.components.map((component) => component.type))).toEqual([
      [ComponentType.StringSelect],
      [ComponentType.StringSelect],
      [ComponentType.StringSelect],
      [ComponentType.StringSelect],
      [ComponentType.Button],
    ]);
  });

  test("the Languages menu offers every Game Language by code, labelled with its role name, up to all of them", () => {
    const languages = menu(messageFor(), "languages");

    expect(languages.min_values).toBe(0);
    expect(languages.max_values).toBe(GAME_LANGUAGES.length);
    expect(languages.options.map((option) => ({ value: option.value, label: option.label }))).toEqual(
      GAME_LANGUAGES.map((language) => ({ value: language.code, label: language.roleName })),
    );
  });

  test("the Region menu offers the three Regions by key, one at most", () => {
    const region = menu(messageFor(), "region");

    expect(region.min_values).toBe(0);
    expect(region.max_values).toBe(1);
    expect(region.options.map((option) => ({ value: option.value, label: option.label }))).toEqual([
      { value: "americas", label: "Americas" },
      { value: "europe-africa", label: "Europe/Africa" },
      { value: "asia-oceania", label: "Asia/Oceania" },
    ]);
  });

  test("the Experience menu offers New, Intermediate and Veteran, one at most", () => {
    const experience = menu(messageFor(), "experience");

    expect(experience.min_values).toBe(0);
    expect(experience.max_values).toBe(1);
    expect(experience.options.map((option) => ({ value: option.value, label: option.label }))).toEqual([
      { value: "new", label: "New" },
      { value: "intermediate", label: "Intermediate" },
      { value: "veteran", label: "Veteran" },
    ]);
  });

  test("the Interests menu for R1 to R3 and unknown ranks has four Interests, without NaP discussions", () => {
    for (const rank of [undefined, "R1", "R3", "unknown"] as const) {
      const interests = menu(messageFor({ rank }), "interests");

      expect(interests.min_values).toBe(0);
      expect(interests.max_values).toBe(4);
      expect(optionValues(interests)).toEqual(["pvp", "events", "trading", "off-topic"]);
    }
  });

  test("the Interests menu for R5 has the same four Interests: NaP discussions is given, not asked", () => {
    const interests = menu(messageFor({ rank: "R5" }), "interests");

    expect(interests.max_values).toBe(4);
    expect(optionValues(interests)).not.toContain("nap");
  });

  test("the Interests menu for R4 adds NaP discussions, labelled with its role name", () => {
    const interests = menu(messageFor({ rank: "R4" }), "interests");

    expect(interests.max_values).toBe(5);
    expect(interests.options.map((option) => ({ value: option.value, label: option.label }))).toEqual([
      { value: "pvp", label: "PvP" },
      { value: "events", label: "Events" },
      { value: "trading", label: "Trading" },
      { value: "off-topic", label: "Off-topic" },
      { value: "nap", label: "NaP discussions" },
    ]);
  });

  test("the Done button is labelled Done and carries the Member's Done custom id", () => {
    const done = messageFor()
      .components.flatMap((row) => row.components)
      .find((component) => component.type === ComponentType.Button);

    expect(done).toMatchObject({ type: ComponentType.Button, label: "Done", custom_id: `pref:done:${MEMBER}` });
  });

  test("each menu's custom id carries the Member's id", () => {
    const message = messageFor();

    for (const question of ["languages", "region", "interests", "experience"] as const) {
      expect(menu(message, question).custom_id).toBe(`pref:${question}:${MEMBER}`);
    }
  });
});

describe("preferencesMessage defaults", () => {
  test("the stored answers are the options marked as chosen", () => {
    const message = messageFor({
      preferences: preferencesWith({
        languages: ["it", "en"],
        region: "europe-africa",
        interests: ["pvp", "events"],
        experience: "veteran",
      }),
      rank: "R4",
    });

    expect(defaultValues(menu(message, "languages")).sort()).toEqual(["en", "it"]);
    expect(defaultValues(menu(message, "region"))).toEqual(["europe-africa"]);
    expect(defaultValues(menu(message, "interests")).sort()).toEqual(["events", "pvp"]);
    expect(defaultValues(menu(message, "experience"))).toEqual(["veteran"]);
  });

  test("with nothing stored, the Language menu preselects the Player's language, matching a regional code by its first part", () => {
    const message = messageFor({ playerLanguage: "zh-TW" });

    expect(defaultValues(menu(message, "languages"))).toEqual(["zh"]);
    expect(defaultValues(menu(message, "region"))).toEqual([]);
    expect(defaultValues(menu(message, "interests"))).toEqual([]);
    expect(defaultValues(menu(message, "experience"))).toEqual([]);
  });

  test("a Player language outside the Game Languages preselects nothing", () => {
    const message = messageFor({ playerLanguage: "sv" });

    expect(defaultValues(menu(message, "languages"))).toEqual([]);
  });

  test("a stored Language wins over the Player's language", () => {
    const message = messageFor({
      preferences: preferencesWith({ languages: ["it"] }),
      playerLanguage: "ja",
    });

    expect(defaultValues(menu(message, "languages"))).toEqual(["it"]);
  });

  test("the Player's language is not preselected once another Preference is stored", () => {
    const message = messageFor({
      preferences: preferencesWith({ region: "americas" }),
      playerLanguage: "ja",
    });

    expect(defaultValues(menu(message, "languages"))).toEqual([]);
    expect(defaultValues(menu(message, "region"))).toEqual(["americas"]);
  });
});

describe("preferencesMessage content", () => {
  test("a Veteran's message includes the invitation to write guides in the guides forum", () => {
    const message = messageFor({
      preferences: preferencesWith({ experience: "veteran" }),
      guidesForumId: FORUM,
    });

    expect(message.content).toContain(`<#${FORUM}>`);
  });
});

describe("guidesLine", () => {
  test("a Veteran is invited to write guides in the guides forum", () => {
    const line = guidesLine("veteran", FORUM);

    expect(line).toContain(`<#${FORUM}>`);
    expect(line).toMatch(/write/i);
    expect(line).toMatch(/guides/i);
  });

  test("a New player is pointed to read the guides in the guides forum", () => {
    const line = guidesLine("new", FORUM);

    expect(line).toContain(`<#${FORUM}>`);
    expect(line).toMatch(/read/i);
    expect(line).toMatch(/guides/i);
  });

  test("an Intermediate player gets no guides line", () => {
    expect(guidesLine("intermediate", FORUM)).toBeUndefined();
  });

  test("no Experience gives no guides line", () => {
    expect(guidesLine(undefined, FORUM)).toBeUndefined();
  });

  test("without a guides forum ID the line names the guides forum instead of a channel", () => {
    const veteran = guidesLine("veteran", undefined);
    const newPlayer = guidesLine("new", undefined);

    expect(veteran).toContain("the guides forum");
    expect(veteran).not.toContain("<#");
    expect(newPlayer).toContain("the guides forum");
    expect(newPlayer).not.toContain("<#");
  });
});

describe("preferencesLogLine", () => {
  test("lists every chosen answer after its name, the parts separated by ·", () => {
    const line = preferencesLogLine(
      MEMBER,
      preferencesWith({
        languages: ["it", "en"],
        region: "europe-africa",
        interests: ["pvp"],
        experience: "veteran",
      }),
    );

    expect(line.content).toBe(
      `<@${MEMBER}> Preferences: Languages Italian, English · Region Europe/Africa · Interests PvP · Experience Veteran`,
    );
  });

  test("omits the parts that have nothing chosen", () => {
    const line = preferencesLogLine(MEMBER, preferencesWith({ region: "americas" }));

    expect(line.content).toBe(`<@${MEMBER}> Preferences: Region Americas`);
  });

  test("with nothing chosen, says none", () => {
    expect(preferencesLogLine(MEMBER, EMPTY_PREFERENCES).content).toBe(`<@${MEMBER}> Preferences: none`);
  });
});

describe("private replies about the Preferences", () => {
  test("a Member who is not Linked is told to finish onboarding first, privately", () => {
    const reply = notLinkedReply();

    expect(reply.content).toMatch(/finish onboarding first/);
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
  });

  test("a press by another Member says these choices belong to another Member, privately", () => {
    const reply = notYoursReply();

    expect(reply.content).toMatch(/belong to another Member/);
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
  });
});
