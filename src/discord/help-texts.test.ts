import { SlashCommandBuilder, type APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
import { commands } from "./commands.js";
import { EMBED_DESCRIPTION_LIMIT, helpPages, MESSAGE_CHARACTER_LIMIT, MESSAGE_EMBED_LIMIT } from "./help-texts.js";

type Pages = readonly (readonly APIEmbed[])[];

/** Every embed of every page, in order. */
function embedsOf(pages: Pages): APIEmbed[] {
  return pages.flat();
}

/** The descriptions of every embed of every page, joined line by line; an embed without one adds an empty line. */
function textOf(pages: Pages): string {
  return embedsOf(pages)
    .map((embed) => embed.description ?? "")
    .join("\n");
}

/** The text of the embeds without a title: the Member commands. */
function memberTextOf(pages: Pages): string {
  return textOf([embedsOf(pages).filter((embed) => embed.title === undefined)]);
}

/** The text of the embeds titled "Officer commands". */
function officerTextOf(pages: Pages): string {
  return textOf([embedsOf(pages).filter((embed) => embed.title === "Officer commands")]);
}

/** Checks every embed and every page against Discord's limits. */
function expectWithinLimits(pages: Pages): void {
  for (const page of pages) {
    expect(page.length).toBeGreaterThan(0);
    expect(page.length).toBeLessThanOrEqual(MESSAGE_EMBED_LIMIT);
    const characters = page.reduce(
      (sum, embed) => sum + (embed.title?.length ?? 0) + (embed.description?.length ?? 0),
      0,
    );
    expect(characters).toBeLessThanOrEqual(MESSAGE_CHARACTER_LIMIT);
    for (const embed of page) {
      expect(embed.description?.length ?? 0).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
    }
  }
}

/** Command definitions as the bot registers them, with a few Member commands and a few Officer commands. */
const fixture = [
  new SlashCommandBuilder().setName("ping").setDescription("Check that Neil is online").toJSON(),
  new SlashCommandBuilder()
    .setName("player")
    .setDescription("Look up a player by name or uid")
    .addStringOption((option) => option.setName("name").setDescription("The player's name").setRequired(false))
    .addStringOption((option) => option.setName("uid").setDescription("The player's uid").setRequired(false))
    .addIntegerOption((option) => option.setName("kingdom").setDescription("The kingdom").setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName("reaper")
    .setDescription("REAPER: find the closest Exiles, or keep the list (NaP Council)")
    .addSubcommand((sub) =>
      sub
        .setName("closest")
        .setDescription("The 3 closest Exiles to your Linked Player, or to x and y")
        .addIntegerOption((option) => option.setName("x").setDescription("x").setRequired(false))
        .addIntegerOption((option) => option.setName("y").setDescription("y").setRequired(false))
        .addBooleanOption((option) => option.setName("all").setDescription("Every Exile").setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Every Exile on REAPER, newest first"))
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a Player to REAPER (NaP Council)")
        .addStringOption((option) => option.setName("name").setDescription("The name").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("The reason").setRequired(true))
        .addIntegerOption((option) => option.setName("kingdom").setDescription("The kingdom").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an Exile from REAPER (NaP Council)")
        .addStringOption((option) => option.setName("exile").setDescription("The Exile").setRequired(true)),
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("quota")
    .setDescription("Show today's Daily Quota of Game API requests (Officers)")
    .setDefaultMemberPermissions(0n)
    .toJSON(),
  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Give a Linked Member their Alliance Rank (Officers)")
    .setDefaultMemberPermissions(0n)
    .addUserOption((option) => option.setName("member").setDescription("The Linked Member").setRequired(true))
    .addStringOption((option) => option.setName("rank").setDescription("R1 to R5").setRequired(true))
    .toJSON(),
];

/** The Member lines of the fixture: no Officer command. */
const MEMBER_TEXT = [
  "`/ping` — Check that Neil is online",
  "`/player [name] [uid] [kingdom]` — Look up a player by name or uid",
  "`/reaper closest [x] [y] [all]` — The 3 closest Exiles to your Linked Player, or to x and y",
  "`/reaper list` — Every Exile on REAPER, newest first",
  "`/reaper add <name> <reason> [kingdom]` — Add a Player to REAPER (NaP Council)",
  "`/reaper remove <exile>` — Remove an Exile from REAPER (NaP Council)",
].join("\n");

describe("helpPages for a Member", () => {
  test("gives one line per command the caller can use, its usage and its purpose, in the order of the command definitions", () => {
    const pages = helpPages(fixture, { officer: false });

    expect(textOf(pages)).toBe(MEMBER_TEXT);
  });

  test("leaves out every Officer command", () => {
    const text = textOf(helpPages(fixture, { officer: false }));

    expect(text).not.toContain("`/quota`");
    expect(text).not.toContain("`/rank`");
  });

  test("leaves out /quota, /rank and /link of the real command definitions", () => {
    const text = textOf(helpPages(commands, { officer: false }));

    expect(text).not.toContain("`/quota`");
    expect(text).not.toContain("`/rank`");
    expect(text).not.toContain("`/link`");
  });

  test("lists /help itself among the real command definitions", () => {
    const text = textOf(helpPages(commands, { officer: false }));

    expect(text).toContain("`/help` — Show the commands you can use and what they are for");
  });

  test("keeps the real Member answer within Discord's embed and message limits, with no titled embed", () => {
    const pages = helpPages(commands, { officer: false });

    expectWithinLimits(pages);
    expect(embedsOf(pages).every((embed) => embed.title === undefined)).toBe(true);
  });
});

describe("helpPages for an Officer", () => {
  test("gives the Member list first, then an embed titled 'Officer commands' that holds the Officer commands", () => {
    const embeds = embedsOf(helpPages(fixture, { officer: true }));

    expect(embeds).toEqual([
      { description: MEMBER_TEXT },
      {
        title: "Officer commands",
        description: [
          "`/quota` — Show today's Daily Quota of Game API requests (Officers)",
          "`/rank <member> <rank>` — Give a Linked Member their Alliance Rank (Officers)",
        ].join("\n"),
      },
    ]);
  });

  test("gives the Officer commands in the order of the command definitions", () => {
    const text = textOf(helpPages(fixture, { officer: true }));

    expect(text.indexOf("`/quota`")).toBeLessThan(text.indexOf("`/rank "));
  });

  test("lists /quota, /rank and /link in the Officer embeds and /help in the Member embeds of the real command definitions", () => {
    const pages = helpPages(commands, { officer: true });

    expect(officerTextOf(pages)).toContain("`/quota`");
    expect(officerTextOf(pages)).toContain("`/rank <member> <rank>`");
    expect(officerTextOf(pages)).toContain("`/link <member> <uid>`");
    expect(memberTextOf(pages)).toContain("`/help`");
    expect(memberTextOf(pages)).not.toContain("`/quota`");
  });

  test("puts every Member embed before the first Officer embed", () => {
    const embeds = embedsOf(helpPages(commands, { officer: true }));
    const firstOfficer = embeds.findIndex((embed) => embed.title === "Officer commands");

    expect(firstOfficer).toBeGreaterThan(0);
    expect(embeds.slice(firstOfficer).every((embed) => embed.title === "Officer commands")).toBe(true);
  });

  test("keeps the answer for the real command definitions within Discord's embed and message limits", () => {
    expectWithinLimits(helpPages(commands, { officer: true }));
  });

  test("no longer writes a bold Officer heading into a description", () => {
    expect(textOf(helpPages(commands, { officer: true }))).not.toContain("**Officer commands**");
  });
});

describe("helpPages usage syntax", () => {
  test("shows a required option as <name> and an optional one as [name], in the order of the options", () => {
    const text = textOf(helpPages(fixture, { officer: false }));

    expect(text).toContain("`/player [name] [uid] [kingdom]`");
    expect(text).toContain("`/reaper add <name> <reason> [kingdom]`");
  });

  test("gives each subcommand its own line, and no line for the command that holds them", () => {
    const lines = textOf(helpPages(fixture, { officer: false })).split("\n");

    expect(lines.filter((line) => line.startsWith("`/reaper "))).toHaveLength(4);
    expect(lines).not.toContain("`/reaper` — REAPER: find the closest Exiles, or keep the list (NaP Council)");
  });
});

describe("helpPages with a command added later", () => {
  test("lists a new command with its usage and purpose, and changes nothing else", () => {
    const gift = new SlashCommandBuilder()
      .setName("gift")
      .setDescription("Send a gift to a Member")
      .addUserOption((option) => option.setName("member").setDescription("The Member").setRequired(true))
      .toJSON();

    const text = textOf(helpPages([...fixture, gift], { officer: false }));

    expect(text).toBe(`${MEMBER_TEXT}\n\`/gift <member>\` — Send a gift to a Member`);
  });
});

describe("helpPages for /raid-plan", () => {
  test("lists /raid-plan among the Member commands, each usage naming the War Council", () => {
    const lines = textOf(helpPages(commands, { officer: false })).split("\n");
    const raidLines = lines.filter((line) => line.startsWith("`/raid-plan "));

    expect(raidLines).toHaveLength(10);
    expect(raidLines).toContain("`/raid-plan show` — See this week's Battle Plan, privately (War Council)");
    expect(raidLines).toContain(
      "`/raid-plan assign <alliance> <objective> [phase] [task]` — Assign an Alliance to an Objective, for a Phase or the whole Raid (War Council)",
    );
    for (const line of raidLines) expect(line).toContain("War Council");
  });
});

describe("helpPages with an empty list", () => {
  test("still gives one page with one embed", () => {
    const pages = helpPages([], { officer: false });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
  });
});

/** A long, made-up command: Member or Officer, with or without subcommands. */
function syntheticCommand(index: number, { officerOnly }: { readonly officerOnly: boolean }) {
  const builder = new SlashCommandBuilder()
    .setName(`command-${String(index)}`)
    .setDescription(`Command ${String(index)} `.padEnd(100, "x"));
  if (officerOnly) builder.setDefaultMemberPermissions(0n);
  if (index % 3 === 0) {
    for (let sub = 0; sub < 5; sub += 1) {
      builder.addSubcommand((subcommand) =>
        subcommand
          .setName(`sub-${String(sub)}`)
          .setDescription(`Subcommand ${String(sub)} of ${String(index)} `.padEnd(100, "y"))
          .addStringOption((option) => option.setName("name").setDescription("The name").setRequired(true))
          .addIntegerOption((option) => option.setName("kingdom").setDescription("The kingdom").setRequired(false)),
      );
    }
  } else {
    builder.addStringOption((option) => option.setName("value").setDescription("A value").setRequired(false));
  }
  return builder.toJSON();
}

/** The lines of a synthetic command, as /help shows them. */
function syntheticLines(index: number): string[] {
  if (index % 3 === 0) {
    return [0, 1, 2, 3, 4].map(
      (sub) =>
        `\`/command-${String(index)} sub-${String(sub)} <name> [kingdom]\` — ${`Subcommand ${String(sub)} of ${String(index)} `.padEnd(100, "y")}`,
    );
  }
  return [`\`/command-${String(index)} [value]\` — ${`Command ${String(index)} `.padEnd(100, "x")}`];
}

describe("helpPages with a large list of commands", () => {
  const memberIndexes = Array.from({ length: 150 }, (_, index) => index);
  const officerIndexes = Array.from({ length: 40 }, (_, index) => 1000 + index);
  const large = [
    ...memberIndexes.map((index) => syntheticCommand(index, { officerOnly: false })),
    ...officerIndexes.map((index) => syntheticCommand(index, { officerOnly: true })),
  ];

  test("gives several pages, each within Discord's limits", () => {
    const pages = helpPages(large, { officer: true });

    expect(pages.length).toBeGreaterThan(1);
    expectWithinLimits(pages);
  });

  test("shows every line once and in the order of the definitions, Member lines first", () => {
    const pages = helpPages(large, { officer: true });

    expect(memberTextOf(pages)).toBe(memberIndexes.flatMap(syntheticLines).join("\n"));
    expect(officerTextOf(pages)).toBe(officerIndexes.flatMap(syntheticLines).join("\n"));
    const embeds = embedsOf(pages);
    const firstOfficer = embeds.findIndex((embed) => embed.title === "Officer commands");
    expect(embeds.slice(0, firstOfficer).every((embed) => embed.title === undefined)).toBe(true);
    expect(embeds.slice(firstOfficer).every((embed) => embed.title === "Officer commands")).toBe(true);
  });

  test("keeps every command's lines in one embed", () => {
    const embeds = embedsOf(helpPages(large, { officer: true }));

    for (const index of [...memberIndexes, ...officerIndexes]) {
      const holding = embeds.filter((embed) => (embed.description ?? "").includes(`\`/command-${String(index)} `));
      expect(holding).toHaveLength(1);
    }
  });

  test("shows a Member no Officer command, however long the list", () => {
    const pages = helpPages(large, { officer: false });

    expectWithinLimits(pages);
    expect(officerTextOf(pages)).toBe("");
    expect(textOf(pages)).not.toContain("`/command-1000 ");
  });

  test("splits a command by lines only when it does not fit into an empty embed on its own", () => {
    const huge = new SlashCommandBuilder().setName("huge").setDescription("Huge");
    for (let sub = 0; sub < 25; sub += 1) {
      huge.addSubcommand((subcommand) => {
        subcommand.setName(`sub-${String(sub)}`).setDescription(`Subcommand ${String(sub)} `.padEnd(100, "z"));
        for (let option = 0; option < 25; option += 1) {
          subcommand.addStringOption((o) =>
            o
              .setName(`option-${String(option)}`)
              .setDescription("An option")
              .setRequired(true),
          );
        }
        return subcommand;
      });
    }
    const definitions = [
      syntheticCommand(1, { officerOnly: false }),
      huge.toJSON(),
      syntheticCommand(2, { officerOnly: false }),
    ];

    const pages = helpPages(definitions, { officer: false });

    expectWithinLimits(pages);
    const lines = textOf(pages).split("\n");
    expect(lines).toHaveLength(27);
    expect(lines.filter((line) => line.startsWith("`/huge "))).toHaveLength(25);
    expect(embedsOf(pages).length).toBeGreaterThan(1);
  });
});
