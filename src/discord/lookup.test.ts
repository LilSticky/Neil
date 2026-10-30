import { ComponentType, MessageFlags } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
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
import { FakeLookupInteraction } from "./__fakes__/lookup-interaction.js";
import { lookupMessages, renderRosterComponents } from "./lookup-cards.js";
import type { PickChoice } from "./pick-sessions.js";
import { handleAlliance, handlePlayer } from "./lookup.js";

const UID = "145563254785";
const USER_ID = "310000000000000001";
const PICK_ID = "a1b2c3d4";
const FETCHED_AT = new Date("2026-10-30T15:20:00Z");
const NOW = new Date("2026-10-30T16:00:00Z");
const RESETS_AT = new Date("2026-10-31T00:00:00Z");

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
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

type GetPlayer = (uid: Uid, purpose: RequestPurpose) => Promise<LookupResult<Player>>;
type FindPlayer = (
  name: PlayerName,
  kingdom: KingdomNumber | undefined,
  purpose: RequestPurpose,
) => Promise<LookupResult<Player>>;
type GetAlliance = (kingdom: KingdomNumber, key: AllianceKey, purpose: RequestPurpose) => Promise<LookupResult<Alliance>>;
type FindAlliance = (name: AllianceKey, purpose: RequestPurpose) => Promise<LookupResult<Alliance>>;

/** A pick list store that opens every pick list with the same id. */
function pickSessionsSpy() {
  return { open: vi.fn<(ownerId: string, choice: PickChoice, now: Date) => string>(() => PICK_ID) };
}

