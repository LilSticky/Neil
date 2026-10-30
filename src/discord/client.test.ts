import { Events, GatewayIntentBits, IntentsBitField } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { createClient, memberRoleIds } from "./client.js";

function chatInput(commandName: string) {
  return { isChatInputCommand: () => true, commandName };
}

/** A select menu or button interaction; the pick list custom id decides where it goes. */
function component(kind: "select" | "button", customId: string) {
  return {
    isChatInputCommand: () => false,
    isStringSelectMenu: () => kind === "select",
    isButton: () => kind === "button",
    customId,
  };
}

/** One handler per slash command and per pick list interaction, each recording its calls. */
function handlers() {
  return {
    ping: vi.fn(() => Promise.resolve()),
    player: vi.fn(() => Promise.resolve()),
    alliance: vi.fn(() => Promise.resolve()),
    quota: vi.fn(() => Promise.resolve()),
    pick: vi.fn(() => Promise.resolve()),
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

  test("hands /quota to the quota handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed);
    const interaction = chatInput("quota");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.quota).toHaveBeenCalledWith(interaction);
    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.alliance).not.toHaveBeenCalled();
  });

  test("ignores other commands and other interaction kinds", () => {
    const routed = handlers();
    const client = createClient(routed);

    client.emit(Events.InteractionCreate, chatInput("other") as never);
    client.emit(
      Events.InteractionCreate,
      { isChatInputCommand: () => false, isStringSelectMenu: () => false, isButton: () => false } as never,
    );

    expect(routed.ping).not.toHaveBeenCalled();
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
    expect(routed.pick).not.toHaveBeenCalled();
  });

  test("hands a string select menu whose custom id starts with pick: to the pick handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed);
    const interaction = component("select", "pick:a1b2c3d4:select");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.pick).toHaveBeenCalledWith(interaction);
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.alliance).not.toHaveBeenCalled();
    expect(routed.quota).not.toHaveBeenCalled();
  });

  test("hands a button whose custom id starts with pick: to the pick handler and nothing else", () => {
    const routed = handlers();
    const client = createClient(routed);
    const interaction = component("button", "pick:a1b2c3d4:page:2");

    client.emit(Events.InteractionCreate, interaction as never);

    expect(routed.pick).toHaveBeenCalledWith(interaction);
    expect(routed.player).not.toHaveBeenCalled();
    expect(routed.alliance).not.toHaveBeenCalled();
  });

  test("ignores a component whose custom id is not a pick list's", () => {
    const routed = handlers();
    const client = createClient(routed);

    client.emit(Events.InteractionCreate, component("button", "roster:a1b2c3d4") as never);
    client.emit(Events.InteractionCreate, component("select", "picks:a1b2c3d4:select") as never);

    expect(routed.pick).not.toHaveBeenCalled();
  });
});

describe("memberRoleIds", () => {
  test("gives the role IDs in the cache of a guild member", () => {
    const member = {
      roles: {
        cache: new Map<string, unknown>([
          ["111", {}],
          ["222", {}],
        ]),
      },
    };

    expect(memberRoleIds(member)).toEqual(["111", "222"]);
  });

  test("gives the role IDs of an API member", () => {
    expect(memberRoleIds({ roles: ["333"] })).toEqual(["333"]);
  });

  test("gives no role IDs for anything else", () => {
    expect(memberRoleIds(null)).toEqual([]);
    expect(memberRoleIds(undefined)).toEqual([]);
    expect(memberRoleIds(42)).toEqual([]);
    expect(memberRoleIds({})).toEqual([]);
  });
});
