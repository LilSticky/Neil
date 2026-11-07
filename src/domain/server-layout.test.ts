/*
 * Contract for src/domain/server-layout.ts (slice 020, data-model.md "Layout file" and "Expansion"). Names the implementer
 * must export:
 *
 *   type Permission = "ViewChannel" | "SendMessages" | "SendMessagesInThreads" | "CreatePublicThreads" | "CreatePrivateThreads" | "EmbedLinks";
 *   type ChannelType = "text" | "voice" | "forum" | "announcement";
 *   interface OverwriteSpec { allow: Permission[]; deny: Permission[] }
 *   interface LayoutChannel {
 *     name: string; type: ChannelType; mode?: "read-only" | "only-king-posts"; translated?: boolean;
 *     seenBy?: string[]; overwrites?: Record<string, OverwriteSpec>;
 *   }
 *   interface LayoutCategory { name: string; seenBy: string[]; channels: LayoutChannel[] }
 *   interface ServerLayout {
 *     roles: string[]; externalRoles: string[]; languages: string[]; categories: LayoutCategory[];
 *     allianceArea: { channels: { name: string; type: ChannelType }[] };
 *   }
 *   interface WantedOverwrite { target: string; allow: Permission[]; deny: Permission[] }
 *     // target: a role name, "@everyone", "Neil" or an external role name
 *   interface ExpandedChannel { name: string; type: ChannelType; overwrites: WantedOverwrite[] }
 *   interface ExpandedCategory { name: string; overwrites: WantedOverwrite[]; channels: ExpandedChannel[] }
 *   interface ExpandedLayout { roles: string[]; externalRoles: string[]; categories: ExpandedCategory[] }
 *   function expandLayout(layout: ServerLayout, homeKingdom: number, allianceRoles: readonly string[]): ExpandedLayout;
 *     // homeKingdom 330 is the role "#330"; allianceRoles are the "[TAG]" role names on the server
 */
import { describe, expect, test } from "vitest";
import {
  expandLayout,
  type ExpandedCategory,
  type ExpandedChannel,
  type ExpandedLayout,
  type LayoutCategory,
  type ServerLayout,
  type WantedOverwrite,
} from "./server-layout.js";

const HOME_KINGDOM = 330;
const KINGDOM_ROLE = "#330";

