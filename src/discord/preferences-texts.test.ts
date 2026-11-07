import { MessageFlags } from "discord.js";
import { describe, expect, test } from "vitest";
import {
  EMPTY_PREFERENCES,
  type ExperienceKey,
  type GameLanguageCode,
  type InterestKey,
  type Preferences,
  type RegionKey,
} from "../domain/preferences.js";
import {
  guestChannelsReply,
  guidesLine,
  notLinkedReply,
  notYoursReply,
  officerLinkPreferencesMessage,
  parsePreferencesCustomId,
  preferencesCustomId,
  preferencesLogLine,
  PREFERENCES_PREFIX,
} from "./preferences-texts.js";

const MEMBER = "111111111111111111";
const FORUM = "777777777777777777";

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

describe("the private message after an Officer Link", () => {
  test("points the Member to /channels, with no mentions", () => {
    const message = officerLinkPreferencesMessage();

    expect(message.content).toContain("/channels");
    expect(message.allowedMentions).toEqual({ parse: [] });
  });
});

describe("the private refusal to a Guest on /channels", () => {
  test("is shown privately, with no mentions", () => {
    const reply = guestChannelsReply();

    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.allowedMentions).toEqual({ parse: [] });
  });

  test("reads exactly as the contract says", () => {
    expect(guestChannelsReply().content).toBe(
      "Channel choices are for Home Kingdom Members. As a Guest, you see the Guest area.",
    );
  });
});
