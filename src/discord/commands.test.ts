import { ApplicationCommandOptionType, ApplicationCommandType, InteractionContextType } from "discord.js";
import { describe, expect, test } from "vitest";
import { commands } from "./commands.js";

describe("commands", () => {
  test("hold /ping, open to anyone, guild only, without options", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "ping",
        description: "Check that Neil is online",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
      }),
    );
  });

  test("hold /player, open to anyone, guild only, with the name first, then the uid, then an optional integer kingdom from 1 to 9999; the name and uid are of at most 32 characters", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "player",
        description: "Look up a player by name or uid",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "name",
            required: false,
            max_length: 32,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "uid",
            description: "The player's uid (the number under the profile picture)",
            required: false,
            max_length: 32,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.Integer,
            name: "kingdom",
            required: false,
            min_value: 1,
            max_value: 9999,
          }),
        ],
      }),
    );
  });

  test("hold /alliance, open to anyone, guild only, with the full name first, then the alliance tag, then an optional integer kingdom from 1 to 9999; the name and tag are of at most 40 characters", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "alliance",
        description: "Look up an alliance in a kingdom",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "name",
            required: false,
            max_length: 40,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "tag",
            description: "The alliance tag, e.g. NML",
            required: false,
            max_length: 40,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.Integer,
            name: "kingdom",
            required: false,
            min_value: 1,
            max_value: 9999,
          }),
        ],
      }),
    );
  });

  test("hold /alliance with name and tag set to autocomplete from Known Alliances, and the kingdom not", () => {
    const options = commands.find((command) => command.name === "alliance")?.options;

    expect(options).toEqual([
      expect.objectContaining({ name: "name", type: ApplicationCommandOptionType.String, autocomplete: true }),
      expect.objectContaining({ name: "tag", type: ApplicationCommandOptionType.String, autocomplete: true }),
      expect.objectContaining({ name: "kingdom", type: ApplicationCommandOptionType.Integer }),
    ]);
    expect(options?.[2]).not.toHaveProperty("autocomplete", true);
  });

  test("hold /quota, hidden from Members (default member permissions '0', allowed per role in Integrations), guild only, without options", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "quota",
        description: "Show today's Daily Quota of Game API requests (Officers)",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: "0",
        contexts: [InteractionContextType.Guild],
      }),
    );
  });

  test("hold /interview, without options, described as starting your Onboarding Interview", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "interview",
        description: "Start your Onboarding Interview",
        type: ApplicationCommandType.ChatInput,
        options: [],
      }),
    );
  });

  test("hold /channels, open to every Member, guild only, without options, described as choosing the channels a Member sees", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "channels",
        description: "Choose which channels you see",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
      }),
    );
  });

  test("hold /usage, open to every Member, guild only, without options", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "usage",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
      }),
    );
  });

  test("hold /unlink, open to anyone, guild only, with one optional user option member; Neil checks who may Unlink whom", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "unlink",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.User,
            name: "member",
            required: false,
          }),
        ],
      }),
    );
  });

  test("hold /rank, hidden from Members, guild only, with a required user option member first, then a required rank from R1 to R5", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "rank",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: "0",
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.User,
            name: "member",
            required: true,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "rank",
            required: true,
            choices: [
              { name: "R1", value: "R1" },
              { name: "R2", value: "R2" },
              { name: "R3", value: "R3" },
              { name: "R4", value: "R4" },
              { name: "R5", value: "R5" },
            ],
          }),
        ],
      }),
    );
  });

  test("hold /link, hidden from Members, guild only, with a required user option member first, then a required uid of at most 32 characters, as /player has", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "link",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: "0",
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.User,
            name: "member",
            required: true,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "uid",
            required: true,
            max_length: 32,
          }),
        ],
      }),
    );
  });

  test("hold /reaper, open to anyone, guild only, with subcommands closest (x, y, all), list, add (name, reason, kingdom) and remove (exile, autocomplete)", () => {
    const subcommand = ApplicationCommandOptionType.Subcommand;
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "reaper",
        type: ApplicationCommandType.ChatInput,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: subcommand,
            name: "closest",
            options: [
              expect.objectContaining({ type: ApplicationCommandOptionType.Integer, name: "x", required: false }),
              expect.objectContaining({ type: ApplicationCommandOptionType.Integer, name: "y", required: false }),
              expect.objectContaining({ type: ApplicationCommandOptionType.Boolean, name: "all", required: false }),
            ],
          }),
          expect.objectContaining({ type: subcommand, name: "list" }),
          expect.objectContaining({
            type: subcommand,
            name: "add",
            options: [
              expect.objectContaining({
                type: ApplicationCommandOptionType.String,
                name: "name",
                required: true,
                max_length: 32,
              }),
              expect.objectContaining({
                type: ApplicationCommandOptionType.String,
                name: "reason",
                required: true,
                max_length: 200,
              }),
              expect.objectContaining({
                type: ApplicationCommandOptionType.Integer,
                name: "kingdom",
                required: false,
                min_value: 1,
                max_value: 9999,
              }),
            ],
          }),
          expect.objectContaining({
            type: subcommand,
            name: "remove",
            options: [
              expect.objectContaining({
                type: ApplicationCommandOptionType.String,
                name: "exile",
                required: true,
                autocomplete: true,
              }),
            ],
          }),
        ],
      }),
    );
    const reaper = commands.find((command) => command.name === "reaper");
    expect(reaper?.default_member_permissions ?? null).toBeNull();
  });

  test("hold /booty, open to every Member, guild only, without options, described as calling a Booty for the caller's Alliance", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "booty",
        description: "Call a Booty for your Alliance: a card alerts the Members whose Booty Alerts match",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
      }),
    );
  });

  test("hold /booty-alerts, open to every Member, guild only, with optional options mode (Off, Always, Only when online, Only when offline), from and to (HH:MM) and time-zone with autocomplete", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "booty-alerts",
        description: "Choose when a Booty Call alerts you: the mode, a daily window and your time zone",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "mode",
            required: false,
            choices: [
              { name: "Off", value: "off" },
              { name: "Always", value: "always" },
              { name: "Only when online", value: "online" },
              { name: "Only when offline", value: "offline" },
            ],
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "from",
            description: "Start of your daily window, HH:MM on the 24-hour clock, e.g. 08:00",
            required: false,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "to",
            description: "End of your daily window, HH:MM on the 24-hour clock, e.g. 23:00",
            required: false,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "time-zone",
            description: "Your time zone, e.g. Europe/Lisbon",
            required: false,
            autocomplete: true,
          }),
        ],
      }),
    );
  });

  test("hold /help, open to every Member, guild only, without options, described as showing the commands you can use and what they are for", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "help",
        description: "Show the commands you can use and what they are for",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
      }),
    );
  });

  test("hold no command other than /ping, /player, /alliance, /quota, /channels, /interview, /unlink, /rank, /link, /reaper, /usage, /help, /booty and /booty-alerts", () => {
    expect(commands.map((command) => command.name).sort()).toEqual([
      "alliance",
      "booty",
      "booty-alerts",
      "channels",
      "help",
      "interview",
      "link",
      "ping",
      "player",
      "quota",
      "rank",
      "reaper",
      "unlink",
      "usage",
    ]);
  });
});
