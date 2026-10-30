import { MessageFlags } from "discord.js";
import { describe, expect, test, vi } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { LookupResult, Match, Player } from "../domain/player.js";
import { FakePickInteraction } from "./__fakes__/pick-interaction.js";
import { handlePick } from "./pick.js";
import { PickSessions } from "./pick-sessions.js";

const OWNER_ID = "310000000000000001";
const OTHER_MEMBER_ID = "310000000000000002";
const OPENED_AT = new Date("2026-10-30T16:00:00Z");
const NOW = new Date("2026-10-30T16:05:00Z");
const FIFTEEN_MINUTES_LATER = new Date("2026-10-30T16:15:00Z");

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

/** A context over a real pick list store and a fake Game API that answers every Player lookup with the result. */
function contextWith(sessions: PickSessions, result: LookupResult<Player>, now: Date = NOW) {
  const logged: string[] = [];
  const getPlayer = vi.fn<(uid: Uid, purpose: RequestPurpose) => Promise<LookupResult<Player>>>(() =>
    Promise.resolve(result),
  );
  const context = {
    gameApi: { getPlayer },
    pickSessions: sessions,
    now: () => now,
    logError: (message: string) => {
      logged.push(message);
    },
  };
  return { context, getPlayer, logged };
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
