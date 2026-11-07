import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { ActionRowBuilder, ButtonBuilder, MessageFlags } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type BootyMode, type BootyWindow, parseBootyWindow } from "../domain/booty.js";
import type { RosterEntry } from "../domain/player.js";
import { BootyAlertsStore, type StoredBootyAlerts } from "../storage/booty-alerts-store.js";
import { openDatabase } from "../storage/database.js";
import { FakeBootyCallInteraction } from "./__fakes__/booty-call-interaction.js";
import { FakeBootyCallGameApi, FakeBootyCallLinks, rosterEntry, type RosterState } from "./__fakes__/booty-call-game.js";
import { FakeBootyCallServer } from "./__fakes__/booty-call-server.js";
import { type BootyChannel, type BootyCalls, createBootyCalls } from "./booty-call.js";
import { bootyCallMessages } from "./booty-texts.js";

const NOW = new Date("2026-11-07T12:00:00Z");
const MINUTE_MS = 60_000;

/** The caller and the other Members. Their ids are snowflake-like strings, as Discord gives them. */
const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const CAROL = "333333333333333333";
const DAVE = "444444444444444444";
const EVE = "555555555555555555";

/** Each Member's game uid: 1 to 20 digits. */
const ALICE_UID = "145563254785";
const BOB_UID = "145563254786";
const CAROL_UID = "145563254787";
const DAVE_UID = "145563254788";
const EVE_UID = "145563254789";

const NAMES: Readonly<Record<string, string>> = {
  [ALICE]: "Alice",
  [BOB]: "Bob",
  [CAROL]: "Carol",
  [DAVE]: "Dave",
  [EVE]: "Eve",
};

const NML_ROLE = "[NML]";
const ABC_ROLE = "[ABC]";

const ALLIANCE_CHAT: BootyChannel = { id: "700000000000000001", name: "alliance-chat", categoryName: NML_ROLE };
const ABC_CHAT: BootyChannel = { id: "700000000000000002", name: "alliance-chat", categoryName: ABC_ROLE };
const GENERAL: BootyChannel = { id: "700000000000000003", name: "general", categoryName: NML_ROLE };
const LOBBY_CHAT: BootyChannel = { id: "700000000000000004", name: "alliance-chat", categoryName: "Lobby" };

function windowOf(startMinute: number, endMinute: number): BootyWindow {
  const parsed = parseBootyWindow(startMinute, endMinute);
  if (!parsed.ok) throw new Error(`no Booty Alerts window from ${startMinute.toString()} to ${endMinute.toString()}`);
  return parsed.value;
}

const WHOLE_DAY = windowOf(0, 0);

/** A Member's Discord presence, as the server reports it. */
type Presence = Parameters<FakeBootyCallServer["setPresence"]>[1];

/** Booty Alerts for a mode, the whole day in UTC unless a window or time zone is given. */
function alertsOf(mode: BootyMode, timeZone = "UTC", window: BootyWindow = WHOLE_DAY): StoredBootyAlerts {
  return { mode, window, timeZone };
}

/** The custom ids of every button the answers carry, in order. Builders and their JSON are both read. */
function componentIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(componentIds);
  if (value instanceof ActionRowBuilder) return componentIds(value.components);
  if (value instanceof ButtonBuilder) return componentIds(value.toJSON());
  if (typeof value !== "object" || value === null) return [];
  if ("custom_id" in value && typeof value.custom_id === "string") return [value.custom_id];
  if ("components" in value) return componentIds(value.components);
  return [];
}

function buttonIdsOf(interaction: FakeBootyCallInteraction): string[] {
  return interaction.answers.flatMap((answer) => componentIds(answer.options.components));
}

/** The text of every answer the interaction got. */
function answerTextsOf(interaction: FakeBootyCallInteraction): string[] {
  return interaction.answers.map((answer) => answer.options.content ?? "");
}

/** Every reply and follow-up on the interaction is private: an ephemeral message. */
function expectPrivate(interaction: FakeBootyCallInteraction): void {
  for (const answer of interaction.answers) {
    if (answer.method === "reply" || answer.method === "followUp") {
      expect(answer.options.flags).toBe(MessageFlags.Ephemeral);
    }
  }
}

