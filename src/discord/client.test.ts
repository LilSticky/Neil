import { Events, GatewayIntentBits, IntentsBitField } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { createClient } from "./client.js";

function chatInput(commandName: string) {
  return { isChatInputCommand: () => true, commandName };
}

/** One handler per slash command, each recording its calls. */
function handlers() {
  return {
    ping: vi.fn(() => Promise.resolve()),
    player: vi.fn(() => Promise.resolve()),
    alliance: vi.fn(() => Promise.resolve()),
  };
}

describe("createClient", () => {
  test("requests the Guilds intent only", () => {
    const client = createClient(handlers());

    expect(new IntentsBitField(client.options.intents).toArray()).toEqual(["Guilds"]);
    expect(client.options.intents.bitfield).toBe(GatewayIntentBits.Guilds);
  });

  test("logs client errors instead of crashing", () => {
    const logged: string[] = [];
    const client = createClient(handlers(), (message) => logged.push(message));

    client.emit(Events.Error, new Error("socket hang up"));

    expect(logged).toEqual(["Discord client error: socket hang up"]);
  });

  test("hands /ping to the ping handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed);
    const interaction = chatInput("ping");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.ping).toHaveBeenCalledWith(interaction);
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("hands /player to the player handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed);
    const interaction = chatInput("player");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.player).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
  });

  test("hands /alliance to the alliance handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed);
    const interaction = chatInput("alliance");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.alliance).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });

  test("ignores other commands and other interaction kinds", () => {
    const routed = handlers();
    const client = createClient(routed);

    client.emit(Events.InteractionCreate, chatInput("other") as never);
    client.emit(Events.InteractionCreate, { isChatInputCommand: () => false } as never);

    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
  });
});
