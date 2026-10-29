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

  test("hold /player, open to anyone, guild only, with a required uid of at most 32 characters", () => {
    expect(commands).toContainEqual(
      expect.objectContaining({
        name: "player",
        description: "Look up a player by uid",
        type: ApplicationCommandType.ChatInput,
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
        options: [
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "uid",
            description: "The player's uid (the number under the profile picture)",
            required: true,
            max_length: 32,
          }),
        ],
      }),
    );
  });

  test("hold /alliance, open to anyone, guild only, with a required integer kingdom from 1 to 9999 and a required alliance of at most 40 characters", () => {
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
            description: "The kingdom number",
            required: true,
            min_value: 1,
            max_value: 9999,
          }),
          expect.objectContaining({
            type: ApplicationCommandOptionType.String,
            name: "alliance",
            description: "The alliance tag, e.g. NML",
            required: true,
            max_length: 40,
          }),
        ],
      }),
    );
  });

  test("hold no command other than /ping, /player and /alliance", () => {
    expect(commands.map((command) => command.name).sort()).toEqual(["alliance", "ping", "player"]);
  });
});
