import { MessageFlags } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import { sortRoster } from "../domain/alliance-rank.js";
import type { RequestPurpose } from "../domain/daily-quota.js";
import {
  parseAllianceKey,
  parseKingdom,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type Uid,
} from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player, RosterEntry } from "../domain/player.js";
import { FakePickInteraction } from "./__fakes__/pick-interaction.js";
import { renderRosterComponents } from "./lookup-cards.js";
import { handlePick } from "./pick.js";
import { PickSessions } from "./pick-sessions.js";

const OWNER_ID = "310000000000000001";
const OTHER_MEMBER_ID = "310000000000000002";
const OPENED_AT = new Date("2026-10-30T16:00:00Z");
const NOW = new Date("2026-10-30T16:05:00Z");
const FIFTEEN_MINUTES_LATER = new Date("2026-10-30T16:15:00Z");
const RESETS_AT = new Date("2026-10-31T00:00:00Z");

const NOT_OWNER_TEXT =
  "Only the Member who ran this command can use this menu. Run /player or /alliance yourself.";
const EXPIRED_TEXT = "This menu has expired. Run the command again.";

function uid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid "${text}" is not a valid uid`);
  return parsed.value;
}

function kingdomNumber(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} is not valid`);
  return parsed.value;
}

/** The Player matches the pick list offers, already in the order it shows them. */
const LISTED_MATCHES: readonly Match[] = [
  { uid: "145563254785", name: "DrLOL", kingdom: 12 },
  { uid: "93159425", name: "DrLOL", kingdom: 330 },
];

const drLol: Player = {
  uid: uid("93159425"),
  name: "DrLOL",
  kingdom: kingdomNumber(330),
  power: 15902728,
  sanctuaryLevel: 42,
  alliance: undefined,
  allianceRank: undefined,
};

/** Opens the pick list for the owner, as the lookup does, and returns its id. */
function openPickList(sessions: PickSessions): string {
  return sessions.open(OWNER_ID, { kind: "players", matches: LISTED_MATCHES }, OPENED_AT);
}

/**
 * A context over a real pick list store and a fake Game API: every Player lookup gives the result, every Alliance
 * lookup the alliance result (not found, unless the test says otherwise).
 */
function contextWith(
  sessions: PickSessions,
  result: LookupResult<Player>,
  now: Date = NOW,
  allianceResult: LookupResult<Alliance> = { kind: "not-found" },
) {
  const logged: string[] = [];
  const getPlayer = vi.fn<(uid: Uid, purpose: RequestPurpose) => Promise<LookupResult<Player>>>(() =>
    Promise.resolve(result),
  );
  const getAlliance = vi.fn<(kingdom: KingdomNumber, key: AllianceKey, purpose: RequestPurpose) => Promise<LookupResult<Alliance>>>(
    () => Promise.resolve(allianceResult),
  );
  const context = {
    gameApi: { getPlayer, getAlliance },
    pickSessions: sessions,
    now: () => now,
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, getPlayer, getAlliance, logged };
}

describe("handlePick for a Member who did not open the pick list", () => {
  test("answers privately that only the caller can use the menu, without asking the Game API", async () => {
    const sessions = new PickSessions();
    const pickId = openPickList(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OTHER_MEMBER_ID,
      values: ["1"],
    });
    const { context, getPlayer } = contextWith(sessions, { kind: "found", value: drLol, fetchedAt: NOW });

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "reply",
        options: {
          content: NOT_OWNER_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(getPlayer).not.toHaveBeenCalled();
  });
});

