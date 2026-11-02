import {
  ComponentType,
  MessageFlags,
  type APIButtonComponentWithCustomId,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";
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
import { FakePickInteraction, type PickCall } from "./__fakes__/pick-interaction.js";
import { lookupMessages, renderAllianceComponents } from "./lookup-cards.js";
import { renderOverview } from "./overview-texts.js";
import { handleOverview, handlePick, type PickContext } from "./pick.js";
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
  kingdom: undefined,
  sanctuaryLevel: undefined,
  weeklyActivity: undefined,
  dailyHonor: undefined,
  dailyTech: undefined,
  online: undefined,
  lastOnlineAt: undefined,
}));

/** The Player the roster pick on member 01 gives. */
const memberOne: Player = {
  uid: uid("100000000001"),
  name: "M01",
  kingdom: kingdomNumber(1),
  power: 5000,
  sanctuaryLevel: 10,
  alliance: { tag: "NML", name: "No Man's Land", leaderUid: undefined },
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
  return sessions.open(OWNER_ID, { kind: "roster", entries: ROSTER, alliance: allianceNmx, fetchedAt: OPENED_AT }, OPENED_AT);
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
          components: renderAllianceComponents(allianceNmx, 1, pickId),
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
      new FakePickInteraction({ customId: `pick:${pickId}:select:1`, userId: OWNER_ID, values: ["0"] }),
      context,
    );

    expect(getPlayer).toHaveBeenCalledWith(uid("100000000025"), "lookup");
  });

  test("updates the Alliance card to list the members of the page turned to, not the page before", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FakePickInteraction({ customId: `pick:${pickId}:page:1`, userId: OWNER_ID });
    const { context } = contextWith(sessions, { kind: "not-found" });

    await handlePick(interaction, context);

    const updatedEmbeds = interaction.calls.flatMap((call) =>
      call.method === "update" ? (call.options.embeds ?? []) : [],
    );
    const listed = JSON.stringify(updatedEmbeds);
    expect(updatedEmbeds).toHaveLength(1);
    expect(listed).toContain("M25");
    expect(listed).toContain("M29");
    expect(listed).not.toContain("M01");
    expect(listed).not.toContain("M24");
    expect(listed).not.toContain("100000000025");
    expect(listed).not.toContain("100000000029");
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
      customId: `pick:${pickId}:select:0`,
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
      customId: `pick:${pickId}:select:0`,
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
      customId: `pick:${pickId}:select:0`,
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
        components: renderAllianceComponents(allianceNmx, 0, NEW_PICK_ID),
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

    expect(open).toHaveBeenCalledWith(
      OWNER_ID,
      { kind: "roster", entries: sortRoster(ROSTER), alliance: allianceNmx, fetchedAt: NOW },
      NOW,
    );
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

describe("handlePick for a roster menu's page named in its custom id", () => {
  test("picks the member of the page the menu shows, not the page the roster was last turned to", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const { context, getPlayer } = contextWith(sessions, { kind: "found", value: memberOne, fetchedAt: NOW });

    await handlePick(new FakePickInteraction({ customId: `pick:${pickId}:page:1`, userId: OWNER_ID }), context);
    await handlePick(
      new FakePickInteraction({ customId: `pick:${pickId}:select:0`, userId: OWNER_ID, values: ["0"] }),
      context,
    );

    expect(getPlayer).toHaveBeenCalledWith(uid("100000000000"), "lookup");
  });
});

/** A select-menu interaction whose public card cannot be posted: the attempt is recorded, then refused. */
class CardRefusedInteraction extends FakePickInteraction {
  override followUp(options: InteractionReplyOptions): Promise<void> {
    if (options.flags === MessageFlags.Ephemeral) return super.followUp(options);
    this.calls.push({ method: "followUp", options });
    return Promise.reject(new Error("Discord refused the card"));
  }
}