describe("/booty and its Booty Call", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: BootyAlertsStore;
  let links: FakeBootyCallLinks;
  let game: FakeBootyCallGameApi;
  let server: FakeBootyCallServer;
  let clock: Date;
  let logged: string[];
  let calls: BootyCalls;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-booty-call-"));
    db = openDatabase(dataDir);
    store = new BootyAlertsStore(db);
    links = new FakeBootyCallLinks();
    game = new FakeBootyCallGameApi();
    server = new FakeBootyCallServer();
    clock = NOW;
    logged = [];
    calls = createBootyCalls({
      links,
      bootyAlerts: store,
      game,
      server,
      now: () => clock,
      logError: (line: string) => {
        logged.push(line);
      },
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** A Linked Member, holding the given Managed Role names, with Booty Alerts when given. */
  function enrol(memberId: string, uid: string, roleNames: readonly string[] = [], alerts?: StoredBootyAlerts): void {
    links.link(memberId, uid);
    for (const role of roleNames) server.grantRole(role, memberId);
    if (alerts !== undefined) store.save(memberId, alerts);
  }

  /** Runs /booty for the Member in the channel, and returns the interaction that recorded the answers. */
  async function askBooty(userId: string, channel: BootyChannel = ALLIANCE_CHAT): Promise<FakeBootyCallInteraction> {
    const interaction = new FakeBootyCallInteraction({ userId, displayName: NAMES[userId] ?? "Someone", channel });
    await calls.onCommand(interaction);
    return interaction;
  }

  /** Presses a Booty Call button as the Member, in the channel given (undefined for no channel). */
  async function press(
    customId: string,
    userId: string,
    channel: BootyChannel | undefined = ALLIANCE_CHAT,
  ): Promise<FakeBootyCallInteraction> {
    const interaction = new FakeBootyCallInteraction({ userId, displayName: NAMES[userId] ?? "Someone", channel, customId });
    await calls.onButton(interaction);
    return interaction;
  }

  /** The Confirm id the /booty answer carries; the test fails when the answer has none. */
  function confirmIdOf(asked: FakeBootyCallInteraction): string {
    const confirm = buttonIdsOf(asked).find((id) => id.startsWith("booty:confirm:"));
    if (confirm === undefined) throw new Error("the /booty answer carries no Confirm button");
    return confirm;
  }

  /** /booty, then Confirm, by the Member in the channel: one Booty Call. */
  async function bootyCallBy(userId: string, channel: BootyChannel = ALLIANCE_CHAT): Promise<FakeBootyCallInteraction> {
    const asked = await askBooty(userId, channel);
    return press(confirmIdOf(asked), userId, channel);
  }

  /** The Members a post mentions, as its allowedMentions.users. */
  function mentionedBy(postIndex = 0): string[] {
    const post = server.posts[postIndex];
    if (post === undefined) throw new Error(`no post number ${postIndex.toString()}`);
    return [...(post.message.allowedMentions?.users ?? [])];
  }

  /** The link of the first card; the test fails when no card was posted. */
  function cardLink(): string {
    const card = server.posts[0];
    if (card === undefined) throw new Error("no card was posted");
    return card.link;
  }

  /** The roster of the Alliance the caller's lookup returns. */
  function roster(...rows: readonly RosterEntry[]): void {
    game.setRoster(rows);
  }

  describe("who may make a Booty Call (T008)", () => {
    test("a Linked Member holding the Alliance role, in its alliance-chat, is offered a private confirmation, with no Game API request", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);

      const asked = await askBooty(ALICE);

      expectPrivate(asked);
      expect(buttonIdsOf(asked)).toHaveLength(2);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);
    });

    test.each<[string, BootyChannel]>([
      ["a channel other than alliance-chat", GENERAL],
      ["an alliance-chat whose category is not an Alliance role", LOBBY_CHAT],
      ["another Alliance's alliance-chat", ABC_CHAT],
    ])("refuses /booty privately in %s, with no Game API request and nothing posted", async (_label, channel) => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);

      const asked = await askBooty(ALICE, channel);

      expectPrivate(asked);
      expect(answerTextsOf(asked)).toHaveLength(1);
      expect(buttonIdsOf(asked)).toHaveLength(0);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);
    });

    test("refuses /booty privately for a Member who is not Linked, even when holding the Alliance role", async () => {
      server.grantRole(NML_ROLE, ALICE);

      const asked = await askBooty(ALICE);

      expectPrivate(asked);
      expect(buttonIdsOf(asked)).toHaveLength(0);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);
    });
  });

  describe("the confirmation (T009)", () => {
    test("the confirmation carries Confirm and Cancel, with the ids the contract names", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);

      const asked = await askBooty(ALICE);

      expect(buttonIdsOf(asked)).toEqual([`booty:confirm:${ALICE}:${NOW.getTime().toString()}`, `booty:cancel:${ALICE}`]);
    });

    test("nothing is posted before Confirm", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);

      await askBooty(ALICE);

      expect(server.posts).toHaveLength(0);
    });

    test("Cancel posts nothing, looks nobody up, and answers privately", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);

      const cancelled = await press(`booty:cancel:${ALICE}`, ALICE);

      expectPrivate(cancelled);
      expect(answerTextsOf(cancelled)).toHaveLength(1);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);
      expect(buttonIdsOf(asked)).toContain(`booty:cancel:${ALICE}`);
    });

    test("a Confirm within the minute posts the card in the channel", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);
      clock = new Date(NOW.getTime() + MINUTE_MS - 1_000);

      await press(confirmIdOf(asked), ALICE);

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.channelId).toBe(ALLIANCE_CHAT.id);
    });

    test("a Confirm one minute after /booty says it has expired and posts nothing", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);
      clock = new Date(NOW.getTime() + MINUTE_MS);

      const pressed = await press(confirmIdOf(asked), ALICE);

      expectPrivate(pressed);
      expect(answerTextsOf(pressed).join(" ")).toMatch(/expired/i);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);
    });

    test("a press by another Member is refused privately and posts nothing", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);

      const pressed = await press(confirmIdOf(asked), BOB);

      expectPrivate(pressed);
      expect(answerTextsOf(pressed)).toHaveLength(1);
      expect(server.posts).toHaveLength(0);
    });

    test("Confirm re-checks the caller: a Member unlinked since /booty is refused and nothing is posted", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);
      links.unlink(ALICE);

      const pressed = await press(confirmIdOf(asked), ALICE);

      expectPrivate(pressed);
      expect(answerTextsOf(pressed)).toHaveLength(1);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);
    });

    test("Confirm re-checks the channel: a press from another channel is refused and nothing is posted", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);

      const pressed = await press(confirmIdOf(asked), ALICE, GENERAL);

      expectPrivate(pressed);
      expect(answerTextsOf(pressed)).toHaveLength(1);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);
    });
  });

  describe("who is alerted (T010)", () => {
    test("the roster is read with one uncharged Player lookup of the caller's uid, for the lookup purpose", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE], alertsOf("always"));
      roster(rosterEntry(ALICE_UID, "Alice Game", { online: true }));

      await bootyCallBy(ALICE);

      expect(game.lookups).toEqual([{ uid: ALICE_UID, purpose: "lookup" }]);
    });

    test("a Member who chose Only when online is mentioned while the game says they are online", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("online"));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }));

      await bootyCallBy(ALICE);

      expect(mentionedBy()).toContain(BOB);
    });

    test("a Member who chose Only when online is not mentioned when offline in the game and on Discord", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("online"));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: false, lastOnlineAt: NOW }));
      server.setPresence(BOB, "offline");

      await bootyCallBy(ALICE);

      expect(mentionedBy()).not.toContain(BOB);
    });

    test("a Member who chose Only when online is mentioned when offline in the game but online on Discord", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("online"));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: false, lastOnlineAt: NOW }));
      server.setPresence(BOB, "dnd");

      await bootyCallBy(ALICE);

      expect(mentionedBy()).toContain(BOB);
    });

    test("a Member who chose Only when offline is not mentioned when online on Discord, even though the game says offline", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(CAROL, CAROL_UID, [NML_ROLE], alertsOf("offline"));
      roster(rosterEntry(CAROL_UID, "Carol Game", { online: false, lastOnlineAt: NOW }));
      server.setPresence(CAROL, "idle");

      await bootyCallBy(ALICE);

      expect(mentionedBy()).not.toContain(CAROL);
    });

    test("a Member who chose Only when offline is mentioned when offline in the game and on Discord", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(CAROL, CAROL_UID, [NML_ROLE], alertsOf("offline"));
      roster(rosterEntry(CAROL_UID, "Carol Game", { online: false, lastOnlineAt: NOW }));
      server.setPresence(CAROL, "offline");

      await bootyCallBy(ALICE);

      expect(mentionedBy()).toContain(CAROL);
    });

    test("a Member with no Last Online in the game counts as online", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("online"));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: undefined, lastOnlineAt: undefined }));

      await bootyCallBy(ALICE);

      expect(mentionedBy()).toContain(BOB);
    });

    test.each<[string, BootyMode, RosterState, Presence, boolean]>([
      ["a roster row online: true is online, even when Discord says offline", "online", { online: true }, "offline", true],
      ["a roster row without a Last Online is online now, even with online: false and Discord offline", "online", { online: false }, "offline", true],
      ["a roster row online: false with a Last Online is offline, when Discord says offline", "online", { online: false, lastOnlineAt: NOW }, "offline", false],
      ["a roster row online: false with a Last Online is offline, but Discord dnd counts as online", "online", { online: false, lastOnlineAt: NOW }, "dnd", true],
      ["no roster flag and a Last Online is offline, even when Discord says offline", "online", { lastOnlineAt: NOW }, "offline", false],
      ["no roster flag and a Last Online is offline, but Discord idle counts as online", "online", { lastOnlineAt: NOW }, "idle", true],
      ["no roster flag and a Last Online is offline, so an Only when offline Member is mentioned", "offline", { lastOnlineAt: NOW }, "offline", true],
      ["a roster row online: true is not offline, so an Only when offline Member is not mentioned", "offline", { online: true }, "offline", false],
    ])("%s", async (_label, mode, state, presence, mentioned) => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf(mode));
      roster(rosterEntry(BOB_UID, "Bob Game", state));
      server.setPresence(BOB, presence);

      await bootyCallBy(ALICE);

      expect(mentionedBy().includes(BOB)).toBe(mentioned);
    });

    test("a Member who chose Off is never mentioned", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("off"));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }));

      await bootyCallBy(ALICE);

      expect(mentionedBy()).not.toContain(BOB);
    });

    test("a Member with no Booty Alerts recorded is not mentioned", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(CAROL, CAROL_UID, [NML_ROLE]);
      roster(rosterEntry(CAROL_UID, "Carol Game", { online: true, lastOnlineAt: NOW }));

      await bootyCallBy(ALICE);

      expect(mentionedBy()).not.toContain(CAROL);
    });

    test("a Member whose window does not hold the local time is not mentioned", async () => {
      clock = new Date("2026-11-07T23:30:00Z");
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("always", "Europe/Lisbon", windowOf(480, 1380)));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }));

      await bootyCallBy(ALICE);

      expect(mentionedBy()).not.toContain(BOB);
    });

    test("a Member who chose Only when offline, 08:00 to 23:00 in Europe/Lisbon, is mentioned at 12:00 in Lisbon while offline", async () => {
      clock = new Date("2026-11-07T12:00:00Z");
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("offline", "Europe/Lisbon", windowOf(480, 1380)));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: false, lastOnlineAt: NOW }));
      server.setPresence(BOB, "offline");

      await bootyCallBy(ALICE);

      expect(mentionedBy()).toContain(BOB);
    });

    test("a window from 22:00 to 06:00 holds 01:00", async () => {
      clock = new Date("2026-11-08T01:00:00Z");
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("always", "UTC", windowOf(1320, 360)));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }));

      await bootyCallBy(ALICE);

      expect(mentionedBy()).toContain(BOB);
    });

    test("the caller is never mentioned, even when opted in", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE], alertsOf("always"));
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("always"));
      roster(
        rosterEntry(ALICE_UID, "Alice Game", { online: true, lastOnlineAt: NOW }),
        rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }),
      );

      await bootyCallBy(ALICE);

      expect(mentionedBy()).toEqual([BOB]);
    });

    test("a Member outside the Alliance is never mentioned, even when opted in", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(EVE, EVE_UID, [], alertsOf("always"));
      roster(rosterEntry(ALICE_UID, "Alice Game", { online: true, lastOnlineAt: NOW }));

      await bootyCallBy(ALICE);

      expect(mentionedBy()).not.toContain(EVE);
    });

    test("a Member whose stored Booty Alerts are corrupt is skipped, and the card and the other Members still go out", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      db.prepare("INSERT INTO booty_alerts (member_id, mode, window_start, window_end, time_zone) VALUES (?, ?, ?, ?, ?)").run(
        BOB,
        "sometimes",
        0,
        0,
        "UTC",
      );
      enrol(CAROL, CAROL_UID, [NML_ROLE], alertsOf("always"));
      roster(
        rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }),
        rosterEntry(CAROL_UID, "Carol Game", { online: true, lastOnlineAt: NOW }),
      );

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(1);
      expect(mentionedBy()).toEqual([CAROL]);
    });

    test("a Member whose time zone Intl does not know is skipped, and the others still go out", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("always", "Mars/Olympus"));
      enrol(CAROL, CAROL_UID, [NML_ROLE], alertsOf("always"));
      roster(
        rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }),
        rosterEntry(CAROL_UID, "Carol Game", { online: true, lastOnlineAt: NOW }),
      );

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(1);
      expect(mentionedBy()).toEqual([CAROL]);
    });
  });

  describe("when the Game API cannot answer (T011)", () => {
    /** The Alliance: the caller, Bob (online on Discord), Carol (offline), Dave (any time), and Eve outside it. */
    function allianceWithoutGameData(): void {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("online"));
      enrol(CAROL, CAROL_UID, [NML_ROLE], alertsOf("online"));
      enrol(DAVE, DAVE_UID, [NML_ROLE], alertsOf("always"));
      enrol(EVE, EVE_UID, [], alertsOf("always"));
      server.setPresence(BOB, "online");
      server.setPresence(CAROL, "offline");
      server.setPresence(DAVE, "offline");
    }

    test.each<[string, Parameters<FakeBootyCallGameApi["failWith"]>[0]]>([
      ["the Daily Quota is out", { kind: "quota-spent", resetsAt: new Date("2026-11-08T00:00:00Z") }],
      ["the Game API is unavailable", { kind: "unavailable", reason: "unexpected" }],
    ])("when %s, the card is still posted and the Alliance role's holders who match on Discord are mentioned", async (_label, refusal) => {
      allianceWithoutGameData();
      game.failWith(refusal);

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.channelId).toBe(ALLIANCE_CHAT.id);
      expect(mentionedBy().sort()).toEqual([BOB, DAVE].sort());
    });

    test("the log line says the Game API could not answer, so Discord alone decided who is online", async () => {
      allianceWithoutGameData();
      game.failWith({ kind: "unavailable", reason: "unexpected" });

      await bootyCallBy(ALICE);

      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toMatch(/Game API/);
      expect(server.logs[0]).toContain(ALICE);
      expect(server.logs[0]).toContain("NML");
    });

    test("an answer with no roster gets the same fallback: the card is posted and the Alliance role's holders who match on Discord are mentioned", async () => {
      allianceWithoutGameData();
      game.withoutRoster();

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.channelId).toBe(ALLIANCE_CHAT.id);
      expect(mentionedBy().sort()).toEqual([BOB, DAVE].sort());
    });

    test("a found Player with an empty roster takes the same fallback as no roster: the Alliance role's holders who match on Discord are mentioned", async () => {
      allianceWithoutGameData();
      game.setRoster([]);

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(1);
      expect(mentionedBy().sort()).toEqual([BOB, DAVE].sort());
    });

    test("an answer with no roster is logged as the Game API could not answer, the same as a failed lookup", async () => {
      allianceWithoutGameData();
      game.withoutRoster();

      await bootyCallBy(ALICE);

      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toMatch(/Game API/);
      expect(server.logs[0]).toContain(ALICE);
      expect(server.logs[0]).toContain("NML");
    });
  });

  describe("the card and the mentions (T012)", () => {
    test("one card names the caller and the Alliance, and is the first message in the channel", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("always"));
      roster(
        rosterEntry(ALICE_UID, "Alice Game", { online: true, lastOnlineAt: NOW }),
        rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }),
      );

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(1);
      const card = server.posts[0];
      expect(card?.channelId).toBe(ALLIANCE_CHAT.id);
      expect(card?.message.content).toContain("Alice");
      expect(card?.message.content).toMatch(/NML/);
    });

    test("the mentions sit in the content, and allowedMentions lists exactly the matching Members, with no role or everyone mention", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("always"));
      enrol(CAROL, CAROL_UID, [NML_ROLE], alertsOf("always"));
      enrol(DAVE, DAVE_UID, [NML_ROLE]);
      roster(
        rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }),
        rosterEntry(CAROL_UID, "Carol Game", { online: true, lastOnlineAt: NOW }),
        rosterEntry(DAVE_UID, "Dave Game", { online: true, lastOnlineAt: NOW }),
      );

      await bootyCallBy(ALICE);

      const card = server.posts[0]?.message;
      expect(card?.content).toContain(`<@${BOB}>`);
      expect(card?.content).toContain(`<@${CAROL}>`);
      expect(card?.content).not.toContain(`<@${DAVE}>`);
      expect(mentionedBy().sort()).toEqual([BOB, CAROL].sort());
      expect(card?.allowedMentions?.parse ?? []).not.toContain("everyone");
      expect(card?.allowedMentions?.parse ?? []).not.toContain("roles");
      expect(card?.allowedMentions?.roles ?? []).toHaveLength(0);
    });

    test("200 matching Members give one card with the first 80 mentions, then follow-ups of 80 and 40", async () => {
      const crowd = Array.from({ length: 200 }, (_, index) => ({
        memberId: `7${index.toString().padStart(17, "0")}`,
        uid: `8${index.toString().padStart(10, "0")}`,
        name: `Game ${index.toString()}`,
      }));
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      for (const member of crowd) enrol(member.memberId, member.uid, [NML_ROLE], alertsOf("always"));
      roster(...crowd.map((member) => rosterEntry(member.uid, member.name, { online: true, lastOnlineAt: NOW })));

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(3);
      expect(server.posts.map((post) => post.message.allowedMentions?.users?.length ?? 0)).toEqual([80, 80, 40]);
      const mentioned = server.posts.flatMap((_post, index) => mentionedBy(index));
      expect(new Set(mentioned)).toEqual(new Set(crowd.map((member) => member.memberId)));
      expect(mentioned).toHaveLength(200);
    }, 30_000); // The setup writes 400 rows, one commit each, which is slow on Windows under a full run.

    test("when nobody matches, the card is still posted, with no mentions", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("offline"));
      roster(rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }));

      await bootyCallBy(ALICE);

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.message.content).not.toContain("<@");
      expect(mentionedBy()).toHaveLength(0);
    });

    test("the log line names the caller, the Alliance tag and how many were mentioned, not the names", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE], alertsOf("always"));
      enrol(CAROL, CAROL_UID, [NML_ROLE], alertsOf("always"));
      roster(
        rosterEntry(BOB_UID, "Bob Game", { online: true, lastOnlineAt: NOW }),
        rosterEntry(CAROL_UID, "Carol Game", { online: true, lastOnlineAt: NOW }),
      );

      await bootyCallBy(ALICE);

      expect(server.logs).toHaveLength(1);
      const line = server.logs[0] ?? "";
      expect(line).toContain(ALICE);
      expect(line).toContain("NML");
      expect(line).toMatch(/\b2\b/);
      expect(line).not.toContain("Bob");
      expect(line).not.toContain("Carol");
    });
  });

  describe("the cooldown per Alliance (T013)", () => {
    test("a /booty within a minute in the same Alliance posts nothing and answers privately with the card's link", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      await bootyCallBy(ALICE);
      clock = new Date(NOW.getTime() + 30_000);

      const asked = await askBooty(BOB);

      expectPrivate(asked);
      expect(server.posts).toHaveLength(1);
      expect(answerTextsOf(asked).join(" ")).toContain(cardLink());
      expect(buttonIdsOf(asked)).toHaveLength(0);
    });

    test("a Confirm within a minute in the same Alliance posts nothing and answers privately with the card's link", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      const bobAsked = await askBooty(BOB);
      await bootyCallBy(ALICE);
      clock = new Date(NOW.getTime() + 20_000);

      const pressed = await press(confirmIdOf(bobAsked), BOB);

      expectPrivate(pressed);
      expect(server.posts).toHaveLength(1);
      expect(answerTextsOf(pressed).join(" ")).toContain(cardLink());
    });

    test("two Confirms at the same moment give one card, and the one that lost is told the Alliance is already being called", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      const aliceAsked = await askBooty(ALICE);
      const bobAsked = await askBooty(BOB);

      const [alicePressed, bobPressed] = await Promise.all([
        press(confirmIdOf(aliceAsked), ALICE),
        press(confirmIdOf(bobAsked), BOB),
      ]);

      expect(server.posts).toHaveLength(1);
      const texts = [...answerTextsOf(alicePressed), ...answerTextsOf(bobPressed)];
      expect(texts).toContain(bootyCallMessages.coolingDown(NML_ROLE, undefined));
    });

    test("one minute after the card the Alliance is free again: a /booty is offered a confirmation and its Confirm posts", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      await bootyCallBy(ALICE);
      clock = new Date(NOW.getTime() + MINUTE_MS);

      const asked = await askBooty(BOB);
      expect(buttonIdsOf(asked)).toHaveLength(2);
      await press(confirmIdOf(asked), BOB);

      expect(server.posts).toHaveLength(2);
    });

    test("another Alliance's card does not hold back a Booty Call", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(DAVE, DAVE_UID, [ABC_ROLE]);
      await bootyCallBy(ALICE);
      clock = new Date(NOW.getTime() + 10_000);

      await bootyCallBy(DAVE, ABC_CHAT);

      expect(server.posts).toHaveLength(2);
      expect(server.posts[1]?.channelId).toBe(ABC_CHAT.id);
    });

    test("when the card fails to post, the caller is told privately and no card link is given", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);
      server.failNextPost(new Error("Discord refused the message"));

      const pressed = await press(confirmIdOf(asked), ALICE);

      expectPrivate(pressed);
      expect(answerTextsOf(pressed).at(-1)).toBe(bootyCallMessages.postFailed);
      for (const text of answerTextsOf(pressed)) expect(text).not.toContain("discord.com/channels");
      expect(server.posts).toHaveLength(0);
    });

    test("a Member who lost the Alliance role between /booty and Confirm: nothing is posted, no Game API lookup is made, the last answer says they are not in that Alliance, and the cooldown is free again", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);
      server.revokeRole(NML_ROLE, ALICE);

      const pressed = await press(confirmIdOf(asked), ALICE);

      expectPrivate(pressed);
      expect(answerTextsOf(pressed).at(-1)).toBe(bootyCallMessages.notInAlliance);
      expect(server.posts).toHaveLength(0);
      expect(game.lookups).toHaveLength(0);

      await bootyCallBy(BOB);
      expect(server.posts).toHaveLength(1);
    });

    test("when Discord cannot say who holds the Alliance role at Confirm: nothing is posted, the last answer says it is unavailable, and the cooldown is free again", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      const asked = await askBooty(ALICE);
      server.failNextHoldersRead(new Error("Discord did not answer"));

      const pressed = await press(confirmIdOf(asked), ALICE);

      expectPrivate(pressed);
      expect(answerTextsOf(pressed).at(-1)).toBe(bootyCallMessages.unavailable);
      expect(server.posts).toHaveLength(0);

      await bootyCallBy(BOB);
      expect(server.posts).toHaveLength(1);
    });

    test("when the card fails to post, the cooldown is released: the next /booty in that Alliance is offered a confirmation", async () => {
      enrol(ALICE, ALICE_UID, [NML_ROLE]);
      enrol(BOB, BOB_UID, [NML_ROLE]);
      const aliceAsked = await askBooty(ALICE);
      server.failNextPost(new Error("Discord refused the message"));
      await press(confirmIdOf(aliceAsked), ALICE);
      clock = new Date(NOW.getTime() + 5_000);

      const bobAsked = await askBooty(BOB);

      expect(buttonIdsOf(bobAsked)).toHaveLength(2);
      await press(confirmIdOf(bobAsked), BOB);
      expect(server.posts).toHaveLength(1);
    });
  });
});
