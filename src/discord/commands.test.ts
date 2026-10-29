import { ApplicationCommandType, InteractionContextType } from "discord.js";
import { describe, expect, test } from "vitest";
import { commands } from "./commands.js";

describe("commands", () => {
  test("hold exactly /ping, open to anyone, guild only, without options", () => {
    expect(commands).toEqual([
      expect.objectContaining({
        name: "ping",
        description: "Check that Neil is online",
        type: ApplicationCommandType.ChatInput,
        options: [],
        default_member_permissions: undefined,
        contexts: [InteractionContextType.Guild],
      }),
    ]);
  });
});