describe("handlePick for the owner choosing a close Known Alliance", () => {
  test("resolves the pick to the match shown at that index, when the close matches are not alphabetical", async () => {
    const sessions = new PickSessions();
    const pickId = sessions.open(
      OWNER_ID,
      {
        kind: "alliances",
        matches: [
          { tag: "WLF", name: "Wolfpack", kingdom: 330 },
          { tag: "BWC", name: "Big Wolf Clan", kingdom: 330 },
        ],
      },
      OPENED_AT,
    );
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["0"],
    });
    const { context, getAlliance } = contextWith(sessions, { kind: "not-found" }, NOW, {
      kind: "found",
      value: allianceNmx,
      fetchedAt: NOW,
    });

    await handlePick(interaction, context);

    expect(getAlliance).toHaveBeenCalledTimes(1);
    expect(getAlliance).toHaveBeenCalledWith(kingdomNumber(330), allianceKey("WLF"), "lookup");
  });

  test("looks the Alliance up by its tag in the Home Kingdom, for the lookup, with one request", async () => {
    const sessions = new PickSessions();
    const pickId = sessions.open(
      OWNER_ID,
      { kind: "alliances", matches: [{ tag: "NML", name: "No Man's Land", kingdom: 330 }] },
      OPENED_AT,
    );
    const interaction = new FakePickInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["0"],
    });
    const { context, getAlliance } = contextWith(sessions, { kind: "not-found" }, NOW, {
      kind: "found",
      value: allianceNmx,
      fetchedAt: NOW,
    });

    await handlePick(interaction, context);

    expect(getAlliance).toHaveBeenCalledTimes(1);
    expect(getAlliance).toHaveBeenCalledWith(kingdomNumber(330), allianceKey("NML"), "lookup");
  });
});

describe("handlePick when the public card cannot be posted after the menu said what is shown", () => {
  test("tells the owner privately that lookups are not working, and logs the failure", async () => {
    const sessions = new PickSessions();
    const pickId = openPickList(sessions);
    const interaction = new CardRefusedInteraction({
      customId: `pick:${pickId}:select`,
      userId: OWNER_ID,
      values: ["1"],
    });
    const { context, logged } = contextWith(sessions, { kind: "found", value: drLol, fetchedAt: NOW });

    await handlePick(interaction, context);

    expect(interaction.calls.map((call) => call.method)).toEqual(["update", "followUp", "followUp"]);
    expect(interaction.calls.at(-1)).toEqual({
      method: "followUp",
      options: {
        content: "Lookups are not working right now. Please tell an Officer.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    expect(logged.some((line) => line.includes("Discord refused the card"))).toBe(true);
  });
});

const THIRD_MEMBER_ID = "310000000000000003";
const UNKNOWN_SESSION_ID = "deadbeef";

/** The Overview button of an Alliance card under a pick session; its custom id is what a press carries. */
function overviewButtonOf(sessionId: string, alliance: Alliance): APIButtonComponentWithCustomId {
  const button = renderAllianceComponents(alliance, 0, sessionId)
    .flatMap((row) => row.components)
    .find(
      (component): component is APIButtonComponentWithCustomId =>
        component.type === ComponentType.Button && "custom_id" in component && component.label === "Overview",
    );
  if (button === undefined) throw new Error("the Alliance card has no Overview button");
  return button;
}

/** The id of the Alliance Overview a private reply opened, read from the page 2 button it carries. */
function overviewIdIn(calls: readonly PickCall[]): string {
  const match = /overview:([0-9a-f]+):1"/.exec(JSON.stringify(calls));
  if (match?.[1] === undefined) throw new Error("the reply carries no Overview page button");
  return match[1];
}

/** A Member presses the Overview button of the card under the pick session, and the overview's id is returned. */
async function pressOverview(context: PickContext, pickId: string, userId: string): Promise<string> {
  const press = new FakePickInteraction({ customId: overviewButtonOf(pickId, allianceNmx).custom_id, userId });
  await handlePick(press, context);
  return overviewIdIn(press.calls);
}

describe("handlePick for the Overview button of an Alliance card while its pick session holds the Alliance", () => {
  test("replies privately with the Alliance Overview to any Member, asking the Game API for nothing", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FakePickInteraction({
      customId: overviewButtonOf(pickId, allianceNmx).custom_id,
      userId: OTHER_MEMBER_ID,
    });
    const { context, getAlliance, getPlayer } = contextWith(sessions, { kind: "not-found" });

    await handlePick(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "reply",
        options: expect.objectContaining({
          embeds: renderOverview(allianceNmx, OPENED_AT, NOW, pickId, 0).embeds,
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        }) as unknown,
      },
    ]);
    expect(getAlliance).not.toHaveBeenCalled();
    expect(getPlayer).not.toHaveBeenCalled();
  });
});

