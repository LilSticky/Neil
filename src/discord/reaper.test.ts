import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MessageFlags, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import {
  exileReasonOf,
  type Editor,
  type Exile,
  type ExileReason,
} from "../domain/exile.js";
import {
  parseKingdom,
  parsePlayerName,
  parseUid,
  type KingdomNumber,
  type PlayerName,
  type Uid,
} from "../domain/lookup-input.js";
import type { LookupResult, Match, Player } from "../domain/player.js";
import { openDatabase } from "../storage/database.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { FakePickInteraction } from "./__fakes__/pick-interaction.js";
import { FakeReaperInteraction } from "./__fakes__/reaper-interaction.js";
import { renderPlayerPickList, lookupMessages } from "./lookup-cards.js";
import { handlePick } from "./pick.js";
import { PickSessions, type PickChoice } from "./pick-sessions.js";
import { handleReaperAdd, type ReaperAddContext } from "./reaper.js";

function uidOf(digits: string): Uid {
  const parsed = parseUid(digits);
  if (!parsed.ok) throw new Error(`the test uid ${digits} is not a valid uid`);
  return parsed.value;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`the test Kingdom ${number.toString()} is not a valid Kingdom`);
  return parsed.value;
}

function playerNameOf(text: string): PlayerName {
  const parsed = parsePlayerName(text);
  if (!parsed.ok) throw new Error(`the test Player Name "${text}" is not valid`);
  return parsed.value;
}

function reasonOf(text: string): ExileReason {
  const parsed = exileReasonOf(text);
  if (!parsed.ok) throw new Error(`the test reason "${text}" must be accepted`);
  return parsed.value;
}

const UID_TEXT = "145563254785";
const UID = uidOf(UID_TEXT);
const HOME = kingdomOf(330);
const ADDER_ID = "310000000000000001";
const OTHER_ID = "111111111111111111";
const PLAYER_NAME = playerNameOf("Vex");
const PICK_ID = "a1b2c3d4";
const FETCHED_AT = new Date("2026-11-04T15:20:00Z");
const NOW = new Date("2026-11-04T16:00:00Z");
const EARLIER = new Date("2026-11-01T12:00:00Z");
const RESETS_AT = new Date("2026-11-05T00:00:00Z");

const R5_EDITOR: Editor = { allianceRank: { source: "game-api", rank: "R5" }, allianceKingdom: HOME };
const R4_EDITOR: Editor = { allianceRank: { source: "game-api", rank: "R4" }, allianceKingdom: HOME };

const VEX: Player = {
  uid: UID,
  name: "Vex",
  kingdom: HOME,
  might: 15902728,
  sanctuaryLevel: 42,
  alliance: { tag: "ASH", name: "Ashen", leaderUid: undefined },
  allianceRank: "R4",
  details: {
    kills: undefined,
    vipLevel: undefined,
    likes: undefined,
    lastOnlineAt: undefined,
    language: undefined,
    location: { x: 120, y: 340 },
    avatarPath: undefined,
    kingdomBadgePath: undefined,
  },
};

/** Two Players named Vex in two Kingdoms: an ambiguous name. The first is the one the pick list offers at 0. */
const MATCHES: readonly Match[] = [
  { uid: UID_TEXT, name: "Vex", kingdom: 330, tag: "ASH" },
  { uid: "145563254786", name: "Vex", kingdom: 12, tag: "OWL" },
];

const LOOKUP_OPTIONS = { strings: { name: "Vex", reason: "  Hoarding gold  " } };

type FindPlayer = (
  name: PlayerName,
  kingdom: KingdomNumber | undefined,
  purpose: RequestPurpose,
) => Promise<LookupResult<Player>>;
type GetPlayer = (uid: Uid, purpose: RequestPurpose) => Promise<LookupResult<Player>>;

const FOUND: LookupResult<Player> = { kind: "found", value: VEX, fetchedAt: FETCHED_AT };