/** A context whose fake Game API answers every Player lookup, by uid or by name, with the given result. */
function contextReturning(result: LookupResult<Player>) {
  const logged: string[] = [];
  const getPlayer = vi.fn<GetPlayer>(() => Promise.resolve(result));
  const findPlayer = vi.fn<FindPlayer>(() => Promise.resolve(result));
  const pickSessions = pickSessionsSpy();
  const context = {
    gameApi: { getPlayer, findPlayer },
    pickSessions,
    now: () => NOW,
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, getPlayer, findPlayer, pickSessions, logged };
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

    expect(getPlayer).toHaveBeenCalledWith(UID, "lookup");
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

    expect(getPlayer).toHaveBeenCalledWith(UID, "lookup");
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

    expect(findPlayer).toHaveBeenCalledWith(playerName("Vex"), undefined, "lookup");
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

    expect(findPlayer).toHaveBeenCalledWith(playerName("Vex"), kingdom.value, "lookup");
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
          content: 'Several players are named "DrLOL". Pick one:',
          components: [
            {
              type: ComponentType.ActionRow,
              components: [
                {
                  type: ComponentType.StringSelect,
                  custom_id: `pick:${PICK_ID}:select`,
                  options: [
                    { label: "DrLOL · kingdom #12", value: "0" },
                    { label: "DrLOL · kingdom #330", value: "1" },
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
          content: text,
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
          content:
            "Couldn't find a player named \"Vex\". Check the name; if it's right, the tracker may be busy, so try again later.",
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
  roster: [],
};

/** A context whose fake Game API answers every alliance lookup, by tag or by full name, with the given result. */
function allianceContextReturning(result: LookupResult<Alliance>) {
  const logged: string[] = [];
  const getAlliance = vi.fn<GetAlliance>(() => Promise.resolve(result));
  const findAlliance = vi.fn<FindAlliance>(() => Promise.resolve(result));
  const pickSessions = pickSessionsSpy();
  const context = {
    gameApi: { getAlliance, findAlliance },
    pickSessions,
    now: () => NOW,
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, getAlliance, findAlliance, pickSessions, logged };
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

    expect(getAlliance).toHaveBeenCalledWith(kingdomOne, "NML", "lookup");
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

  test("removes the thinking placeholder, opens a private alliance pick list for the caller when the tag is ambiguous", async () => {
    const matches: readonly Match[] = [
      { tag: "NML", name: "No Man's Land", kingdom: 1 },
      { tag: "NMX", name: "No Man's Land", kingdom: 2 },
    ];
    const interaction = new FakeLookupInteraction({
      strings: { alliance: "NML" },
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
          content: 'Several alliances are named "NML". Pick one:',
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

function allianceKey(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test Alliance key "${text}" is not valid`);
  return parsed.value;
}

/** Members of the Alliance, in the order the tracker lists them; the card and the menu show them by rank. */
const rosterMembers: readonly RosterEntry[] = [
  { uid: uid("93159425"), name: "Benedict", allianceRank: "R3" },
  { uid: uid("179060285441"), name: "etranger", allianceRank: "R4" },
  { uid: uid("147744374785"), name: "Settong", allianceRank: "R1" },
];
const allianceWithRoster: Alliance = { ...alliance, roster: rosterMembers };
const sortedMembers = sortRoster(rosterMembers);

describe("handleAlliance by kingdom and tag, with a roster", () => {
  test("defers publicly, shows the card with the roster menu to everyone, and opens a roster pick list for the caller", async () => {
    const interaction = new FakeLookupInteraction(
      { strings: { alliance: "NML" }, integers: { kingdom: 1 } },
      USER_ID,
    );
    const { context, pickSessions } = allianceContextReturning({
      kind: "found",
      value: allianceWithRoster,
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "roster", entries: sortedMembers }, NOW);
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [expect.objectContaining({ title: "[NML] No Man's Land" })],
          components: renderRosterComponents(sortedMembers, 0, PICK_ID),
          allowedMentions: { parse: [] },
        },
      },
    ]);
  });

  test("shows the card without a roster menu, and opens no roster pick list, when the roster is empty", async () => {
    const interaction = new FakeLookupInteraction({ strings: { alliance: "NML" }, integers: { kingdom: 1 } });
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
  test("asks the Game API for the Alliance by its full name, for the lookup, and no Kingdom is needed", async () => {
    const interaction = new FakeLookupInteraction({ strings: { name: "No Man's Land" } });
    const { context, findAlliance, getAlliance } = allianceContextReturning({
      kind: "found",
      value: allianceWithRoster,
      fetchedAt: FETCHED_AT,
    });

    await handleAlliance(interaction, context);

    expect(findAlliance).toHaveBeenCalledWith(allianceKey("No Man's Land"), "lookup");
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

    expect(pickSessions.open).toHaveBeenCalledWith(USER_ID, { kind: "roster", entries: sortedMembers }, NOW);
    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: {
          embeds: [expect.objectContaining({ title: "[NML] No Man's Land" })],
          components: renderRosterComponents(sortedMembers, 0, PICK_ID),
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
          content: 'Several alliances are named "No Man\'s Land". Pick one:',
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
            'No alliance is named exactly "No Man\'s Land". Use the full name, or the kingdom and tag; approximate names are not supported.',
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
    { label: "a tag alone, without a Kingdom", strings: { alliance: "NML" }, integers: {} },
    { label: "a full name with a Kingdom", strings: { name: "No Man's Land" }, integers: { kingdom: 1 } },
    { label: "a full name with a tag", strings: { name: "No Man's Land", alliance: "NML" }, integers: {} },
    {
      label: "a full name, a tag and a Kingdom",
      strings: { name: "No Man's Land", alliance: "NML" },
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
    const getPlayer = vi.fn<GetPlayer>(() => Promise.reject(new Error("tracker connection reset")));
    const findPlayer = vi.fn<FindPlayer>(() => Promise.reject(new Error("tracker connection reset")));
    const context = {
      gameApi: { getPlayer, findPlayer },
      pickSessions: pickSessionsSpy(),
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
    const getAlliance = vi.fn<GetAlliance>(() => Promise.reject(new Error("tracker connection reset")));
    const findAlliance = vi.fn<FindAlliance>(() => Promise.reject(new Error("tracker connection reset")));
    const context = {
      gameApi: { getAlliance, findAlliance },
      pickSessions: pickSessionsSpy(),
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
