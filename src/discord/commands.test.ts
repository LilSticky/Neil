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

  test("hold /player, open to anyone, guild only, with optional uid and name of at most 32 characters and an optional integer kingdom from 1 to 9999", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "player",
        description: "Look up a player by uid or name",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "uid",
            description: "The player's uid (the number under the profile picture)",
            required: false,
            max_length: 32,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "name",
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

  test("hold /alliance, open to anyone, guild only, with optional kingdom (integer 1 to 9999), alliance tag and full name (each of at most 40 characters)", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "alliance",
        description: "Look up an alliance in a kingdom",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.Integer,
            name: "kingdom",
            required: false,
            min_value: 1,
            max_value: 9999,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "alliance",
            description: "The alliance tag, e.g. NML",
            required: false,
            max_length: 40,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "name",
            required: false,
            max_length: 40,
          }),
        ],
      }),
    );
  });

  test("hold /quota, guild only, without options and without default member permissions (Officers are checked by Neil)", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "quota",
        description: "Show today's Daily Quota of Game API requests (Officers)",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: undefined,
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

  test("hold no command other than /ping, /player, /alliance, /quota and /interview", () => {
    expect(commands.map((command) => command.name).sort()).toEqual(["alliance", "interview", "ping", "player", "quota"]);
  });
});