/** The Exile of the Member as a store row: seeded before the test runs. */
function exileOf(overrides: Partial<Exile> = {}): Exile {
  return {
    uid: UID,
    name: "Vex",
    kingdom: HOME,
    position: { x: 1, y: 2 },
    positionAt: EARLIER,
    reason: reasonOf("Old reason"),
    addedAt: EARLIER,
    addedBy: OTHER_ID,
    ...overrides,
  };
}

/** Every text the handler sent back, in order; a deferral carries none. */
function repliesOf(interaction: FakeReaperInteraction): string[] {
  return interaction.calls.flatMap((call) => (call.method === "deferReply" ? [] : [call.options.content ?? ""]));
}

/** A context whose fake Game API answers the name lookup with the given result, and whose R5 check is the given Editor. */
function addContext(
  store: ReaperStore,
  options: { readonly editor?: Editor; readonly lookup?: LookupResult<Player> } = {},
) {
  const findPlayer = vi.fn<FindPlayer>(() => Promise.resolve(options.lookup ?? FOUND));
  const open = vi.fn<(ownerId: string, choice: PickChoice, now: Date) => string>(() => PICK_ID);
  const log = vi.fn<(message: BaseMessageOptions) => Promise<void>>(() => Promise.resolve());
  const logError = vi.fn<(message: string) => void>();
  const editor = options.editor ?? R5_EDITOR;
  const context: ReaperAddContext = {
    editorOf: () => editor,
    homeKingdom: HOME,
    gameApi: { findPlayer },
    reaper: store,
    pickSessions: { open },
    channels: { log },
    now: () => NOW,
    logError,
  };
  return { context, findPlayer, open, log, logError };
}

