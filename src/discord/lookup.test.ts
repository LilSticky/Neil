import { ComponentType, MessageFlags } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import type { LookupCaller } from "../game-api/allowance-keeper.js";
import type { KnownAlliance } from "../domain/alliance-match.js";
import { sortRoster } from "../domain/alliance-rank.js";
import {
  parseAllianceKey,
  parseKingdom,
  parsePlayerName,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type PlayerName,
  type Uid,
} from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player, RosterEntry } from "../domain/player.js";
import { FakeGameApi } from "./__fakes__/game-api.js";
import { FakeLookupInteraction } from "./__fakes__/lookup-interaction.js";
import {
  FakeUsage,
  UNREADABLE_USAGE_MESSAGE,
  unreadableUsage,
  usageLineFor,
  FAKE_USED_BEFORE,
} from "./__fakes__/usage.js";
import { lookupMessages, renderAllianceComponents } from "./lookup-cards.js";
import type { PickChoice } from "./pick-sessions.js";
import { callerOf, handleAlliance, handlePlayer } from "./lookup.js";

const UID = "145563254785";
const USER_ID = "310000000000000001";
const OFFICER_ROLE_ID = "700000000000000001";
const PICK_ID = "a1b2c3d4";
const FETCHED_AT = new Date("2026-10-30T15:20:00Z");
const NOW = new Date("2026-10-30T16:00:00Z");
const RESETS_AT = new Date("2026-10-31T00:00:00Z");
const DAY_MS = 86_400_000;
/** The Daily Allowance of the tests: a Member who has used all three may not look up more. */
const ALLOWANCE = 3;
/** The private refusal for RESETS_AT, read at NOW (eight hours before the reset). */
const REFUSAL_TEXT =
  "Your Daily Allowance is spent: 3 of 3 Game API requests used today. Cached answers still work. It resets at 00:00 UTC (in 8 h 0 min).";
const MEMBER: LookupCaller = { memberId: USER_ID, officer: false };