describe("handlePick for the Overview button of an Alliance card whose pick session is gone", () => {
  test("looks the Alliance up again by its Kingdom and tag, for the lookup, then replies privately with the Alliance Overview", async () => {
    const sessions = new PickSessions();
    const interaction = new FakePickInteraction({
      customId: overviewButtonOf(UNKNOWN_SESSION_ID, allianceNmx).custom_id,
      userId: OTHER_MEMBER_ID,
    });
    const { context, getAlliance, getPlayer } = contextWith(sessions, { kind: "not-found" }, NOW, {
      kind: "found",
      value: allianceNmx,
      fetchedAt: NOW,
    });

    await handlePick(interaction, context);

    expect(getAlliance).toHaveBeenCalledTimes(1);
    expect(getAlliance).toHaveBeenCalledWith(kingdomNumber(2), allianceKey("NMX"), "lookup");
    expect(getPlayer).not.toHaveBeenCalled();
    expect(interaction.calls).toEqual([
      {
        method: "deferReply",
        options: expect.objectContaining({ flags: MessageFlags.Ephemeral }) as unknown,
      },
      {
        method: "editReply",
        options: expect.objectContaining({
          embeds: renderOverview(allianceNmx, NOW, NOW, UNKNOWN_SESSION_ID, 0).embeds,
        }) as unknown,
      },
    ]);
  });

  test("tells the Member privately to try again, and shows no overview, when the lookup gives try-again", async () => {
    const sessions = new PickSessions();
    const interaction = new FakePickInteraction({
      customId: overviewButtonOf(UNKNOWN_SESSION_ID, allianceNmx).custom_id,
      userId: OTHER_MEMBER_ID,
    });
    const { context } = contextWith(sessions, { kind: "not-found" }, NOW, { kind: "try-again" });

    await handlePick(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: {
        content: lookupMessages.tryAgain,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    expect(interaction.calls.filter((call) => call.method === "editReply")).toEqual([]);
  });
});

describe("handleOverview page buttons of an Alliance Overview", () => {
  test("turns the private overview to the page pressed, for the Member who opened it", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const { context } = contextWith(sessions, { kind: "not-found" });
    const overviewId = await pressOverview(context, pickId, OTHER_MEMBER_ID);
    const interaction = new FakePickInteraction({ customId: `overview:${overviewId}:1`, userId: OTHER_MEMBER_ID });

    await handleOverview(interaction, context);

    expect(interaction.calls).toEqual([
      {
        method: "update",
        options: expect.objectContaining({
          embeds: renderOverview(allianceNmx, OPENED_AT, NOW, overviewId, 1).embeds,
        }) as unknown,
      },
    ]);
  });

  test("tells another Member privately that the page is not theirs, and changes nothing", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const { context } = contextWith(sessions, { kind: "not-found" });
    const overviewId = await pressOverview(context, pickId, OTHER_MEMBER_ID);
    const interaction = new FakePickInteraction({ customId: `overview:${overviewId}:1`, userId: THIRD_MEMBER_ID });

    await handleOverview(interaction, context);

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
  });
});

/** A press whose first reply Discord refuses; the later calls are answered. The refused attempt is recorded. */
class FirstReplyRefusedInteraction extends FakePickInteraction {
  private refusals = 0;

  override reply(options: InteractionReplyOptions): Promise<void> {
    if (this.refusals > 0) return super.reply(options);
    this.refusals += 1;
    this.calls.push({ method: "reply", options });
    return Promise.reject(new Error("Discord refused the reply"));
  }
}

