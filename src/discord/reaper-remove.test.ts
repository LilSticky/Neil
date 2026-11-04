import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MessageFlags, type BaseMessageOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { exileReasonOf, type Editor, type Exile, type ExileReason } from "../domain/exile.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import { openDatabase } from "../storage/database.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { FakeAutocompleteInteraction } from "./__fakes__/autocomplete-interaction.js";
import { FakeReaperInteraction } from "./__fakes__/reaper-interaction.js";
import {
  handleReaperAutocomplete,
  handleReaperRemove,
  type ReaperAutocompleteContext,
  type ReaperRemoveContext,
} from "./reaper-remove.js";

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

function reasonOf(text: string): ExileReason {
  const parsed = exileReasonOf(text);
  if (!parsed.ok) throw new Error(`the test reason "${text}" must be accepted`);
  return parsed.value;
}

const HOME = kingdomOf(330);
const OTHER_KINGDOM = kingdomOf(12);
const R5_ID = "310000000000000001";
const R4_ID = "222222222222222222";
const EARLIEST = new Date("2026-11-01T12:00:00Z");
const MIDDLE = new Date("2026-11-02T12:00:00Z");
const NEWEST = new Date("2026-11-03T12:00:00Z");

const R5_EDITOR: Editor = { allianceRank: { source: "game-api", rank: "R5" }, allianceKingdom: HOME };
const R4_EDITOR: Editor = { allianceRank: { source: "game-api", rank: "R4" }, allianceKingdom: HOME };

const VEX_UID = uidOf("145563254785");
const MORDVEX_UID = uidOf("145563254786");
const BRAND_UID = uidOf("145563254787");
const UNKNOWN_UID = uidOf("145563254999");

/** An Exile as stored in REAPER, with the given overrides. */
function exileOf(overrides: Partial<Exile> & Pick<Exile, "uid" | "name">): Exile {
  return {
    kingdom: HOME,
    position: { x: 1, y: 2 },
    positionAt: EARLIEST,
    reason: reasonOf("Hoarding gold"),
    addedAt: EARLIEST,
    addedBy: R5_ID,
    ...overrides,
  };
}

/** Every text the handler sent back, in order; a deferral carries none. */
function repliesOf(interaction: FakeReaperInteraction): string[] {
  return interaction.calls.flatMap((call) => (call.method === "deferReply" ? [] : [call.options.content ?? ""]));
}

/** The remove context over a real REAPER store, with the given Editor for every Member and a log spy. */
function removeContext(store: ReaperStore, editor: Editor = R5_EDITOR): ReaperRemoveContext {
  return {
    editorOf: () => editor,
    homeKingdom: HOME,
    reaper: store,
    channels: { log: vi.fn<(message: BaseMessageOptions) => Promise<void>>(() => Promise.resolve()) },
    logError: vi.fn<(message: string) => void>(),
  };
}

/** Fails the test if anything fetches: no Game API request may be made by remove or its autocomplete. */
const fetchSpy = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(() =>
  Promise.reject(new Error("no Game API request may be made")),
);