function uid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid "${text}" is not a valid uid`);
  return parsed.value;
}

function playerName(text: string): PlayerName {
  const parsed = parsePlayerName(text);
  if (!parsed.ok) throw new Error(`test Player Name "${text}" is not valid`);
  return parsed.value;
}

const kingdom = parseKingdom(330);
if (!kingdom.ok) throw new Error("test Kingdom 330 is not valid");

const player: Player = {
  uid: uid(UID),
  name: "Vex",
  kingdom: kingdom.value,
  might: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

/** A pick list store that opens every pick list with the same id. */
function pickSessionsSpy() {
  return { open: vi.fn<(ownerId: string, choice: PickChoice, now: Date) => string>(() => PICK_ID) };
}

/**
 * A context over a fake Game API, with one Officer role and the Daily Allowance of ALLOWANCE. The lookups are read from
 * the fake's charged spies, so a test sees the charged calls and nothing uncharged.
 */
function contextFor(gameApi: FakeGameApi) {
  const logged: string[] = [];
  const pickSessions = pickSessionsSpy();
  const usage = new FakeUsage();
  const context = {
    gameApi,
    pickSessions,
    now: () => NOW,
    logError: (message: string) => {
      logged.push(message);
    },
    officerRoleIds: [OFFICER_ROLE_ID],
    allowance: () => ALLOWANCE,
    usage: usage.usage,
  };
  return {
    context,
    gameApi,
    getPlayer: gameApi.charged.getPlayer,
    findPlayer: gameApi.charged.findPlayer,
    pickSessions,
    usage,
    logged,
  };
}

/** The failure text followed by the usage line of the Member before the test's request, as the reply shows it. */
function withUsageBefore(text: string): string {
  return `${text}\n${usageLineFor(MEMBER, FAKE_USED_BEFORE)}`;
}

/** A context whose fake Game API answers every Player lookup, by uid or by name, with the given result. */
function contextReturning(result: LookupResult<Player>) {
  return contextFor(new FakeGameApi({ player: result }));
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
              footer: { text: `Data from Last Asylum Tracker · as of 15:20 UTC · ${usageLineFor(MEMBER, FAKE_USED_BEFORE)}` },
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
              footer: {
                text: `Data from Last Asylum Tracker · as of 29 Oct 23:50 UTC · ${usageLineFor(MEMBER, FAKE_USED_BEFORE)}`,
              },
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
          content: withUsageBefore("No player has the uid 145563254785."),
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

describe("handlePlayer with a uid, a name or neither", () => {
  test.each([
    { label: "neither uid nor name", strings: {}, integers: {} },
    { label: "a Kingdom alone", strings: {}, integers: { kingdom: 330 } },
    { label: "both uid and name", strings: { uid: UID, name: "Vex" }, integers: {} },
  ])(
    "answers $label privately with the help text, without deferring or asking the Game API",
    async ({ strings, integers }) => {
      const interaction = new FakeLookupInteraction({ strings, integers });
      const { context, getPlayer, findPlayer } = contextReturning({
        kind: "found",
        value: player,
        fetchedAt: FETCHED_AT,
      });

      await handlePlayer(interaction, context);

      expect(interaction.calls).toEqual([
        {
          method: "reply",
          options: {
            content: lookupMessages.giveUidOrName,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
        },
      ]);
      expect(getPlayer).not.toHaveBeenCalled();
      expect(findPlayer).not.toHaveBeenCalled();
    },
  );

  test("uses the uid flow when a uid comes with a Kingdom, and ignores the Kingdom", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { uid: UID },
      integers: { kingdom: 330 },
    });
    const { context, getPlayer, findPlayer } = contextReturning({
      kind: "found",
      value: player,
      fetchedAt: FETCHED_AT,
    });

    await handlePlayer(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(UID);
    expect(findPlayer).not.toHaveBeenCalled();
  });

  test.each([
    { label: "only dots", text: ".." },
    { label: "longer than 32 characters", text: "x".repeat(33) },
  ])(
    "answers a name that is $label privately with the help text, without deferring or asking the Game API",
    async ({ text }) => {
      const interaction = new FakeLookupInteraction({ strings: { name: text } });
      const { context, getPlayer, findPlayer } = contextReturning({
        kind: "found",
        value: player,
        fetchedAt: FETCHED_AT,
      });

      await handlePlayer(interaction, context);

      expect(interaction.calls).toEqual([
        {
          method: "reply",
          options: {
            content: lookupMessages.invalidPlayerName,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
        },
      ]);
      expect(getPlayer).not.toHaveBeenCalled();
      expect(findPlayer).not.toHaveBeenCalled();
    },
  );

  test("asks the Game API for the Player by the trimmed name, without a Kingdom when none is given", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: " Vex " } });
    const { context, findPlayer, getPlayer } = contextReturning({
      kind: "found",
      value: player,
      fetchedAt: FETCHED_AT,
    });

    await handlePlayer(interaction, context);

    expect(findPlayer).toHaveBeenCalledWith(playerName("Vex"), undefined);
    expect(getPlayer).not.toHaveBeenCalled();
  });

  test("asks the Game API for the Player by name in the given Kingdom", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { name: "Vex" },
      integers: { kingdom: 330 },
    });
    const { context, findPlayer } = contextReturning({
      kind: "found",
      value: player,
      fetchedAt: FETCHED_AT,
    });

    await handlePlayer(interaction, context);

    expect(findPlayer).toHaveBeenCalledWith(playerName("Vex"), kingdom.value);
  });

  test("defers publicly, then shows the Player card to everyone when the name matches one player", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "Vex" } });
    const { context } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

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
});

describe("handlePlayer when a name matches several players", () => {
  test("removes the thinking placeholder, opens a pick list for the caller and sends it privately", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "DrLOL" } }, USER_ID);
    const matches: readonly Match[] = [
      { uid: "93159425", name: "DrLOL", kingdom: 330 },
      { name: "DrLOL" },
      { uid: UID, name: "DrLOL", kingdom: 12 },
    ];
    const { context, pickSessions } = contextReturning({ kind: "ambiguous", matches });

    await handlePlayer(interaction, context);

    expect(pickSessions.open).toHaveBeenCalledWith(
      USER_ID,
      {
        kind: "players",
        matches: [
          { uid: UID, name: "DrLOL", kingdom: 12 },
          { uid: "93159425", name: "DrLOL", kingdom: 330 },
        ],
      },
      NOW,
    );
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore('Several players are named "DrLOL". Pick one:'),
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: `pick:${PICK_ID}:select`,
                  options: [
                    { label: "DrLOL", description: "Kingdom #12", value: "0" },
                    { label: "DrLOL", description: "Kingdom #330", value: "1" },
                  ],
                },
              ],
            },
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

describe("handlePlayer when no player has the name", () => {
  test.each([
    {
      label: "in a Kingdom",
      integers: { kingdom: 330 },
      text: 'No player is named "Vex" in kingdom #330. The name must be complete; a uid always works.',
    },
    {
      label: "in any Kingdom",
      integers: {},
      text: 'No player is named "Vex". The name must be complete; a uid always works.',
    },
  ])("removes the thinking placeholder and tells the caller privately, $label", async ({ integers, text }) => {
    const interaction = new FakeLookupInteraction({ strings: { name: "Vex" }, integers });
    const { context } = contextReturning({ kind: "not-found" });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore(text),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder and tells the caller privately to check the name or try again later when the tracker could not prepare it", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "Vex" } });
    const { context } = contextReturning({ kind: "not-prepared" });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore(
            "Couldn't find a player named \"Vex\". Check the name; if it's right, the tracker may be busy, so try again later.",
          ),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
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
          content: withUsageBefore(
            "Couldn't find a player with the uid 145563254785. Check the uid; if it's right, the tracker may be busy, so try again later.",
          ),
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
            content: withUsageBefore(text),
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
  might: 208815434,
  memberCount: 52,
  capacity: 100,
  leaderName: "DrLOL",
  roster: [],
};

/** The Home Kingdom of the tests, where a tag alone is looked up and Known Alliances are kept. */
const homeKingdom = kingdomNumber(330);

/** A Known Alliance of the Home Kingdom, last seen the given number of days before NOW. */
function knownAlliance(tag: string, name: string, daysAgo = 1): KnownAlliance {
  return { kingdom: homeKingdom, tag, name, lastSeen: new Date(NOW.getTime() - daysAgo * DAY_MS) };
}

/**
 * A context whose fake Game API answers every alliance lookup, by tag or by full name, with the given result. The
 * Known Alliances are the ones given; the Home Kingdom is 330.
 */
function allianceContextReturning(result: LookupResult<Alliance>, known: readonly KnownAlliance[] = []) {
  const gameApi = new FakeGameApi({ alliance: result });
  const base = contextFor(gameApi);
  const context = {
    ...base.context,
    homeKingdom,
    knownAlliances: { all: (): KnownAlliance[] => [...known] },
  };
  return {
    context,
    gameApi,
    getAlliance: gameApi.charged.getAlliance,
    findAlliance: gameApi.charged.findAlliance,
    pickSessions: base.pickSessions,
    usage: base.usage,
    logged: base.logged,
  };
}

describe("handleAlliance", () => {
  test.each([0, 10000])(
    "answers the kingdom %s privately with the help text, without deferring or asking the Game API",
    async (number) => {
      const interaction = new FakeLookupInteraction({
        strings: { tag: "NML" },
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
        strings: { tag: text },
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
      strings: { tag: " NML " },
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
      strings: { tag: "NML" },
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
              footer: { text: `Data from Last Asylum Tracker · as of 15:20 UTC · ${usageLineFor(MEMBER, FAKE_USED_BEFORE)}` },
            }),
          ],
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder and tells the caller privately when no alliance has the key in the Kingdom", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { tag: "NML" },
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
          content: withUsageBefore('No alliance "NML" in kingdom #1.'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder, opens a private alliance pick list for the caller when the tag is ambiguous", async () => {
    const matches: readonly Match[] = [
      { tag: "NML", name: "No Man's Land", kingdom: 1 },
      { tag: "NMX", name: "No Man's Land", kingdom: 2 },
    ];
    const interaction = new FakeLookupInteraction({
      strings: { tag: "NML" },
      integers: { kingdom: 1 },
    }, USER_ID);
    const { context, pickSessions } = allianceContextReturning({
      kind: "ambiguous",
      matches,
    });

    await handleAlliance(interaction, context);

    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "alliances", matches }, NOW);
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore('Several alliances are named "NML". Pick one:'),
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: `pick:${PICK_ID}:select`,
                  options: [
                    { label: "[NML] No Man's Land · kingdom #1", value: "0" },
                    { label: "[NMX] No Man's Land · kingdom #2", value: "1" },
                  ],
                },
              ],
            },
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("logs a rejected reply and resolves instead of throwing", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { tag: "NML" },
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
        strings: { tag: "NML" },
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
            content: withUsageBefore(text),
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
        },
      ]);
    },
  );
});

function allianceKey(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test Alliance key "${text}" is not valid`);
  return parsed.value;
}

