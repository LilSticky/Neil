import { Events, GatewayIntentBits, IntentsBitField } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { createClient } from "./client.js";

function chatInput(commandName: string) {
  return { isChatInputCommand: () => true, commandName };
}

describe("createClient", () => {
  test("requests the Guilds intent only", () => {
    const client = createClient(vi.fn());

    expect(new IntentsBitField(client.options.intents).toArray()).toEqual(["Guilds"]);
    expect(client.options.intents.bitfield).toBe(GatewayIntentBits.Guilds);
  });

  test("hands /ping to the ping handler", () => {
    const onPing = vi.fn(() => Promise.resolve());
    const client = createClient(onPing);
    const interaction = chatInput("ping");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(onPing).toHaveBeenCalledWith(interaction);
  });

  test("ignores other commands and other interaction kinds", () => {
    const onPing = vi.fn(() => Promise.resolve());
    const client = createClient(onPing);

    client.emit(Events.InteractionCreate, chatInput("other") as never);
    client.emit(Events.InteractionCreate, { isChatInputCommand: () => false } as never);

    expect(onPing).not.toHaveBeenCalled();
  });
});