describe("handleReaperRemove", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ReaperStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-remove-"));
    db = openDatabase(dataDir);
    store = new ReaperStore(db);
    store.add(exileOf({ uid: VEX_UID, name: "Vex", addedAt: MIDDLE }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockClear();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("refuses a Member who is not a Home Kingdom R5 privately, before anything is removed or logged", async () => {
    const context = removeContext(store, R4_EDITOR);
    const interaction = new FakeReaperInteraction({ strings: { exile: VEX_UID } }, R4_ID);

    await handleReaperRemove(interaction, context);

    expect(store.find(VEX_UID)?.name).toBe("Vex");
    expect(context.channels.log).not.toHaveBeenCalled();
    expect(interaction.calls.map((call) => call.method)).toEqual(["reply"]);
    expect(interaction.calls[0]?.options).toEqual(
      expect.objectContaining({
        content: "Only R5s of Home Kingdom Alliances may change REAPER.",
        flags: MessageFlags.Ephemeral,
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("removes a known Exile, confirms privately and posts one log line naming the Exile and the R5", async () => {
    const context = removeContext(store);
    const interaction = new FakeReaperInteraction({ strings: { exile: VEX_UID } }, R5_ID);

    await handleReaperRemove(interaction, context);

    expect(store.find(VEX_UID)).toBeUndefined();
    expect(repliesOf(interaction)).toEqual(["Vex is no longer an Exile."]);
    expect(context.channels.log).toHaveBeenCalledTimes(1);
    const [logged] = vi.mocked(context.channels.log).mock.calls[0] ?? [];
    expect(logged?.content).toContain(`Vex (${VEX_UID}, Kingdom 330) removed from REAPER by <@${R5_ID}>`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("leaves the other Exiles as they are when one is removed", async () => {
    store.add(exileOf({ uid: BRAND_UID, name: "Brand", kingdom: OTHER_KINGDOM, addedAt: EARLIEST }));
    const context = removeContext(store);
    const interaction = new FakeReaperInteraction({ strings: { exile: VEX_UID } }, R5_ID);

    await handleReaperRemove(interaction, context);

    expect(store.find(BRAND_UID)?.name).toBe("Brand");
  });

  test("answers not an Exile for a uid that is not in REAPER, changes nothing and logs nothing", async () => {
    const context = removeContext(store);
    const interaction = new FakeReaperInteraction({ strings: { exile: UNKNOWN_UID } }, R5_ID);

    await handleReaperRemove(interaction, context);

    expect(repliesOf(interaction)).toEqual(["not an Exile"]);
    expect(store.find(VEX_UID)?.name).toBe("Vex");
    expect(store.all()).toHaveLength(1);
    expect(context.channels.log).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("answers not an Exile for a value that is not a uid, changes nothing and logs nothing", async () => {
    const context = removeContext(store);
    const interaction = new FakeReaperInteraction({ strings: { exile: "Vex" } }, R5_ID);

    await handleReaperRemove(interaction, context);

    expect(repliesOf(interaction)).toEqual(["not an Exile"]);
    expect(store.all()).toHaveLength(1);
    expect(context.channels.log).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("handleReaperAutocomplete for the exile option", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ReaperStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-autocomplete-"));
    db = openDatabase(dataDir);
    store = new ReaperStore(db);
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockClear();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const context = (): ReaperAutocompleteContext => ({ reaper: store });

  test("suggests the Exiles whose name contains the typed text, ignoring case, with the uid as value", async () => {
    store.add(exileOf({ uid: BRAND_UID, name: "Brand", kingdom: OTHER_KINGDOM, addedAt: EARLIEST }));
    store.add(exileOf({ uid: MORDVEX_UID, name: "Mordvex", kingdom: OTHER_KINGDOM, addedAt: MIDDLE }));
    store.add(exileOf({ uid: VEX_UID, name: "Vex", addedAt: NEWEST }));
    const interaction = new FakeAutocompleteInteraction({ name: "exile", value: "VEX" });

    await handleReaperAutocomplete(interaction, context());

    const [choices] = interaction.responses;
    expect(choices?.map((choice) => choice.value)).toEqual([VEX_UID, MORDVEX_UID]);
    expect(choices?.[0]?.name).toContain("Vex");
    expect(choices?.[0]?.name).toContain("330");
    expect(choices?.[1]?.name).toContain("Mordvex");
    expect(choices?.[1]?.name).toContain("12");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("answers an empty list when no Exile matches what is typed", async () => {
    store.add(exileOf({ uid: VEX_UID, name: "Vex" }));
    const interaction = new FakeAutocompleteInteraction({ name: "exile", value: "zzzz" });

    await handleReaperAutocomplete(interaction, context());

    expect(interaction.responses).toEqual([[]]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("suggests the newest Exiles first when nothing is typed yet", async () => {
    store.add(exileOf({ uid: BRAND_UID, name: "Brand", addedAt: EARLIEST }));
    store.add(exileOf({ uid: VEX_UID, name: "Vex", addedAt: NEWEST }));
    store.add(exileOf({ uid: MORDVEX_UID, name: "Mordvex", addedAt: MIDDLE }));
    const interaction = new FakeAutocompleteInteraction({ name: "exile", value: "" });

    await handleReaperAutocomplete(interaction, context());

    expect(interaction.responses).toEqual([
      [
        expect.objectContaining({ value: VEX_UID }),
        expect.objectContaining({ value: MORDVEX_UID }),
        expect.objectContaining({ value: BRAND_UID }),
      ],
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("suggests at most 25 Exiles", async () => {
    for (let index = 0; index < 30; index += 1) {
      const addedAt = new Date(EARLIEST.getTime() + index * 60_000);
      store.add(exileOf({ uid: uidOf(`10000000${index.toString().padStart(4, "0")}`), name: `Ash ${index.toString()}`, addedAt }));
    }
    const interaction = new FakeAutocompleteInteraction({ name: "exile", value: "ash" });

    await handleReaperAutocomplete(interaction, context());

    const [choices] = interaction.responses;
    expect(choices).toHaveLength(25);
    expect(choices?.[0]?.name).toContain("Ash 29");
  });
});
