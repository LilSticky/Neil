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
 *   interface ExpandedChannel {
 *     name: string; type: ChannelType; overwrites: WantedOverwrite[];
 *     topic: string | undefined; // the description; undefined for voice (slice 029)
 *     message: string | undefined; // the description message; undefined for forums (slice 029)
 *   }
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
  type LayoutChannel,
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

  test("a seenBy role is allowed View Channel on the category", () => {
    const hangout = categoryNamed(expanded(), "Hangout");
    expect(overwriteFor(hangout.overwrites, KINGDOM_ROLE).allow).toEqual(["ViewChannel"]);
  });

  test("a seenBy role is allowed to view, read the history of and post in a text channel, whatever @everyone holds", () => {
    const general = channelNamed(categoryNamed(expanded(), "Hangout"), "general");
    expect(new Set(overwriteFor(general.overwrites, KINGDOM_ROLE).allow)).toEqual(
      new Set(["ViewChannel", "ReadMessageHistory", "SendMessages"]),
    );
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
  test("read-only denies posting and threads to each seenBy role, which still views and reads the history", () => {
    const pvpTalk = channelNamed(categoryNamed(expanded(), "Hangout"), "pvp-talk");
    const posting = new Set(["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"]);
    expect(new Set(overwriteFor(pvpTalk.overwrites, "R5").deny)).toEqual(posting);
    expect(new Set(overwriteFor(pvpTalk.overwrites, "PvP").deny)).toEqual(posting);
    expect(new Set(overwriteFor(pvpTalk.overwrites, "R5").allow)).toEqual(new Set(["ViewChannel", "ReadMessageHistory"]));
  });

  test("only-king-posts denies posting and threads to each seenBy role", () => {
    const announcements = channelNamed(categoryNamed(expanded(), "Hangout"), "kvk-announcements");
    expect(new Set(overwriteFor(announcements.overwrites, KINGDOM_ROLE).deny)).toEqual(
      new Set(["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"]),
    );
  });

  test("only-king-posts lets King view, send and read the history", () => {
    const announcements = channelNamed(categoryNamed(expanded(), "Hangout"), "kvk-announcements");
    const king = overwriteFor(announcements.overwrites, "King");
    expect(new Set(king.allow)).toEqual(new Set(["ViewChannel", "SendMessages", "ReadMessageHistory"]));
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
    expect(new Set(overwriteFor(closed.overwrites, "R5").allow)).toEqual(new Set(["ViewChannel", "ReadMessageHistory", "SendMessages"]));
    expect(new Set(overwriteFor(closed.overwrites, "King").allow)).toEqual(new Set(["ViewChannel", "ReadMessageHistory", "SendMessages"]));
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
    expect(new Set(kingdom.allow)).toEqual(new Set(["ViewChannel", "ReadMessageHistory", "SendMessages"]));
    expect(new Set(kingdom.deny)).toEqual(new Set(["SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"]));
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
    expect(new Set(overwriteFor(english.overwrites, "English").allow)).toEqual(new Set(["ViewChannel", "ReadMessageHistory", "SendMessages"]));
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
    expect(new Set(overwriteFor(copy.overwrites, "King").allow)).toEqual(new Set(["ViewChannel", "SendMessages", "ReadMessageHistory"]));
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

describe("expandLayout: topic and description message", () => {
  function hangoutWith(channels: LayoutChannel[]): ServerLayout {
    const hangout: LayoutCategory = { name: "Hangout", seenBy: ["#<Home Kingdom>"], channels };
    return { ...layout, categories: [hangout] };
  }

  function hangoutChannel(channels: LayoutChannel[], name: string): ExpandedChannel {
    return channelNamed(categoryNamed(expandLayout(hangoutWith(channels), HOME_KINGDOM, []), "Hangout"), name);
  }

  function postersOf(message: string | undefined): string[] {
    const line = message?.split("\n").find((candidate) => candidate.startsWith("✍️ Posts: "));
    if (line === undefined) throw new Error("no Posts line in the description message");
    return line.slice("✍️ Posts: ".length).split(", ");
  }

  describe("topic", () => {
    test("a text channel's topic is its description", () => {
      const general = channelNamed(categoryNamed(expanded(), "Hangout"), "general");
      expect(general.topic).toBe("A test channel.");
    });

    test("an announcement channel's topic is its description", () => {
      const announcements = channelNamed(categoryNamed(expanded(), "Hangout"), "kvk-announcements");
      expect(announcements.topic).toBe("A test channel.");
    });

    test("a forum's topic is its description", () => {
      const forum = hangoutChannel([{ name: "forum", type: "forum", description: "A forum." }], "forum");
      expect(forum.topic).toBe("A forum.");
    });

    test("a voice channel has no topic", () => {
      const voice = channelNamed(categoryNamed(expanded(["[NML]"]), "[NML]"), "alliance-voice");
      expect(voice.topic).toBeUndefined();
    });

    test("a language chat's topic is Chat in <Language>.", () => {
      const english = channelNamed(categoryNamed(expanded(), "Languages"), "english-chat");
      expect(english.topic).toBe("Chat in English.");
    });
  });

  describe("message", () => {
    test("a text channel's message names it, gives its description, who sees it and who posts", () => {
      const general = channelNamed(categoryNamed(expanded(), "Hangout"), "general");
      expect(general.message).toBe("📌 **#general**\nA test channel.\n\n👀 Seen by: #330\n✍️ Posts: #330");
    });

    test("a read-only channel says that nobody posts", () => {
      const rules = channelNamed(categoryNamed(expanded(), "Hangout"), "rules");
      expect(rules.message).toBe("📌 **#rules**\nA test channel.\n\n👀 Seen by: #330\n✍️ Posts: read only");
    });

    test("a channel seen by some roles lists them in overwrite order, as both seers and posters", () => {
      const closed = channelNamed(categoryNamed(expanded(), "Hangout"), "closed");
      expect(closed.message).toBe("📌 **#closed**\nA test channel.\n\n👀 Seen by: R5, King\n✍️ Posts: R5, King");
    });

    test("an only-king-posts announcement is posted by King alone", () => {
      const event = hangoutChannel(
        [{ name: "event-announcements", type: "announcement", description: "A test channel.", mode: "only-king-posts" }],
        "event-announcements",
      );
      expect(event.message).toBe("📌 **#event-announcements**\nA test channel.\n\n👀 Seen by: #330, King\n✍️ Posts: King");
    });

    test("a channel whose overwrites let other roles send messages lists them among the posters", () => {
      const giftCodes = hangoutChannel(
        [
          {
            name: "gift-codes",
            type: "text",
            description: "A test channel.",
            mode: "only-king-posts",
            overwrites: { R4: { allow: ["SendMessages"], deny: [] }, R5: { allow: ["SendMessages"], deny: [] } },
          },
        ],
        "gift-codes",
      );
      expect(new Set(postersOf(giftCodes.message))).toEqual(new Set(["King", "R4", "R5"]));
    });

    test("Neil is left out of Seen by", () => {
      const onboarding = channelNamed(categoryNamed(expanded(), "Hangout"), "onboarding");
      expect(onboarding.message).toBe("📌 **#onboarding**\nA test channel.\n\n👀 Seen by: #330\n✍️ Posts: #330");
    });

    test("an Alliance area names its [TAG] role in Seen by and Posts", () => {
      const chat = channelNamed(categoryNamed(expanded(["[NML]"]), "[NML]"), "alliance-chat");
      expect(chat.message).toBe("📌 **#alliance-chat**\nA test channel.\n\n👀 Seen by: [NML]\n✍️ Posts: [NML]");
    });

    test("a voice channel's message has no Posts line", () => {
      const voice = channelNamed(categoryNamed(expanded(["[NML]"]), "[NML]"), "alliance-voice");
      expect(voice.message).toBe("📌 **#alliance-voice**\nA test channel.\n\n👀 Seen by: [NML]");
    });

    test("a language chat is seen and posted by its own language", () => {
      const english = channelNamed(categoryNamed(expanded(), "Languages"), "english-chat");
      expect(english.message).toBe("📌 **#english-chat**\nChat in English.\n\n👀 Seen by: English\n✍️ Posts: English");
    });

    test("a forum has no message", () => {
      const forum = hangoutChannel([{ name: "forum", type: "forum", description: "A forum." }], "forum");
      expect(forum.message).toBeUndefined();
    });
  });

  describe("translated copies", () => {
    const withTranslations: ServerLayout = {
      ...layout,
      languages: ["English", "German"],
      translations: ["German"],
    };

    function germanCopy(): ExpandedChannel {
      return channelNamed(categoryNamed(expandLayout(withTranslations, HOME_KINGDOM, []), "Hangout"), "kvk-announcements-german");
    }

    test("a copy's topic is the original's description followed by the translation credit", () => {
      expect(germanCopy().topic).toBe("A test channel. Translated into German by Interaction Bot.");
    });

    test("a copy's message leaves the Interaction Bot out of Seen by but counts it among the posters", () => {
      expect(germanCopy().message).toBe(
        "📌 **#kvk-announcements-german**\nA test channel. Translated into German by Interaction Bot.\n\n👀 Seen by: German, King\n✍️ Posts: King, Interaction Bot",
      );
    });
  });

  describe("code of conduct in the message", () => {
    test("a channel with a code of conduct appends its lines after a blank line, joined by line breaks", () => {
      const general = hangoutChannel(
        [{ name: "general", type: "text", description: "A test channel.", codeOfConduct: ["line 1", "", "line 2"] }],
        "general",
      );
      expect(general.message).toBe("📌 **#general**\nA test channel.\n\n👀 Seen by: #330\n✍️ Posts: #330\n\nline 1\n\nline 2");
    });
  });
});

describe("expandLayout: what a seer may do, by channel type", () => {
  const typed: ServerLayout = {
    ...layout,
    categories: [
      {
        name: "Typed",
        seenBy: ["PvP"],
        channels: [
          { name: "Typed voice", type: "voice", description: "A test channel." },
          { name: "typed-forum", type: "forum", description: "A test channel." },
          { name: "read-forum", type: "forum", description: "A test channel.", mode: "read-only", overwrites: { R5: { allow: ["SendMessages", "SendMessagesInThreads"], deny: [] } } },
        ],
      },
    ],
  };
  const typedChannel = (name: string): ExpandedChannel => channelNamed(categoryNamed(expandLayout(typed, HOME_KINGDOM, []), "Typed"), name);

  test("a voice channel lets its seers view, connect and speak, whatever @everyone holds", () => {
    expect(new Set(overwriteFor(typedChannel("Typed voice").overwrites, "PvP").allow)).toEqual(new Set(["ViewChannel", "Connect", "Speak"]));
  });

  test("a forum lets its seers view, read, create posts and reply in them", () => {
    expect(new Set(overwriteFor(typedChannel("typed-forum").overwrites, "PvP").allow)).toEqual(
      new Set(["ViewChannel", "ReadMessageHistory", "SendMessages", "SendMessagesInThreads"]),
    );
  });

  test("a read-only forum lets its seers read only, and its own overwrite lets a role post", () => {
    const forum = typedChannel("read-forum");
    expect(new Set(overwriteFor(forum.overwrites, "PvP").allow)).toEqual(new Set(["ViewChannel", "ReadMessageHistory"]));
    expect(overwriteFor(forum.overwrites, "PvP").deny).toEqual(expect.arrayContaining(["SendMessages", "SendMessagesInThreads"]));
    expect(overwriteFor(forum.overwrites, "R5").allow).toEqual(expect.arrayContaining(["SendMessages", "SendMessagesInThreads"]));
  });
});
