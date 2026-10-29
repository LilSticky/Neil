import { MessageFlags } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { parseKingdom, parseUid, type AllianceKey, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player } from "../domain/player.js";
import { FakeLookupInteraction } from "./__fakes__/lookup-interaction.js";
import { lookupMessages, renderAllianceCard } from "./lookup-cards.js";
import { handleAlliance, handlePlayer } from "./lookup.js";

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
    const interaction = new FakeLookupInteraction({
      strings: { uid: "14556abc" },
    });
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
    const interaction = new FakeLookupInteraction({
      strings: { uid: ` ${UID} ` },
    });
    const { context, getPlayer } = contextReturning({ kind: "found", value: player });

    await handlePlayer(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(UID);
  });

  test("defers publicly, then shows the Player card to everyone", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
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
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
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
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
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
      const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
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

function kingdomNumber(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} is not valid`);
  return parsed.value;
}

const kingdomOne = kingdomNumber(1);

const alliance: Alliance = {
  tag: "NML",
  name: "No Man's Land",
  kingdom: kingdomOne,
  power: 208815434,
  memberCount: 52,
  capacity: 100,
  leaderName: "DrLOL",
};

/** A context whose fake Game API answers every alliance lookup with the given result. */
function allianceContextReturning(result: LookupResult<Alliance>) {
  const logged: string[] = [];
  const getAlliance = vi.fn<(kingdom: KingdomNumber, key: AllianceKey) => Promise<LookupResult<Alliance>>>(() =>
    Promise.resolve(result),
  );
  const context = {
    gameApi: { getAlliance },
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, getAlliance, logged };
}

describe("handleAlliance", () => {
  test.each([0, 10000])(
    "answers the kingdom %s privately with the help text, without deferring or asking the Game API",
    async (number) => {
      const interaction = new FakeLookupInteraction({
        strings: { alliance: "NML" },
        integers: { kingdom: number },
      });
      const { context, getAlliance } = allianceContextReturning({
        kind: "found",
        value: alliance,
      });

      await handleAlliance(interaction, context);

      expect(interaction.calls).toEqual([
        {
          method: "reply",
          options: {
            content: lookupMessages.invalidKingdom,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
        },
      ]);
      expect(getAlliance).not.toHaveBeenCalled();
    },
  );

  test.each([
    { label: "blank", text: "   " },
    { label: "longer than 40 characters", text: "x".repeat(41) },
  ])(
    "answers an alliance that is $label privately with the help text, without deferring or asking the Game API",
    async ({ text }) => {
      const interaction = new FakeLookupInteraction({
        strings: { alliance: text },
        integers: { kingdom: 1 },
      });
      const { context, getAlliance } = allianceContextReturning({
        kind: "found",
        value: alliance,
      });

      await handleAlliance(interaction, context);

      expect(interaction.calls).toEqual([
        {
          method: "reply",
          options: {
            content: lookupMessages.invalidAlliance,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
        },
      ]);
      expect(getAlliance).not.toHaveBeenCalled();
    },
  );

  test("asks the Game API for the Alliance by its Kingdom and the trimmed key", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: " NML " },
      integers: { kingdom: 1 },
    });
    const { context, getAlliance } = allianceContextReturning({
      kind: "found",
      value: alliance,
    });

    await handleAlliance(interaction, context);

    expect(getAlliance).toHaveBeenCalledWith(kingdomOne, "NML");
  });

  test("defers publicly, then shows the Alliance card to everyone", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    const { context } = allianceContextReturning({
      kind: "found",
      value: alliance,
    });

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [renderAllianceCard(alliance)],
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder and tells the caller privately when no alliance has the key in the Kingdom", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    const { context } = allianceContextReturning({ kind: "not-found" });

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: 'No alliance "NML" in kingdom #1.',
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder and privately lists the matches when the key is ambiguous", async () => {
    const matches: readonly Match[] = [
      { tag: "NML", name: "No Man's Land", kingdom: 1, uid: "145563254785" },
      { tag: "NMX", name: "No Man's Land", kingdom: 2, uid: "93159425" },
    ];
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    const { context } = allianceContextReturning({
      kind: "ambiguous",
      matches,
    });

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content:
            "More than one alliance matches \"NML\": [NML] No Man's Land, [NMX] No Man's Land. Try the exact tag.",
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("logs a rejected reply and resolves instead of throwing", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    interaction.fail("editReply", new Error("Unknown interaction"));
    const { context, logged } = allianceContextReturning({
      kind: "found",
      value: alliance,
    });

    await expect(handleAlliance(interaction, context)).resolves.toBeUndefined();

    expect(logged).toEqual([expect.stringContaining("Unknown interaction")]);
  });
});

const allianceFailures: readonly {
  readonly label: string;
  readonly result: LookupResult<Alliance>;
  readonly text: string;
}[] = [
  {
    label: "quota-spent",
    result: { kind: "quota-spent" },
    text: lookupMessages.quotaSpent,
  },
  {
    label: "try-again",
    result: { kind: "try-again" },
    text: lookupMessages.tryAgain,
  },
  {
    label: "unavailable (auth)",
    result: { kind: "unavailable", reason: "auth" },
    text: lookupMessages.unavailable,
  },
];

describe("handleAlliance failures that give no card", () => {
  test.each(allianceFailures)(
    "$label removes the thinking placeholder and tells the caller privately with the contract text, never a card",
    async ({ result, text }) => {
      const interaction = new FakeLookupInteraction({
        strings: { alliance: "NML" },
        integers: { kingdom: 1 },
      });
      const { context } = allianceContextReturning(result);

      await handleAlliance(interaction, context);

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

describe("handlePlayer when the card cannot be sent", () => {
  test("deletes the placeholder, tells the caller privately it is unavailable, logs the error and resolves", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    interaction.fail("editReply", new Error("Unknown interaction"));
    const { context, logged } = contextReturning({ kind: "found", value: player });

    await expect(handlePlayer(interaction, context)).resolves.toBeUndefined();

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [expect.objectContaining({ title: "Vex" })],
          allowedMentions: { parse: [] },
        },
      },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: lookupMessages.unavailable,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(logged).toEqual([expect.stringContaining("Unknown interaction")]);
  });
});

describe("handleAlliance when the card cannot be sent", () => {
  test("deletes the placeholder, tells the caller privately it is unavailable, logs the error and resolves", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    interaction.fail("editReply", new Error("Unknown interaction"));
    const { context, logged } = allianceContextReturning({ kind: "found", value: alliance });

    await expect(handleAlliance(interaction, context)).resolves.toBeUndefined();

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [expect.objectContaining({ title: "[NML] No Man's Land" })],
          allowedMentions: { parse: [] },
        },
      },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: lookupMessages.unavailable,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(logged).toEqual([expect.stringContaining("Unknown interaction")]);
  });
});