describe("handleReaperAdd", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ReaperStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-add-"));
    db = openDatabase(dataDir);
    store = new ReaperStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("refuses a Member who may not change REAPER, before any Game API request", async () => {
    const { context, findPlayer, log } = addContext(store, { editor: R4_EDITOR });
    const interaction = new FakeReaperInteraction(LOOKUP_OPTIONS, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(findPlayer).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(store.all()).toEqual([]);
    expect(repliesOf(interaction)).toEqual(["Only R5s of Home Kingdom Alliances may change REAPER."]);
  });

  test("refuses a blank reason before any Game API request, and stores nothing", async () => {
    const { context, findPlayer } = addContext(store);
    const interaction = new FakeReaperInteraction({ strings: { name: "Vex", reason: "   " } }, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(findPlayer).not.toHaveBeenCalled();
    expect(store.all()).toEqual([]);
    expect(repliesOf(interaction)).toHaveLength(1);
  });

  test("stores a found Player as an Exile: the position read, the reason trimmed, the R5 as adder", async () => {
    const { context, findPlayer } = addContext(store);
    const interaction = new FakeReaperInteraction(LOOKUP_OPTIONS, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(findPlayer).toHaveBeenCalledWith(PLAYER_NAME, undefined, "lookup");
    expect(store.find(UID)).toEqual({
      uid: UID,
      name: "Vex",
      kingdom: HOME,
      position: { x: 120, y: 340 },
      positionAt: FETCHED_AT,
      reason: "Hoarding gold",
      addedAt: NOW,
      addedBy: ADDER_ID,
    });
  });

  test("confirms privately with the name, Kingdom and tag, and never names the adder", async () => {
    const { context } = addContext(store);
    const interaction = new FakeReaperInteraction(LOOKUP_OPTIONS, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(interaction.calls[0]).toMatchObject({ method: "deferReply", options: { flags: MessageFlags.Ephemeral } });
    expect(repliesOf(interaction)).toEqual(["Vex (Kingdom 330, [ASH]) is now an Exile."]);
    expect(repliesOf(interaction).join("\n")).not.toContain(ADDER_ID);
  });

  test("posts one log line naming the Exile, the uid, the Kingdom, the R5 and the reason", async () => {
    const { context, log } = addContext(store);
    const interaction = new FakeReaperInteraction(LOOKUP_OPTIONS, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        content: `🔥 Vex (${UID_TEXT}, Kingdom 330) added to REAPER by <@${ADDER_ID}>: Hoarding gold`,
      }),
    );
  });

  test("says an Exile already on REAPER with her stored reason, and changes nothing", async () => {
    store.add(exileOf());
    const { context, log } = addContext(store);
    const interaction = new FakeReaperInteraction(
      { strings: { name: "Vex", reason: "New reason" } },
      ADDER_ID,
    );

    await handleReaperAdd(interaction, context);

    expect(repliesOf(interaction)).toEqual(["Vex is already an Exile: Old reason"]);
    expect(store.all()).toEqual([exileOf()]);
    expect(log).not.toHaveBeenCalled();
  });

  test("says no Player has that name, and stores nothing", async () => {
    const { context, log } = addContext(store, { lookup: { kind: "not-found" } });
    const interaction = new FakeReaperInteraction(LOOKUP_OPTIONS, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(repliesOf(interaction)).toEqual([lookupMessages.playerNameNotFound(PLAYER_NAME, undefined)]);
    expect(store.all()).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  test("opens a private pick list for an ambiguous name, carrying the reason", async () => {
    const { context, open, log } = addContext(store, { lookup: { kind: "ambiguous", matches: MATCHES } });
    const interaction = new FakeReaperInteraction(LOOKUP_OPTIONS, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(open).toHaveBeenCalledWith(
      ADDER_ID,
      { kind: "exile", matches: MATCHES, reason: "Hoarding gold" },
      NOW,
    );
    expect(interaction.calls.slice(-1)).toMatchObject([
      { method: "editReply", options: renderPlayerPickList(PLAYER_NAME, MATCHES, PICK_ID) },
    ]);
    expect(store.all()).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });

  test("says the usual quota text when the Daily Quota is spent, and stores nothing", async () => {
    const { context } = addContext(store, { lookup: { kind: "quota-spent", resetsAt: RESETS_AT } });
    const interaction = new FakeReaperInteraction(LOOKUP_OPTIONS, ADDER_ID);

    await handleReaperAdd(interaction, context);

    expect(repliesOf(interaction)).toEqual([lookupMessages.quotaSpent(RESETS_AT, NOW)]);
    expect(store.all()).toEqual([]);
  });
});

describe("picking an Exile from the pick list of /reaper add", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ReaperStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-pick-"));
    db = openDatabase(dataDir);
    store = new ReaperStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("looks the picked Player up by uid and stores it as an Exile with the reason of the list, then logs one line", async () => {
    const sessions = new PickSessions();
    const sessionId = sessions.open(
      ADDER_ID,
      { kind: "exile", matches: MATCHES, reason: reasonOf("Hoarding gold") },
      NOW,
    );
    const getPlayer = vi.fn<GetPlayer>(() => Promise.resolve(FOUND));
    const log = vi.fn<(message: BaseMessageOptions) => Promise<void>>(() => Promise.resolve());
    const interaction = new FakePickInteraction({
      customId: `pick:${sessionId}:select`,
      userId: ADDER_ID,
      // The pick list orders matches by Kingdom, so the Kingdom 330 Vex is the second option.
      values: ["1"],
    });

    await handlePick(interaction, {
      gameApi: { getPlayer, getAlliance: () => Promise.reject(new Error("no Alliance lookup when picking an Exile")) },
      pickSessions: sessions,
      now: () => NOW,
      logError: vi.fn<(message: string) => void>(),
      reaper: store,
      channels: { log },
    });

    expect(getPlayer).toHaveBeenCalledWith(UID, "lookup");
    expect(store.find(UID)).toEqual({
      uid: UID,
      name: "Vex",
      kingdom: HOME,
      position: { x: 120, y: 340 },
      positionAt: FETCHED_AT,
      reason: "Hoarding gold",
      addedAt: NOW,
      addedBy: ADDER_ID,
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        content: `🔥 Vex (${UID_TEXT}, Kingdom 330) added to REAPER by <@${ADDER_ID}>: Hoarding gold`,
      }),
    );
  });
});