describe("handlePick for a pick list that is no longer open", () => {
  test.each([
    {
      label: "older than 15 minutes",
      customId: (sessionId: string): string => `pick:${sessionId}:select`,
      now: FIFTEEN_MINUTES_LATER,
    },
    {
      label: "unknown",
      customId: (): string => "pick:deadbeef:select",
      now: NOW,
    },
    {
      label: "a pick: custom id that cannot be read",
      customId: (sessionId: string): string => `pick:${sessionId}`,
      now: NOW,
    },
  ])("answers privately that the menu has expired, for a pick list $label, without asking the Game API", async ({
    customId,
    now,
  }) => {
    const sessions = new PickSessions();
    const pickId = openPickList(sessions);
    const interaction = new FakePickInteraction({
      customId: customId(pickId),
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context, getPlayer } = contextWith(sessions, { kind: "found", value: drLol, fetchedAt: now }, now);

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "reply",
        options: {
          content: EXPIRED_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(getPlayer).not.toHaveBeenCalled();
  });
});

describe("handlePick for the owner choosing a Player match", () => {
  test("asks the Game API for the Player at the chosen index of the pick list, by uid, for the lookup", async () => {
    const sessions = new PickSessions();
    const pickId = openPickList(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context, getPlayer } = contextWith(sessions, { kind: "found", value: drLol, fetchedAt: NOW });

    await handlePick(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(uid("93159425"), "lookup");
  });

  test("updates the private menu to say what is shown, without components, then posts the Player card publicly", async () => {
    const sessions = new PickSessions();
    const pickId = openPickList(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context } = contextWith(sessions, { kind: "found", value: drLol, fetchedAt: NOW });

    await handlePick(interaction, context);

    expect(interaction.calls.map((call) => call.method)).toEqual(["update", "followUp"]);
    expect(interaction.calls).toContainEqual({
      method: "update",
      options: expect.objectContaining({
        content: "Showing DrLOL · kingdom #330.",
        components: [],
      }) as unknown,
    });
    const followUp = interaction.calls.find((call) => call.method === "followUp");
    expect(followUp).toEqual({
      method: "followUp",
      options: expect.objectContaining({
        embeds: [expect.objectContaining({ title: "DrLOL" })],
      }) as unknown,
    });
    expect(followUp?.method === "followUp" && followUp.options.flags).not.toBe(MessageFlags.Ephemeral);
  });

  test("tells the caller privately, with the uid text, when the tracker has no such Player", async () => {
    const sessions = new PickSessions();
    const pickId = openPickList(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context } = contextWith(sessions, { kind: "not-found" }, NOW);

    await handlePick(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: {
        content: "No player has the uid 93159425.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    const publicPosts = interaction.calls.filter(
      (call) => call.method === "followUp" && call.options.flags !== MessageFlags.Ephemeral,
    );
    expect(publicPosts).toEqual([]);
  });
});

function allianceKey(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test Alliance key "${text}" is not valid`);
  return parsed.value;
}

const NEW_PICK_ID = "b2c3d4e5";

/** Thirty members of one Alliance, in the order the roster menu shows them: two pages. */
const ROSTER: readonly RosterEntry[] = Array.from({ length: 30 }, (_value, index) => ({
  uid: uid((100_000_000_000 + index).toString()),
  name: `M${index.toString().padStart(2, "0")}`,
  allianceRank: "R4",
}));

/** The Player the roster pick on member 01 gives. */
const memberOne: Player = {
  uid: uid("100000000001"),
  name: "M01",
  kingdom: kingdomNumber(1),
  power: 5000,
  sanctuaryLevel: 10,
  alliance: { tag: "NML", name: "No Man's Land" },
  allianceRank: "R4",
};

/** The Alliance a pick from the Alliance pick list gives: NMX in Kingdom 2, with the roster above. */
const allianceNmx: Alliance = {
  tag: "NMX",
  name: "No Man's Land",
  kingdom: kingdomNumber(2),
  power: 208815434,
  memberCount: 30,
  capacity: 100,
  leaderName: "M00",
  roster: ROSTER,
};

/** The Alliance pick list the lookup opens for an ambiguous tag: already in the order it shows them. */
const ALLIANCE_MATCHES: readonly Match[] = [
  { tag: "NML", name: "No Man's Land", kingdom: 1 },
  { tag: "NMX", name: "No Man's Land", kingdom: 2 },
];

function openRoster(sessions: PickSessions): string {
  return sessions.open(OWNER_ID, { kind: "roster", entries: ROSTER }, OPENED_AT);
}

function openAlliances(sessions: PickSessions): string {
  return sessions.open(OWNER_ID, { kind: "alliances", matches: ALLIANCE_MATCHES }, OPENED_AT);
}

describe("handlePick page buttons of a roster", () => {
  test("updates the message to the roster menu of that page, without asking the Game API", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:page:1`,
      userId: OWNER_ID,
    });
    const { context, getPlayer, getAlliance } = contextWith(sessions, { kind: "not-found" });

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "update",
        options: expect.objectContaining({
          components: renderRosterComponents(ROSTER, 1, pickId),
        }) as unknown,
      },
    ]);
    expect(getPlayer).not.toHaveBeenCalled();
    expect(getAlliance).not.toHaveBeenCalled();
  });

  test("makes the roster picks that follow index into the page turned to", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const { context, getPlayer } = contextWith(sessions, { kind: "found", value: memberOne, fetchedAt: NOW });

    await handlePick(new FakePickInteraction({ customId: `pick:${pickId}:page:1`, userId: OWNER_ID }), context);
    await handlePick(
      new FakePickInteraction({ customId: `pick:${pickId}:select`, userId: OWNER_ID, values: ["0"] }),
      context,
    );

    expect(getPlayer).toHaveBeenCalledWith(uid("100000000025"), "lookup");
  });
});

