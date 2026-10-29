import { MessageFlags } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { parseKingdom, parseUid, type Uid } from "../domain/lookup-input.js";
import type { LookupResult, Player } from "../domain/player.js";
import { FakeLookupInteraction } from "./__fakes__/lookup-interaction.js";
import { lookupMessages } from "./lookup-cards.js";
import { handlePlayer } from "./lookup.js";

const UID = "145563254785";

function uid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid "${text}" is not a valid uid`);
  return parsed.value;
}

const kingdom = parseKingdom(330);
if (!kingdom.ok) throw new Error("test Kingdom 330 is not valid");

const player: Player = {
  uid: uid(UID),
  name: "Vex",
  kingdom: kingdom.value,
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

/** A context whose fake Game API answers every lookup with the given result. */
function contextReturning(result: LookupResult<Player>) {
  const logged: string[] = [];
  const getPlayer = vi.fn<(uid: Uid) => Promise<LookupResult<Player>>>(() => Promise.resolve(result));
  const context = {
    gameApi: { getPlayer },
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, getPlayer, logged };
}

describe("handlePlayer", () => {
  test("answers an invalid uid privately with the help text, without deferring or asking the Game API", async () => {
    const interaction = new FakeLookupInteraction("14556abc");
    const { context, getPlayer } = contextReturning({ kind: "found", value: player });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "reply",
        options: {
          content: lookupMessages.invalidUid,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(getPlayer).not.toHaveBeenCalled();
  });

  test("asks the Game API for the Player by the trimmed uid", async () => {
    const interaction = new FakeLookupInteraction(` ${UID} `);
    const { context, getPlayer } = contextReturning({ kind: "found", value: player });

    await handlePlayer(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(UID);
  });

  test("defers publicly, then shows the Player card to everyone", async () => {
    const interaction = new FakeLookupInteraction(UID);
    const { context } = contextReturning({ kind: "found", value: player });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [expect.objectContaining({ title: "Vex" })],
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder and tells the caller privately when no player has the uid", async () => {
    const interaction = new FakeLookupInteraction(UID);
    const { context } = contextReturning({ kind: "not-found" });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: "No player has the uid 145563254785.",
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("logs a rejected reply and resolves instead of throwing", async () => {
    const interaction = new FakeLookupInteraction(UID);
    interaction.fail("editReply", new Error("Unknown interaction"));
    const { context, logged } = contextReturning({ kind: "found", value: player });

    await expect(handlePlayer(interaction, context)).resolves.toBeUndefined();

    expect(logged).toEqual([expect.stringContaining("Unknown interaction")]);
  });
});

const privateFailures: readonly { readonly label: string; readonly result: LookupResult<Player>; readonly text: string }[] =
  [
    {
      label: "quota-spent",
      result: { kind: "quota-spent" },
      text: "Lookups are used up for today. They work again after 00:00 UTC.",
    },
    {
      label: "try-again",
      result: { kind: "try-again" },
      text: "The game tracker is busy right now. Try again in a moment.",
    },
    {
      label: "unavailable (auth)",
      result: { kind: "unavailable", reason: "auth" },
      text: "Lookups are not working right now. Please tell an Officer.",
    },
  ];

describe("handlePlayer failures that give no card", () => {
  test.each(privateFailures)(
    "$label removes the thinking placeholder and tells the caller privately with the contract text, never a card",
    async ({ result, text }) => {
      const interaction = new FakeLookupInteraction(UID);
      const { context } = contextReturning(result);

      await handlePlayer(interaction, context);

      expect(interaction.calls).toEqual([
        { method: "deferReply" },
        { method: "deleteReply" },
        {
          method: "followUp",
          options: {
            content: text,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
        },
      ]);
    },
  );
});