/** Members of the Alliance, in the order the tracker lists them; the card and the menu show them by rank. */
const rosterMembers: readonly RosterEntry[] = [
  { uid: uid("93159425"), name: "Benedict", allianceRank: "R3", kingdom: undefined, sanctuaryLevel: undefined, weeklyActivity: undefined, dailyHonor: undefined, dailyTech: undefined, online: undefined, lastOnlineAt: undefined },
  { uid: uid("179060285441"), name: "etranger", allianceRank: "R4", kingdom: undefined, sanctuaryLevel: undefined, weeklyActivity: undefined, dailyHonor: undefined, dailyTech: undefined, online: undefined, lastOnlineAt: undefined },
  { uid: uid("147744374785"), name: "Settong", allianceRank: "R1", kingdom: undefined, sanctuaryLevel: undefined, weeklyActivity: undefined, dailyHonor: undefined, dailyTech: undefined, online: undefined, lastOnlineAt: undefined },
];
const allianceWithRoster: Alliance = { ...alliance, roster: rosterMembers };
const sortedMembers = sortRoster(rosterMembers);

describe("handleAlliance by kingdom and tag, with a roster", () => {
  test("defers publicly, shows the card with the roster menu to everyone, and opens a roster pick list for the caller", async () => {
    const interaction = new FakeLookupInteraction(
      { strings: { tag: "NML" }, integers: { kingdom: 1 } },
      USER_ID,
    );
    const { context, pickSessions } = allianceContextReturning({
      kind: "found",
      value: allianceWithRoster,
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "roster", entries: sortedMembers, alliance: allianceWithRoster, fetchedAt: FETCHED_AT }, NOW);
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [expect.objectContaining({ title: "[NML] No Man's Land" })],
          components: renderAllianceComponents(allianceWithRoster, 0, PICK_ID),
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("shows the card without a roster menu, and opens no roster pick list, when the roster is empty", async () => {
    const interaction = new FakeLookupInteraction({ strings: { tag: "NML" }, integers: { kingdom: 1 } });
    const { context, pickSessions } = allianceContextReturning({
      kind: "found",
      value: alliance,
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(pickSessions.open).not.toHaveBeenCalled();
    expect(interaction.calls).toHaveLength(2);
    const reply = interaction.calls[1];
    expect(reply?.method === "editReply" ? reply.options.components ?? [] : undefined).toEqual([]);
  });
});

describe("handleAlliance by the Alliance's full name", () => {
  test("asks the Game API for the Alliance by its full name, charged to the caller, and no Kingdom is needed", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } });
    const { context, findAlliance, getAlliance } = allianceContextReturning({
      kind: "found",
      value: allianceWithRoster,
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(findAlliance).toHaveBeenCalledWith(allianceKey("No Man's Land"));
    expect(getAlliance).not.toHaveBeenCalled();
  });

  test("defers publicly, shows the card with the roster menu, and opens a roster pick list when the name matches one Alliance", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } }, USER_ID);
    const { context, pickSessions } = allianceContextReturning({
      kind: "found",
      value: allianceWithRoster,
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "roster", entries: sortedMembers, alliance: allianceWithRoster, fetchedAt: FETCHED_AT }, NOW);
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [expect.objectContaining({ title: "[NML] No Man's Land" })],
          components: renderAllianceComponents(allianceWithRoster, 0, PICK_ID),
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder and privately opens an alliance pick list when several Alliances have the name", async () => {
    const matches: readonly Match[] = [
      { tag: "NML", name: "No Man's Land", kingdom: 1 },
      { tag: "NMX", name: "No Man's Land", kingdom: 2 },
    ];
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } }, USER_ID);
    const { context, pickSessions } = allianceContextReturning({ kind: "ambiguous", matches });

    await handleAlliance(interaction, context);

    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "alliances", matches }, NOW);
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore('Several alliances are named "No Man\'s Land". Pick one:'),
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: `pick:${PICK_ID}:select`,
                  options: [
                    { label: "[NML] No Man's Land · kingdom #1", value: "0" },
                    { label: "[NMX] No Man's Land · kingdom #2", value: "1" },
                  ],
                },
              ],
            },
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("removes the thinking placeholder and tells the caller privately when no Alliance has exactly that name", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } });
    const { context } = allianceContextReturning({ kind: "not-found" });

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content:
            withUsageBefore('No alliance is named "No Man\'s Land", and none I know is close. Try the tag, or start typing and pick a suggestion.'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

describe("handleAlliance with a combination that is neither a kingdom and tag nor a full name", () => {
  test.each([
    { label: "nothing at all", strings: {}, integers: {} },
    { label: "a Kingdom alone", strings: {}, integers: { kingdom: 1 } },
    { label: "a full name with a Kingdom", strings: { name: "No Man's Land" }, integers: { kingdom: 1 } },
    { label: "a full name with a tag", strings: { name: "No Man's Land", tag: "NML" }, integers: {} },
    {
      label: "a full name, a tag and a Kingdom",
      strings: { name: "No Man's Land", tag: "NML" },
      integers: { kingdom: 1 },
    },
  ])(
    "answers $label privately with the contract text, without deferring or asking the Game API",
    async ({ strings, integers }) => {
      const interaction = new FakeLookupInteraction({ strings, integers });
      const { context, getAlliance, findAlliance } = allianceContextReturning({
        kind: "found",
        value: alliance,
        fetchedAt: FETCHED_AT,
      });

      await handleAlliance(interaction, context);

      expect(interaction.calls).toEqual([
        {
          method: "reply",
          options: {
            content: lookupMessages.giveKingdomAndTagOrName,
            flags: MessageFlags.Ephemeral,
            allowedMentions: { parse: [] },
          },
        },
      ]);
      expect(getAlliance).not.toHaveBeenCalled();
      expect(findAlliance).not.toHaveBeenCalled();
    },
  );
});

describe("handleAlliance with a tag and no Kingdom", () => {
  test("asks the Game API for the Alliance by its tag in the Home Kingdom, charged to the caller, and never by name", async () => {
    const interaction = new FakeLookupInteraction({ strings: { tag: " NML " } });
    const { context, getAlliance, findAlliance } = allianceContextReturning({
      kind: "found",
      value: alliance,
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(getAlliance).toHaveBeenCalledWith(homeKingdom, allianceKey("NML"));
    expect(findAlliance).not.toHaveBeenCalled();
  });

  test("tells the caller privately, naming the Home Kingdom, when no Alliance has the tag there", async () => {
    const interaction = new FakeLookupInteraction({ strings: { tag: "NML" } });
    const { context } = allianceContextReturning({ kind: "not-found" });

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore(lookupMessages.allianceNotFound(allianceKey("NML"), homeKingdom)),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

/** The single select menu of a pick list under the session id, with the given options. */
function pickSelect(sessionId: string, options: readonly { readonly label: string; readonly value: string }[]) {
  return [
    {
      type: ComponentType.ActionRow,
      components: [{ type: ComponentType.StringSelect, custom_id: `pick:${sessionId}:select`, options }],
    },
  ];
}

describe("handleAlliance when no Alliance has the full name but Known Alliances are close", () => {
  test("removes the thinking placeholder and privately opens a pick list of the close Known Alliances, as [TAG] Name", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "no mans" } }, USER_ID);
    const known = [knownAlliance("NML", "No Man's Land"), knownAlliance("NMA", "Night Mares")];
    const { context, pickSessions } = allianceContextReturning({ kind: "not-found" }, known);

    await handleAlliance(interaction, context);

    const matches: Match[] = [{ tag: "NML", name: "No Man's Land", kingdom: homeKingdom }];
    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "alliances", matches }, NOW);
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: expect.any(String) as unknown,
          components: pickSelect(PICK_ID, [{ label: "[NML] No Man's Land", value: "0" }]),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("shows the names of the pick list as plain labels, without Discord markdown escapes", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "wolves" } }, USER_ID);
    const { context } = allianceContextReturning({ kind: "not-found" }, [knownAlliance("WLF", "Wolves *Pack*")]);

    await handleAlliance(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: expect.objectContaining({
        components: pickSelect(PICK_ID, [{ label: "[WLF] Wolves *Pack*", value: "0" }]),
      }) as unknown,
    });
  });

  test("escapes the typed name in the message text, and keeps the markdown characters of the labels plain", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "no_mans*" } }, USER_ID);
    const { context } = allianceContextReturning({ kind: "not-found" }, [
      knownAlliance("NML", "No_Man's *Land*"),
    ]);

    await handleAlliance(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: expect.objectContaining({
        content: withUsageBefore('No alliance is named "no\\_mans\\*". Did you mean one of these?'),
        components: pickSelect(PICK_ID, [{ label: "[NML] No_Man's *Land*", value: "0" }]),
      }) as unknown,
    });
  });

  test("lists the close Known Alliances in the order they match, best first, not alphabetically", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "wolf" } }, USER_ID);
    const known = [knownAlliance("BWC", "Big Wolf Clan"), knownAlliance("WLF", "Wolfpack")];
    const { context, pickSessions } = allianceContextReturning({ kind: "not-found" }, known);

    await handleAlliance(interaction, context);

    const matches: Match[] = [
      { tag: "WLF", name: "Wolfpack", kingdom: homeKingdom },
      { tag: "BWC", name: "Big Wolf Clan", kingdom: homeKingdom },
    ];
    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "alliances", matches }, NOW);
    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: expect.objectContaining({
        components: pickSelect(PICK_ID, [
          { label: "[WLF] Wolfpack", value: "0" },
          { label: "[BWC] Big Wolf Clan", value: "1" },
        ]),
      }) as unknown,
    });
  });

  test("keeps the not-found text, and opens no pick list, when no Known Alliance is close", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } });
    const { context, pickSessions } = allianceContextReturning({ kind: "not-found" }, [
      knownAlliance("NMA", "Night Mares"),
    ]);

    await handleAlliance(interaction, context);

    expect(pickSessions.open).not.toHaveBeenCalled();
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content:
            withUsageBefore('No alliance is named "No Man\'s Land", and none I know is close. Try the tag, or start typing and pick a suggestion.'),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
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
          content: withUsageBefore(lookupMessages.unavailable),
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
          content: withUsageBefore(spentText),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("/alliance tells the caller privately, with the time left counted from the context's now", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { tag: "NML" },
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
          content: withUsageBefore(spentText),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

describe("handlers when the Quota Reserve is kept for Onboarding Interviews", () => {
  const LATER = new Date("2026-10-30T20:48:00Z");
  const reserveText =
    "Lookups are paused for today: the rest of the Daily Quota is kept for interviewing new members. They work again at 00:00 UTC (in 3 h 12 min).";

  test.each([
    {
      label: "/player by uid",
      run: (now: Date) => {
        const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
        const { context } = contextReturning({ kind: "reserve-kept", resetsAt: RESETS_AT });
        return handlePlayer(interaction, { ...context, now: () => now }).then(() => interaction);
      },
    },
    {
      label: "/player by name",
      run: (now: Date) => {
        const interaction = new FakeLookupInteraction({ strings: { name: "Vex" } });
        const { context } = contextReturning({ kind: "reserve-kept", resetsAt: RESETS_AT });
        return handlePlayer(interaction, { ...context, now: () => now }).then(() => interaction);
      },
    },
    {
      label: "/alliance by tag",
      run: (now: Date) => {
        const interaction = new FakeLookupInteraction({
          strings: { tag: "NML" },
          integers: { kingdom: 1 },
        });
        const { context } = allianceContextReturning({ kind: "reserve-kept", resetsAt: RESETS_AT });
        return handleAlliance(interaction, { ...context, now: () => now }).then(() => interaction);
      },
    },
    {
      label: "/alliance by full name",
      run: (now: Date) => {
        const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } });
        const { context } = allianceContextReturning({ kind: "reserve-kept", resetsAt: RESETS_AT });
        return handleAlliance(interaction, { ...context, now: () => now }).then(() => interaction);
      },
    },
  ])("$label tells the caller privately with the reserve text, not the quota-spent text", async ({ run }) => {
    const interaction = await run(LATER);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: {
        content: withUsageBefore(reserveText),
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    expect(interaction.calls.map((call) => call.method)).not.toContain("editReply");
  });
});