/** A page turn whose first update Discord refuses; the later calls are answered. The refused attempt is recorded. */
class FirstUpdateRefusedInteraction extends FakePickInteraction {
  private refusals = 0;

  override update(options: InteractionUpdateOptions): Promise<void> {
    if (this.refusals > 0) return super.update(options);
    this.refusals += 1;
    this.calls.push({ method: "update", options });
    return Promise.reject(new Error("Discord refused the update"));
  }
}

describe("handlePick for the Overview button when Discord refuses the reply", () => {
  test("answers the press privately that the Alliance Overview is unavailable, and logs the refusal", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const interaction = new FirstReplyRefusedInteraction({
      customId: overviewButtonOf(pickId, allianceNmx).custom_id,
      userId: OTHER_MEMBER_ID,
    });
    const { context, logged } = contextWith(sessions, { kind: "not-found" });

    await handlePick(interaction, context);

    expect(interaction.calls.map((call) => call.method)).toEqual(["reply", "reply"]);
    expect(interaction.calls.at(-1)).toEqual({
      method: "reply",
      options: {
        content: lookupMessages.unavailable,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    expect(logged.some((line) => line.includes("Discord refused the reply"))).toBe(true);
  });
});

describe("handleOverview when Discord refuses the page turn", () => {
  test("answers the press privately that the Alliance Overview is unavailable, and logs the refusal", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const { context, logged } = contextWith(sessions, { kind: "not-found" });
    const overviewId = await pressOverview(context, pickId, OTHER_MEMBER_ID);
    const interaction = new FirstUpdateRefusedInteraction({
      customId: `overview:${overviewId}:1`,
      userId: OTHER_MEMBER_ID,
    });

    await handleOverview(interaction, context);

    expect(interaction.calls.map((call) => call.method)).toEqual(["update", "reply"]);
    expect(interaction.calls.at(-1)).toEqual({
      method: "reply",
      options: {
        content: lookupMessages.unavailable,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    expect(logged.some((line) => line.includes("Discord refused the update"))).toBe(true);
  });
});

describe("handlePick for the Overview button of an Alliance card while its pick session is gone, and the lookup is ambiguous", () => {
  test("tells the Member privately to try again, with no pick list, when the lookup finds several Alliances", async () => {
    const sessions = new PickSessions();
    const interaction = new FakePickInteraction({
      customId: overviewButtonOf(UNKNOWN_SESSION_ID, allianceNmx).custom_id,
      userId: OTHER_MEMBER_ID,
    });
    const { context } = contextWith(sessions, { kind: "not-found" }, NOW, {
      kind: "ambiguous",
      matches: ALLIANCE_MATCHES,
    });

    await handlePick(interaction, context);

    expect(interaction.calls).toContainEqual({
      method: "followUp",
      options: {
        content: lookupMessages.tryAgain,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      },
    });
    expect(interaction.calls.filter((call) => call.method === "followUp" && call.options.components !== undefined)).toEqual(
      [],
    );
  });
});

describe("handlePick for the Overview button of an Alliance card, pressed again by one Member", () => {
  test("gives the same Alliance Overview id to every press by that Member under the same card", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const { context } = contextWith(sessions, { kind: "not-found" });

    const first = await pressOverview(context, pickId, OTHER_MEMBER_ID);
    const second = await pressOverview(context, pickId, OTHER_MEMBER_ID);

    expect(second).toBe(first);
  });

  test("does not evict the card's own pick list, so its roster menu still turns the page", async () => {
    const sessions = new PickSessions();
    const pickId = openRoster(sessions);
    const { context } = contextWith(sessions, { kind: "not-found" });
    const pressCustomId = overviewButtonOf(pickId, allianceNmx).custom_id;

    for (let press = 0; press < 600; press += 1) {
      await handlePick(new FakePickInteraction({ customId: pressCustomId, userId: OTHER_MEMBER_ID }), context);
    }
    const turn = new FakePickInteraction({ customId: `pick:${pickId}:page:1`, userId: OWNER_ID });
    await handlePick(turn, context);

    expect(turn.calls.map((call) => call.method)).toEqual(["update"]);
  });
});