describe("handlePick from a Member who did not open a roster or Alliance pick list", () => {
  test("answers a page button privately with the owner text, changes no page and updates nothing", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:page:1`,
      userId: OTHER_MEMBER_ID,
    });
    const { context } = contextWith(sessions, { kind: "not-found" });

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "reply",
        options: {
          content: NOT_OWNER_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(sessions.get(pickId, NOW)).toMatchObject({ page: 0 });
  });

  test("answers a roster pick privately with the owner text, without asking the Game API", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OTHER_MEMBER_ID,
      values: ["1"],
    });
    const { context, getPlayer } = contextWith(sessions, { kind: "found", value: memberOne, fetchedAt: NOW });

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "reply",
        options: {
          content: NOT_OWNER_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(getPlayer).not.toHaveBeenCalled();
  });

  test("answers an Alliance pick list pick privately with the owner text, without asking the Game API", async () => {
    const sessions = new PickSessions();
    const pickId = openAlliances(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OTHER_MEMBER_ID,
      values: ["1"],
    });
    const { context, getAlliance } = contextWith(sessions, { kind: "not-found" });

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "reply",
        options: {
          content: NOT_OWNER_TEXT,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        },
      },
    ]);
    expect(getAlliance).not.toHaveBeenCalled();
  });
});

describe("handlePick for the owner choosing a roster member", () => {
  test("defers publicly, then posts the Player card as the reply and leaves the Alliance card as it is", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context } = contextWith(sessions, { kind: "found", value: memberOne, fetchedAt: NOW });

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      { method: "deferReply" },
      {
        method: "editReply",
        options: expect.objectContaining({
          embeds: [expect.objectContaining({ title: "M01" })],
        }) as unknown,
      },
    ]);
  });

  test("asks the Game API for the picked member by uid, for the lookup", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context, getPlayer } = contextWith(sessions, { kind: "found", value: memberOne, fetchedAt: NOW });

    await handlePick(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(uid("100000000001"), "lookup");
  });
});

describe("handlePick for the owner choosing an Alliance match", () => {
  test("updates the private menu to say what is shown, without components, then posts the Alliance card publicly with its roster menu", async () => {
    const sessions = new PickSessions();
    const pickId = openAlliances(sessions);
    vi.spyOn(sessions, "open").mockReturnValue(NEW_PICK_ID);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context, getAlliance } = contextWith(sessions, { kind: "not-found" }, NOW, {
      kind: "found",
      value: allianceNmx,
      fetchedAt: NOW,
    });

    await handlePick(interaction, context);

    expect(getAlliance).toHaveBeenCalledWith(kingdomNumber(2), allianceKey("NMX"), "lookup");
    expect(interaction.calls.map((call) => call.method)).toEqual(["update", "followUp"]);
    expect(interaction.calls[0]).toEqual({
      method: "update",
      options: expect.objectContaining({
        content: "Showing [NMX] No Man's Land · kingdom #2.",
        components: [],
      }) as unknown,
    });
    expect(interaction.calls[1]).toEqual({
      method: "followUp",
      options: expect.objectContaining({
        embeds: [expect.objectContaining({ title: "[NMX] No Man's Land" })],
        components: renderRosterComponents(sortRoster(ROSTER), 0, NEW_PICK_ID),
      }) as unknown,
    });
    const followUp = interaction.calls[1];
    expect(followUp?.method === "followUp" && followUp.options.flags).not.toBe(MessageFlags.Ephemeral);
  });

  test("opens a roster pick list for the caller, sorted, when the Alliance card has a roster", async () => {
    const sessions = new PickSessions();
    const pickId = openAlliances(sessions);
    const open = vi.spyOn(sessions, "open").mockReturnValue(NEW_PICK_ID);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context } = contextWith(sessions, { kind: "not-found" }, NOW, {
      kind: "found",
      value: allianceNmx,
      fetchedAt: NOW,
    });

    await handlePick(interaction, context);

    expect(open).toHaveBeenCalledWith(OWNER_ID, { kind: "roster", entries: sortRoster(ROSTER) }, NOW);
  });
});

describe("handlePick when the Quota Reserve is kept for Onboarding Interviews", () => {
  const RESERVE_TEXT =
    "Lookups are paused for today: the rest of the Daily Quota is kept for interviewing new members. They work again at 00:00 UTC (in 7 h 55 min).";

  test("tells the owner privately, with the reserve text, when a Player match is kept by the reserve", async () => {
    const sessions = new PickSessions();
    const pickId = openPickList(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context } = contextWith(sessions, { kind: "reserve-kept", resetsAt: RESETS_AT });

    await handlePick(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: {
        content: RESERVE_TEXT,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    const publicPosts = interaction.calls.filter(
      (call) => call.method === "followUp" && call.options.flags !== MessageFlags.Ephemeral,
    );
    expect(publicPosts).toEqual([]);
  });

  test("tells the owner privately, with the reserve text, when an Alliance match is kept by the reserve", async () => {
    const sessions = new PickSessions();
    const pickId = openAlliances(sessions);
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context } = contextWith(sessions, { kind: "not-found" }, NOW, {
      kind: "reserve-kept",
      resetsAt: RESETS_AT,
    });

    await handlePick(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: {
        content: RESERVE_TEXT,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
  });
});