describe("handleAlliance when the card cannot be sent", () => {
  test("deletes the placeholder, tells the caller privately it is unavailable, logs the error and resolves", async () => {
    const interaction = new FakeLookupInteraction({
      strings: { tag: "NML" },
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
          content: withUsageBefore(lookupMessages.unavailable),
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
    const gameApi = new FakeGameApi();
    gameApi.charged.getPlayer.mockImplementation(() => Promise.reject(new Error("tracker connection reset")));
    const context = {
      gameApi,
      pickSessions: pickSessionsSpy(),
      now: () => NOW,
      logError: (message: string) => {
        logged.push(message);
      },
      officerRoleIds: [OFFICER_ROLE_ID],
      allowance: () => ALLOWANCE,
      usage: new FakeUsage().usage,
    };

    await expect(handlePlayer(interaction, context)).resolves.toBeUndefined();

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore(lookupMessages.unavailable),
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
      strings: { tag: "NML" },
      integers: { kingdom: 1 },
    });
    const logged: string[] = [];
    const gameApi = new FakeGameApi();
    gameApi.charged.getAlliance.mockImplementation(() => Promise.reject(new Error("tracker connection reset")));
    gameApi.charged.findAlliance.mockImplementation(() => Promise.reject(new Error("tracker connection reset")));
    const context = {
      gameApi,
      pickSessions: pickSessionsSpy(),
      now: () => NOW,
      logError: (message: string) => {
        logged.push(message);
      },
      officerRoleIds: [OFFICER_ROLE_ID],
      allowance: () => ALLOWANCE,
      usage: new FakeUsage().usage,
      homeKingdom,
      knownAlliances: { all: (): KnownAlliance[] => [] },
    };

    await expect(handleAlliance(interaction, context)).resolves.toBeUndefined();

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: withUsageBefore(lookupMessages.unavailable),
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(logged).toEqual([expect.stringContaining("tracker connection reset")]);
  });
});

