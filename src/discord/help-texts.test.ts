import { SlashCommandBuilder, type APIEmbed } from "discord.js";
import { describe, expect, test } from "vitest";
import { commands } from "./commands.js";
import { helpReply } from "./help-texts.js";

/** Discord's limit for an embed description. */
const EMBED_DESCRIPTION_LIMIT = 4096;

/** The description of a reply embed; a reply without one fails the assertions that read it. */
function textOf(embed: APIEmbed): string {
  return embed.description ?? "";
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
    .setDescription("REAPER: find the closest Exiles, or keep the list (Home Kingdom R5s)")
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
        .setDescription("Add a Player to REAPER (Home Kingdom R5s)")
        .addStringOption((option) => option.setName("name").setDescription("The name").setRequired(true))
        .addStringOption((option) => option.setName("reason").setDescription("The reason").setRequired(true))
        .addIntegerOption((option) => option.setName("kingdom").setDescription("The kingdom").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an Exile from REAPER (Home Kingdom R5s)")
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
  "`/reaper add <name> <reason> [kingdom]` — Add a Player to REAPER (Home Kingdom R5s)",
  "`/reaper remove <exile>` — Remove an Exile from REAPER (Home Kingdom R5s)",
].join("\n");

describe("helpReply for a Member", () => {
  test("gives one line per command the caller can use, its usage and its purpose, in the order of the command definitions", () => {
    const embed = helpReply(fixture, { officer: false });

    expect(textOf(embed)).toBe(MEMBER_TEXT);
  });

  test("leaves out every Officer command", () => {
    const text = textOf(helpReply(fixture, { officer: false }));

    expect(text).not.toContain("`/quota`");
    expect(text).not.toContain("`/rank`");
  });

  test("leaves out /quota, /rank and /link of the real command definitions", () => {
    const text = textOf(helpReply(commands, { officer: false }));

    expect(text).not.toContain("`/quota`");
    expect(text).not.toContain("`/rank`");
    expect(text).not.toContain("`/link`");
  });

  test("lists /help itself among the real command definitions", () => {
    const text = textOf(helpReply(commands, { officer: false }));

    expect(text).toContain("`/help` — Show the commands you can use and what they are for");
  });

  test("keeps the real Member answer within the embed description limit", () => {
    const text = textOf(helpReply(commands, { officer: false }));

    expect(text.length).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
  });
});

describe("helpReply for an Officer", () => {
  test("gives the Member list first, then an Officer section that holds the Officer commands", () => {
    const text = textOf(helpReply(fixture, { officer: true }));

    expect(text.startsWith(MEMBER_TEXT)).toBe(true);
    const rest = text.slice(MEMBER_TEXT.length);
    expect(rest).toMatch(/Officer/);
    expect(rest).toContain("`/quota` — Show today's Daily Quota of Game API requests (Officers)");
    expect(rest).toContain("`/rank <member> <rank>` — Give a Linked Member their Alliance Rank (Officers)");
  });

  test("gives the Officer commands in the order of the command definitions", () => {
    const text = textOf(helpReply(fixture, { officer: true }));

    expect(text.indexOf("`/quota`")).toBeLessThan(text.indexOf("`/rank "));
  });

  test("lists /quota, /rank, /link and /help among the real command definitions", () => {
    const text = textOf(helpReply(commands, { officer: true }));

    expect(text).toContain("`/quota`");
    expect(text).toContain("`/rank <member> <rank>`");
    expect(text).toContain("`/link <member> <uid>`");
    expect(text).toContain("`/help`");
  });

  test("keeps the answer for the real command definitions within the embed description limit", () => {
    const text = textOf(helpReply(commands, { officer: true }));

    expect(text.length).toBeLessThanOrEqual(EMBED_DESCRIPTION_LIMIT);
  });
});

describe("helpReply usage syntax", () => {
  test("shows a required option as <name> and an optional one as [name], in the order of the options", () => {
    const text = textOf(helpReply(fixture, { officer: false }));

    expect(text).toContain("`/player [name] [uid] [kingdom]`");
    expect(text).toContain("`/reaper add <name> <reason> [kingdom]`");
  });

  test("gives each subcommand its own line, and no line for the command that holds them", () => {
    const lines = textOf(helpReply(fixture, { officer: false })).split("\n");

    expect(lines.filter((line) => line.startsWith("`/reaper "))).toHaveLength(4);
    expect(lines).not.toContain("`/reaper` — REAPER: find the closest Exiles, or keep the list (Home Kingdom R5s)");
  });
});

describe("helpReply with a command added later", () => {
  test("lists a new command with its usage and purpose, and changes nothing else", () => {
    const gift = new SlashCommandBuilder()
      .setName("gift")
      .setDescription("Send a gift to a Member")
      .addUserOption((option) => option.setName("member").setDescription("The Member").setRequired(true))
      .toJSON();

    const text = textOf(helpReply([...fixture, gift], { officer: false }));

    expect(text).toBe(`${MEMBER_TEXT}\n\`/gift <member>\` — Send a gift to a Member`);
  });
});
