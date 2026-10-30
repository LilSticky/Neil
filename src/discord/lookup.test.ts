import { MessageFlags } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { parseKingdom, parseUid, type AllianceKey, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player } from "../domain/player.js";
import { FakeLookupInteraction } from "./__fakes__/lookup-interaction.js";
import { lookupMessages } from "./lookup-cards.js";
import { handleAlliance, handlePlayer } from "./lookup.js";

const UID = "145563254785";
const FETCHED_AT = new Date("2026-10-30T15:20:00Z");
const NOW = new Date("2026-10-30T16:00:00Z");
const RESETS_AT = new Date("2026-10-31T00:00:00Z");

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
    now: () => NOW,
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
    const { context, getPlayer } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

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
    const { context, getPlayer } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await handlePlayer(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(UID);
  });

  test("defers publicly, then shows the Player card to everyone", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [
            expect.objectContaining({
              title: "Vex",
              footer: { text: "Data from Last Asylum Tracker · as of 15:20 UTC" },
            }),
          ],
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("shows the day of the fetch in the footer when the Player was fetched on an earlier UTC day", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context } = contextReturning({
      kind: "found",
      value: player,
      fetchedAt: new Date("2026-10-29T23:50:00Z"),
    });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [
            expect.objectContaining({
              footer: { text: "Data from Last Asylum Tracker · as of 29 Oct 23:50 UTC" },
            }),
          ],
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
    const { context, logged } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await expect(handlePlayer(interaction, context)).resolves.toBeUndefined();

    expect(logged).toEqual([expect.stringContaining("Unknown interaction")]);
  });
});

const privateFailures: readonly { readonly label: string; readonly result: LookupResult<Player>; readonly text: string }[] =
  [
    {
      label: "quota-spent",
      result: { kind: "quota-spent", resetsAt: RESETS_AT },
      text: "Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC (in 8 h 0 min).",
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

describe("handlePlayer when the tracker could not prepare the profile", () => {
  test("removes the thinking placeholder and tells the caller privately to check the uid or try again later", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context } = contextReturning({ kind: "not-prepared" });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content:
            "Couldn't find a player with the uid 145563254785. Check the uid; if it's right, the tracker may be busy, so try again later.",
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

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
    now: () => NOW,
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
        fetchedAt: FETCHED_AT,
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
        fetchedAt: FETCHED_AT,
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
      fetchedAt: FETCHED_AT,
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
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [
            expect.objectContaining({
              title: "[NML] No Man's Land",
              footer: { text: "Data from Last Asylum Tracker · as of 15:20 UTC" },
            }),
          ],
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
      fetchedAt: FETCHED_AT,
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
    result: { kind: "quota-spent", resetsAt: RESETS_AT },
    text: "Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC (in 8 h 0 min).",
  },
  {
    label: "try-again",
    result: { kind: "try-again" },
    text: lookupMessages.tryAgain,
  },
  {
    label: "not-prepared",
    result: { kind: "not-prepared" },
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
    const { context, logged } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

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

describe("handlers when the Daily Quota is spent", () => {
  const LATER = new Date("2026-10-30T20:48:00Z");
  const spentText =
    "Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC (in 3 h 12 min).";

  test("/player tells the caller privately, with the time left counted from the context's now", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context } = contextReturning({ kind: "quota-spent", resetsAt: RESETS_AT });

    await handlePlayer(interaction, { ...context, now: () => LATER });

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: spentText,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("/alliance tells the caller privately, with the time left counted from the context's now", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    const { context } = allianceContextReturning({ kind: "quota-spent", resetsAt: RESETS_AT });

    await handleAlliance(interaction, { ...context, now: () => LATER });

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: spentText,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

describe("handleAlliance when the card cannot be sent", () => {
  test("deletes the placeholder, tells the caller privately it is unavailable, logs the error and resolves", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    interaction.fail("editReply", new Error("Unknown interaction"));
    const { context, logged } = allianceContextReturning({ kind: "found", value: alliance, fetchedAt: FETCHED_AT });

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

describe("handlePlayer when the Game API throws", () => {
  test("removes the placeholder, tells the caller privately it is unavailable, logs the error and resolves", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const logged: string[] = [];
    const getPlayer = vi.fn<(uid: Uid) => Promise<LookupResult<Player>>>(() =>
      Promise.reject(new Error("tracker connection reset")),
    );
    const context = {
      gameApi: { getPlayer },
      now: () => NOW,
      logError: (message: string) => {
        logged.push(message);
      },
    };

    await expect(handlePlayer(interaction, context)).resolves.toBeUndefined();

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
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
    expect(logged).toEqual([expect.stringContaining("tracker connection reset")]);
  });
});

describe("handleAlliance when the Game API throws", () => {
  test("removes the placeholder, tells the caller privately it is unavailable, logs the error and resolves", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
      integers: { kingdom: 1 },
    });
    const logged: string[] = [];
    const getAlliance = vi.fn<(kingdom: KingdomNumber, key: AllianceKey) => Promise<LookupResult<Alliance>>>(() =>
      Promise.reject(new Error("tracker connection reset")),
    );
    const context = {
      gameApi: { getAlliance },
      now: () => NOW,
      logError: (message: string) => {
        logged.push(message);
      },
    };

    await expect(handleAlliance(interaction, context)).resolves.toBeUndefined();

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
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
    expect(logged).toEqual([expect.stringContaining("tracker connection reset")]);
  });
});