/** A context whose fake Game API refuses every charged lookup: the Member has used the whole Daily Allowance. */
function refusingPlayerContext() {
  return contextFor(new FakeGameApi({ refusedUntil: RESETS_AT }));
}

/** An Alliance context whose fake Game API refuses every charged lookup, with the Home Kingdom and no Known Alliances. */
function refusingAllianceContext() {
  const gameApi = new FakeGameApi({ refusedUntil: RESETS_AT });
  const context = {
    ...contextFor(gameApi).context,
    homeKingdom,
    knownAlliances: { all: (): KnownAlliance[] => [] },
  };
  return { gameApi, context };
}

describe("callerOf", () => {
  test("names the Member who ran the command, not an Officer, when the Member holds no Officer role", () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });

    expect(callerOf(interaction, [OFFICER_ROLE_ID])).toEqual(MEMBER);
  });

  test("names the Member as an Officer when the Member holds an Officer role", () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } }, USER_ID, [OFFICER_ROLE_ID]);

    expect(callerOf(interaction, [OFFICER_ROLE_ID])).toEqual({ memberId: USER_ID, officer: true });
  });
});

describe("handlePlayer by uid charges the Member who ran the command", () => {
  test("asks the charged view of that Member for the Player, and no uncharged lookup", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context, gameApi, getPlayer } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await handlePlayer(interaction, context);

    expect(gameApi.chargedTo).toHaveBeenCalledWith(MEMBER);
    expect(getPlayer).toHaveBeenCalledWith(UID);
    expect(gameApi.getPlayer).not.toHaveBeenCalled();
  });

  test("charges an Officer as an Officer", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } }, USER_ID, [OFFICER_ROLE_ID]);
    const { context, gameApi } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await handlePlayer(interaction, context);

    expect(gameApi.chargedTo).toHaveBeenCalledWith({ memberId: USER_ID, officer: true });
  });

  test("refuses privately after the placeholder, with no card, when the Daily Allowance is spent", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context } = refusingPlayerContext();

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: REFUSAL_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