const layout: ServerLayout = {
  roles: ["Moderator", "King", "Onboarding", "Doctor", "R5", "#<Home Kingdom>", "PvP"],
  externalRoles: ["Interaction Bot"],
  languages: ["English", "Italian"],
  translations: [],
  categories: [
    {
      name: "Hangout",
      seenBy: ["#<Home Kingdom>"],
      channels: [
        { name: "general", type: "text", description: "A test channel." },
        { name: "rules", type: "text", description: "A test channel.", mode: "read-only" },
        { name: "kvk-announcements", type: "announcement", description: "A test channel.", mode: "only-king-posts", translated: true },
        { name: "closed", type: "text", description: "A test channel.", seenBy: ["R5", "King"] },
        { name: "onboarding", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel"], deny: [] } } },
        { name: "pvp-talk", type: "text", description: "A test channel.", seenBy: ["R5", "PvP"], mode: "read-only" },
      ],
    },
  ],
  allianceArea: {
    channels: [
      { name: "alliance-chat", type: "text", description: "A test channel." },
      { name: "alliance-voice", type: "voice", description: "A test channel." },
    ],
  },
};

function expanded(allianceRoles: readonly string[] = []): ExpandedLayout {
  return expandLayout(layout, HOME_KINGDOM, allianceRoles);
}

function categoryNamed(result: ExpandedLayout, name: string): ExpandedCategory {
  const category = result.categories.find((candidate) => candidate.name === name);
  if (category === undefined) throw new Error(`no expanded category named ${name}`);
  return category;
}

function channelNamed(category: ExpandedCategory, name: string): ExpandedChannel {
  const channel = category.channels.find((candidate) => candidate.name === name);
  if (channel === undefined) throw new Error(`no expanded channel named ${name} in ${category.name}`);
  return channel;
}

function overwriteFor(overwrites: readonly WantedOverwrite[], target: string): WantedOverwrite {
  const overwrite = overwrites.find((candidate) => candidate.target === target);
  if (overwrite === undefined) throw new Error(`no wanted overwrite for ${target}`);
  return overwrite;
}

function targetsOf(overwrites: readonly WantedOverwrite[]): string[] {
  return overwrites.map((overwrite) => overwrite.target).sort();
}

describe("expandLayout: base rules", () => {
  test("every category and channel denies @everyone View Channel", () => {
    const hangout = categoryNamed(expanded(), "Hangout");
    expect(overwriteFor(hangout.overwrites, "@everyone").deny).toEqual(["ViewChannel"]);
    const general = channelNamed(hangout, "general");
    expect(overwriteFor(general.overwrites, "@everyone").deny).toEqual(["ViewChannel"]);
  });

  test("a seenBy role is allowed View Channel on the category and on its channels", () => {
    const hangout = categoryNamed(expanded(), "Hangout");
    expect(overwriteFor(hangout.overwrites, KINGDOM_ROLE).allow).toEqual(["ViewChannel"]);
    const general = channelNamed(hangout, "general");
    expect(overwriteFor(general.overwrites, KINGDOM_ROLE).allow).toEqual(["ViewChannel"]);
  });

  test("a plain channel is spelled out with only @everyone and the seenBy role", () => {
    const general = channelNamed(categoryNamed(expanded(), "Hangout"), "general");
    expect(targetsOf(general.overwrites)).toEqual(["#330", "@everyone"]);
  });

  test("#<Home Kingdom> in the roles becomes the Kingdom role", () => {
    const result = expanded();
    expect(result.roles).toContain(KINGDOM_ROLE);
    expect(result.roles).not.toContain("#<Home Kingdom>");
  });

  test("the layout's roles and external roles are passed through", () => {
    const result = expanded();
    expect(result.roles).toEqual(expect.arrayContaining(["Moderator", "King", "Onboarding", "Doctor", "R5", "PvP"]));
    expect(result.externalRoles).toEqual(["Interaction Bot"]);
  });
});

describe("expandLayout: channel modes and flags", () => {
  test("read-only denies SendMessages to each seenBy role", () => {
    const pvpTalk = channelNamed(categoryNamed(expanded(), "Hangout"), "pvp-talk");
    expect(new Set(overwriteFor(pvpTalk.overwrites, "R5").deny)).toEqual(new Set(["SendMessages"]));
    expect(new Set(overwriteFor(pvpTalk.overwrites, "PvP").deny)).toEqual(new Set(["SendMessages"]));
    expect(overwriteFor(pvpTalk.overwrites, "R5").allow).toEqual(["ViewChannel"]);
  });

  test("only-king-posts denies posting and threads to each seenBy role", () => {
    const announcements = channelNamed(categoryNamed(expanded(), "Hangout"), "kvk-announcements");
    expect(new Set(overwriteFor(announcements.overwrites, KINGDOM_ROLE).deny)).toEqual(
      new Set(["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"]),
    );
  });

  test("only-king-posts lets King view and send", () => {
    const announcements = channelNamed(categoryNamed(expanded(), "Hangout"), "kvk-announcements");
    const king = overwriteFor(announcements.overwrites, "King");
    expect(new Set(king.allow)).toEqual(new Set(["ViewChannel", "SendMessages"]));
  });

  test("translated lets the Interaction Bot view and send", () => {
    const announcements = channelNamed(categoryNamed(expanded(), "Hangout"), "kvk-announcements");
    const bot = overwriteFor(announcements.overwrites, "Interaction Bot");
    expect(new Set(bot.allow)).toEqual(new Set(["ViewChannel", "SendMessages"]));
    expect(bot.deny).toEqual([]);
  });

  test("a channel without translated has no Interaction Bot overwrite", () => {
    const general = channelNamed(categoryNamed(expanded(), "Hangout"), "general");
    expect(targetsOf(general.overwrites)).not.toContain("Interaction Bot");
  });
});

describe("expandLayout: own overwrites", () => {
  test("a channel's own seenBy replaces the category's seenBy", () => {
    const closed = channelNamed(categoryNamed(expanded(), "Hangout"), "closed");
    expect(targetsOf(closed.overwrites)).not.toContain(KINGDOM_ROLE);
    expect(overwriteFor(closed.overwrites, "R5").allow).toEqual(["ViewChannel"]);
    expect(overwriteFor(closed.overwrites, "King").allow).toEqual(["ViewChannel"]);
  });

  test("an own deny wins over the category's allow for the same permission", () => {
    const withOwnDeny: LayoutCategory = {
      name: "Hangout",
      seenBy: ["#<Home Kingdom>"],
      channels: [
        { name: "own", type: "text", description: "A test channel.", overwrites: { "#<Home Kingdom>": { allow: [], deny: ["ViewChannel"] } } },
      ],
    };
    const result = expandLayout({ ...layout, categories: [withOwnDeny] }, HOME_KINGDOM, []);
    const own = channelNamed(categoryNamed(result, "Hangout"), "own");
    const kingdom = overwriteFor(own.overwrites, KINGDOM_ROLE);
    expect(kingdom.deny).toEqual(["ViewChannel"]);
    expect(kingdom.allow).not.toContain("ViewChannel");
  });

  test("an own allow wins over the category's read-only deny, and the other permissions stay", () => {
    const withOwnAllow: LayoutCategory = {
      name: "Hangout",
      seenBy: ["#<Home Kingdom>"],
      channels: [
        {
          name: "mixed",
          type: "text",
          description: "A test channel.",
          mode: "read-only",
          overwrites: { "#<Home Kingdom>": { allow: ["SendMessages"], deny: [] } },
        },
      ],
    };
    const result = expandLayout({ ...layout, categories: [withOwnAllow] }, HOME_KINGDOM, []);
    const mixed = channelNamed(categoryNamed(result, "Hangout"), "mixed");
    const kingdom = overwriteFor(mixed.overwrites, KINGDOM_ROLE);
    expect(new Set(kingdom.allow)).toEqual(new Set(["ViewChannel", "SendMessages"]));
    expect(kingdom.deny).toEqual([]);
  });
});

describe("expandLayout: languages", () => {
  test("a Languages category holds one channel per language, named in lower case with -chat", () => {
    const languages = categoryNamed(expanded(), "Languages");
    expect(languages.channels.map((channel) => channel.name).sort()).toEqual(["english-chat", "italian-chat"]);
  });

  test("each language channel is seen by its language's role and denied to @everyone", () => {
    const english = channelNamed(categoryNamed(expanded(), "Languages"), "english-chat");
    expect(english.type).toBe("text");
    expect(overwriteFor(english.overwrites, "English").allow).toEqual(["ViewChannel"]);
    expect(overwriteFor(english.overwrites, "@everyone").deny).toEqual(["ViewChannel"]);
    expect(targetsOf(english.overwrites)).toEqual(["@everyone", "English"]);
  });

  test("each language is a role of the layout", () => {
    expect(expanded().roles).toEqual(expect.arrayContaining(["English", "Italian"]));
  });
});

describe("expandLayout: Alliance areas", () => {
  test("each [TAG] role gets a category of its name, seen by that role", () => {
    const area = categoryNamed(expanded(["[ABC]"]), "[ABC]");
    expect(overwriteFor(area.overwrites, "[ABC]").allow).toEqual(["ViewChannel"]);
    expect(overwriteFor(area.overwrites, "@everyone").deny).toEqual(["ViewChannel"]);
  });

  test("each Alliance area holds alliance-chat as text and alliance-voice as voice, the same in each", () => {
    const result = expanded(["[ABC]", "[XYZ]"]);
    for (const name of ["[ABC]", "[XYZ]"]) {
      const area = categoryNamed(result, name);
      expect(channelNamed(area, "alliance-chat").type).toBe("text");
      expect(channelNamed(area, "alliance-voice").type).toBe("voice");
      expect(area.channels.map((channel) => channel.name).sort()).toEqual(["alliance-chat", "alliance-voice"]);
    }
  });

  test("an Alliance area is seen by its own role only, not by the Kingdom role", () => {
    const area = categoryNamed(expanded(["[ABC]"]), "[ABC]");
    const chat = channelNamed(area, "alliance-chat");
    expect(targetsOf(chat.overwrites)).toEqual(["@everyone", "[ABC]"]);
  });

  test("gives each Alliance's alliance-chat the overwrites the layout names, and its alliance-voice none", () => {
    const withNeilInChat: ServerLayout = {
      ...layout,
      allianceArea: {
        channels: [
          { name: "alliance-chat", type: "text", description: "A test channel.", overwrites: { Neil: { allow: ["ViewChannel", "SendMessages"], deny: [] } } },
          { name: "alliance-voice", type: "voice", description: "A test channel." },
        ],
      },
    };
    const result = expandLayout(withNeilInChat, HOME_KINGDOM, ["[ABC]", "[XYZ]"]);

    for (const name of ["[ABC]", "[XYZ]"]) {
      const area = categoryNamed(result, name);
      const neil = overwriteFor(channelNamed(area, "alliance-chat").overwrites, "Neil");
      expect(new Set(neil.allow)).toEqual(new Set(["ViewChannel", "SendMessages"]));
      expect(neil.deny).toEqual([]);
      expect(targetsOf(channelNamed(area, "alliance-voice").overwrites)).toEqual(["@everyone", name]);
    }
  });

  test("keeps EmbedLinks in the overwrite the layout gives Neil on alliance-chat, alongside View Channel and Send Messages", () => {
    const withEmbedLinks: ServerLayout = {
      ...layout,
      allianceArea: {
        channels: [
          {
            name: "alliance-chat",
            type: "text",
            description: "A test channel.",
            overwrites: { Neil: { allow: ["ViewChannel", "SendMessages", "EmbedLinks"], deny: [] } },
          },
          { name: "alliance-voice", type: "voice", description: "A test channel." },
        ],
      },
    };
    const area = categoryNamed(expandLayout(withEmbedLinks, HOME_KINGDOM, ["[ABC]"]), "[ABC]");

    const neil = overwriteFor(channelNamed(area, "alliance-chat").overwrites, "Neil");
    expect(new Set(neil.allow)).toEqual(new Set(["ViewChannel", "SendMessages", "EmbedLinks"]));
  });

  test("without a [TAG] role there is no Alliance area", () => {
    const result = expanded([]);
    expect(result.categories.map((category) => category.name).some((name) => name.startsWith("["))).toBe(false);
  });
});

describe("expandLayout: translated copies", () => {
  const POSTING_PERMISSIONS = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"];
  const withTranslations: ServerLayout = {
    ...layout,
    languages: ["English", "German", "French"],
    translations: ["German", "French"],
  };

  function hangoutNames(result: ExpandedLayout): string[] {
    return categoryNamed(result, "Hangout").channels.map((channel) => channel.name);
  }

  function viewersOf(overwrites: readonly WantedOverwrite[]): string[] {
    return overwrites
      .filter((overwrite) => overwrite.allow.includes("ViewChannel"))
      .map((overwrite) => overwrite.target)
      .sort();
  }

  test("a translated channel is followed by one copy per translation, in the same category", () => {
    const names = hangoutNames(expandLayout(withTranslations, HOME_KINGDOM, []));
    const at = names.indexOf("kvk-announcements");

    expect(at).toBeGreaterThan(-1);
    expect(names.slice(at, at + 3)).toEqual(["kvk-announcements", "kvk-announcements-german", "kvk-announcements-french"]);
  });

  test("a copy is seen by its Language role, King (who posts) and the Interaction Bot, not by the category's seenBy roles", () => {
    const copy = channelNamed(categoryNamed(expandLayout(withTranslations, HOME_KINGDOM, []), "Hangout"), "kvk-announcements-german");

    expect(overwriteFor(copy.overwrites, "@everyone").deny).toEqual(["ViewChannel"]);
    expect(new Set(viewersOf(copy.overwrites))).toEqual(new Set(["German", "King", "Interaction Bot"]));
  });

  test("a copy keeps the original's mode: its Language role may not post, and King may view and send", () => {
    const copy = channelNamed(categoryNamed(expandLayout(withTranslations, HOME_KINGDOM, []), "Hangout"), "kvk-announcements-french");

    expect(new Set(overwriteFor(copy.overwrites, "French").deny)).toEqual(new Set(POSTING_PERMISSIONS));
    expect(new Set(overwriteFor(copy.overwrites, "King").allow)).toEqual(new Set(["ViewChannel", "SendMessages"]));
  });

  test("the Interaction Bot may view and send in a copy", () => {
    const copy = channelNamed(categoryNamed(expandLayout(withTranslations, HOME_KINGDOM, []), "Hangout"), "kvk-announcements-german");

    expect(new Set(overwriteFor(copy.overwrites, "Interaction Bot").allow)).toEqual(new Set(["ViewChannel", "SendMessages"]));
  });

  test("a channel without translated gets no copies", () => {
    const names = hangoutNames(expandLayout(withTranslations, HOME_KINGDOM, []));

    expect(names.filter((name) => name.startsWith("general"))).toEqual(["general"]);
  });

  test("empty translations gives no copies", () => {
    const names = hangoutNames(expanded());

    expect(names.filter((name) => name.startsWith("kvk-announcements-"))).toEqual([]);
  });
});