describe("handlePlayer by name charges the Member who ran the command", () => {
  test("asks the charged view of that Member for the Player by name and Kingdom", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "Vex" }, integers: { kingdom: 330 } });
    const { context, gameApi, findPlayer } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await handlePlayer(interaction, context);

    expect(gameApi.chargedTo).toHaveBeenCalledWith(MEMBER);
    expect(findPlayer).toHaveBeenCalledWith(playerName("Vex"), kingdom.value);
    expect(gameApi.findPlayer).not.toHaveBeenCalled();
  });

  test("refuses privately after the placeholder, with no card, when the Daily Allowance is spent", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "Vex" } });
    const { context } = refusingPlayerContext();

    await handlePlayer(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: REFUSAL_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

describe("handleAlliance by tag charges the Member who ran the command", () => {
  test("asks the charged view of that Member for the Alliance of the Kingdom and tag", async () => {
    const interaction = new FakeLookupInteraction({ strings: { tag: "NML" }, integers: { kingdom: 1 } });
    const { context, gameApi, getAlliance } = allianceContextReturning({ kind: "not-found" });

    await handleAlliance(interaction, context);

    expect(gameApi.chargedTo).toHaveBeenCalledWith(MEMBER);
    expect(getAlliance).toHaveBeenCalledWith(kingdomOne, allianceKey("NML"));
    expect(gameApi.getAlliance).not.toHaveBeenCalled();
  });

  test("refuses privately after the placeholder, with no card, when the Daily Allowance is spent", async () => {
    const interaction = new FakeLookupInteraction({ strings: { tag: "NML" }, integers: { kingdom: 1 } });
    const { context } = refusingAllianceContext();

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: REFUSAL_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

describe("handleAlliance by full name charges the Member who ran the command", () => {
  test("asks the charged view of that Member for the Alliance by its full name", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } });
    const { context, gameApi, findAlliance } = allianceContextReturning({ kind: "not-found" });

    await handleAlliance(interaction, context);

    expect(gameApi.chargedTo).toHaveBeenCalledWith(MEMBER);
    expect(findAlliance).toHaveBeenCalledWith(allianceKey("No Man's Land"));
    expect(gameApi.findAlliance).not.toHaveBeenCalled();
  });

  test("refuses privately after the placeholder, with no card, when the Daily Allowance is spent", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } });
    const { context } = refusingAllianceContext();

    await handleAlliance(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      { method: "deleteReply" },
      {
        method: "followUp",
        options: {
          content: REFUSAL_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });
});

const OFFICER: LookupCaller = { memberId: USER_ID, officer: true };

describe("handlePlayer shows the usage line, read after the request", () => {
  test("shows 5 of 14 on an uncached card, because the usage is read after the request that was just made", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context, gameApi, usage } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });
    gameApi.charged.getPlayer.mockImplementation(() => {
      usage.used += 1;
      return Promise.resolve({ kind: "found", value: player, fetchedAt: FETCHED_AT });
    });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "editReply",
      options: expect.objectContaining({
        embeds: [
          expect.objectContaining({
            footer: { text: `Data from Last Asylum Tracker · as of 15:20 UTC · ${usageLineFor(MEMBER, 5)}` },
          }),
        ],
      }) as unknown,
    });
  });

  test("shows the count of the Member, not of the Officers, to an Officer, who is not limited", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } }, USER_ID, [OFFICER_ROLE_ID]);
    const { context, usage } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await handlePlayer(interaction, context);

    expect(usage.usage).toHaveBeenCalledWith(OFFICER);
    expect(interaction.calls).toContainEqual({
      method: "editReply",
      options: expect.objectContaining({
        embeds: [
          expect.objectContaining({
            footer: { text: `Data from Last Asylum Tracker · as of 15:20 UTC · ${usageLineFor(OFFICER, FAKE_USED_BEFORE)}` },
          }),
        ],
      }) as unknown,
    });
  });

  test("adds the line after the text of a not-found reply, counting the uncached request just made", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context, gameApi, usage } = contextReturning({ kind: "not-found" });
    gameApi.charged.getPlayer.mockImplementation(() => {
      usage.used += 1;
      return Promise.resolve({ kind: "not-found" });
    });

    await handlePlayer(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: {
        content: `No player has the uid 145563254785.\n${usageLineFor(MEMBER, 5)}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
  });
});

describe("handleAlliance shows the usage line on the Alliance card, read after the request", () => {
  test("shows 5 of 14 in the card footer after an uncached request", async () => {
    const interaction = new FakeLookupInteraction({ strings: { tag: "NML" }, integers: { kingdom: 1 } });
    const { context, gameApi, usage } = allianceContextReturning({
      kind: "found",
      value: alliance,
      fetchedAt: FETCHED_AT,
    });
    gameApi.charged.getAlliance.mockImplementation(() => {
      usage.used += 1;
      return Promise.resolve({ kind: "found", value: alliance, fetchedAt: FETCHED_AT });
    });

    await handleAlliance(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "editReply",
      options: expect.objectContaining({
        embeds: [
          expect.objectContaining({
            footer: { text: `Data from Last Asylum Tracker · as of 15:20 UTC · ${usageLineFor(MEMBER, 5)}` },
          }),
        ],
      }) as unknown,
    });
  });
});

describe("handlePlayer when the usage line cannot be read", () => {
  test("shows the Player card without the usage line, and logs the failure", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const { context, logged } = contextReturning({ kind: "found", value: player, fetchedAt: FETCHED_AT });

    await expect(handlePlayer(interaction, { ...context, usage: unreadableUsage })).resolves.toBeUndefined();

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
    expect(logged).toEqual([expect.stringContaining(UNREADABLE_USAGE_MESSAGE)]);
  });

  test("removes the placeholder and tells the caller it is unavailable, without the usage line, when the lookup also failed", async () => {
    const interaction = new FakeLookupInteraction({ strings: { uid: UID } });
    const logged: string[] = [];
    const gameApi = new FakeGameApi();
    gameApi.charged.getPlayer.mockImplementation(() => Promise.reject(new Error("tracker connection reset")));
    const context = {
      gameApi,
      pickSessions: pickSessionsSpy(),
      now: () => NOW,
      logError: (message: string) => {
        logged.push(message);
      },
      officerRoleIds: [OFFICER_ROLE_ID],
      allowance: () => ALLOWANCE,
      usage: unreadableUsage,
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
    expect(logged).toEqual(
      expect.arrayContaining([
        expect.stringContaining("tracker connection reset"),
        expect.stringContaining(UNREADABLE_USAGE_MESSAGE),
      ]),
    );
  });
});
