import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { MessageFlags, type APIEmbed, type InteractionEditReplyOptions } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RequestPurpose } from "../domain/daily-quota.js";
import { exileReasonOf, type Exile, type ExileReason, type Position } from "../domain/exile.js";
import { parseKingdom, parseUid, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Link } from "../domain/link.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { LookupResult, Player } from "../domain/player.js";
import { openDatabase } from "../storage/database.js";
import { ReaperStore } from "../storage/reaper-store.js";
import { FakeReaperInteraction } from "./__fakes__/reaper-interaction.js";
import { lookupMessages, renderPlayerCard } from "./lookup-cards.js";
import { handleReaperClosest, type ReaperClosestContext } from "./reaper.js";

type GetPlayer = (uid: Uid, purpose: RequestPurpose) => Promise<LookupResult<Player>>;

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
const CALLER_ID = "222222222222222222";
const ADDER_ID = "310000000000000001";
const CALLER_UID = uidOf("145563254700");
const FETCHED_AT = new Date("2026-11-04T15:20:00Z");
const NOW = new Date("2026-11-04T16:00:00Z");
const EARLIER = new Date("2026-11-01T12:00:00Z");
const RESETS_AT = new Date("2026-11-05T00:00:00Z");

const CALLER_LINK: Link = {
  memberId: CALLER_ID,
  uid: CALLER_UID,
  linkedAt: EARLIER,
  allianceRank: { source: "game-api", rank: "R4" },
  madeBy: { kind: "in-game-proof" },
};

const NEAR = uidOf("145563254781");
const MID = uidOf("145563254782");
const FAR = uidOf("145563254783");
const BEYOND = uidOf("145563254784");

/** A Player as the Game API reads it: no Alliance, a position when given. */
function playerOf(uid: Uid, name: string, kingdom: KingdomNumber, location: Position | undefined): Player {
  return {
    uid,
    name,
    kingdom,
    might: 1000,
    sanctuaryLevel: 10,
    alliance: undefined,
    allianceRank: undefined,
    details: {
      kills: undefined,
      vipLevel: undefined,
      likes: undefined,
      lastOnlineAt: undefined,
      language: undefined,
      location,
      avatarPath: undefined,
      kingdomBadgePath: undefined,
    },
  };
}

function found(player: Player): LookupResult<Player> {
  return { kind: "found", value: player, fetchedAt: FETCHED_AT };
}

/** The Exile as a store row: stored in the Home Kingdom, added by an R5 who is never shown. */
function exileOf(uid: Uid, name: string, position: Position | undefined, addedAt = EARLIER): Exile {
  return {
    uid,
    name,
    kingdom: HOME,
    position,
    positionAt: position === undefined ? undefined : EARLIER,
    reason: reasonOf(`Reason of ${name}`),
    addedAt,
    addedBy: ADDER_ID,
  };
}

/** A Game API read that answers each uid with the Player given for it; any other uid is not found. */
function readsOf(...players: readonly Player[]): GetPlayer {
  return (uid) => {
    const player = players.find((candidate) => candidate.uid === uid);
    const result: LookupResult<Player> = player === undefined ? { kind: "not-found" } : found(player);
    return Promise.resolve(result);
  };
}

function closestContext(
  store: ReaperStore,
  options: { readonly link?: Link; readonly read?: GetPlayer } = {},
) {
  const linkFor = vi.fn<(memberId: MemberId) => Link | undefined>((memberId) =>
    memberId === CALLER_ID ? options.link : undefined,
  );
  const getPlayer = vi.fn<GetPlayer>(options.read ?? (() => Promise.reject(new Error("no Game API read was expected"))));
  const logError = vi.fn<(message: string) => void>();
  const context: ReaperClosestContext = {
    links: { linkFor },
    gameApi: { getPlayer },
    reaper: store,
    homeKingdom: HOME,
    now: () => NOW,
    logError,
  };
  return { context, getPlayer, linkFor, logError };
}

/** Every text the handler sent back, in order; a deferral carries none. */
function repliesOf(interaction: FakeReaperInteraction): string[] {
  return interaction.calls.flatMap((call) => (call.method === "deferReply" ? [] : [call.options.content ?? ""]));
}

/** The last edit of the reply: the answer the Member sees. */
function answerOf(interaction: FakeReaperInteraction): InteractionEditReplyOptions {
  const edits = interaction.calls.flatMap((call) => (call.method === "editReply" ? [call.options] : []));
  const last = edits[edits.length - 1];
  if (last === undefined) throw new Error("the handler did not edit the reply with an answer");
  return last;
}

function embedsOf(options: InteractionEditReplyOptions): APIEmbed[] {
  return (options.embeds ?? []).map((embed) => ("toJSON" in embed ? embed.toJSON() : embed));
}

/** The Exile cards of the answer: every embed after the header. */
function exileEmbedsOf(interaction: FakeReaperInteraction): APIEmbed[] {
  return embedsOf(answerOf(interaction)).slice(1);
}

function fieldValue(embed: APIEmbed, name: string): string | undefined {
  return embed.fields?.find((field) => field.name === name)?.value;
}

function titlesOf(embeds: readonly APIEmbed[]): (string | undefined)[] {
  return embeds.map((embed) => embed.title);
}

/** Lets the handler run until it waits on something that is not yet resolved. */
function settle(): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("handleReaperClosest", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: ReaperStore;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-reaper-closest-"));
    db = openDatabase(dataDir);
    store = new ReaperStore(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("defers the answer privately before it is sent", async () => {
    const { context } = closestContext(store);
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(interaction.calls[0]).toMatchObject({
      method: "deferReply",
      options: { flags: MessageFlags.Ephemeral },
    });
  });

  test.each([{ integers: { x: 10 } }, { integers: { y: 20 } }])(
    "refuses an x without a y, or a y without an x, before any Game API request: %o",
    async (values) => {
      store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
      const { context, getPlayer } = closestContext(store, { link: CALLER_LINK, read: readsOf() });
      const interaction = new FakeReaperInteraction(values, CALLER_ID);

      await handleReaperClosest(interaction, context);

      expect(getPlayer).not.toHaveBeenCalled();
      expect(interaction.calls).toHaveLength(1);
      expect(interaction.calls[0]).toMatchObject({
        method: "reply",
        options: { content: "Give both x and y.", flags: MessageFlags.Ephemeral },
      });
    },
  );

  test("asks for x and y when the caller has no Link and gives no position", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context, getPlayer } = closestContext(store);
    const interaction = new FakeReaperInteraction({}, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(getPlayer).not.toHaveBeenCalled();
    expect(repliesOf(interaction)).toHaveLength(1);
    expect(repliesOf(interaction)[0]).toMatch(/\bx\b.*\by\b/);
  });

  test("asks for x and y when the caller's Linked Player cannot be read", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context, getPlayer } = closestContext(store, {
      link: CALLER_LINK,
      read: () => Promise.resolve({ kind: "unavailable", reason: "unexpected" }),
    });
    const interaction = new FakeReaperInteraction({}, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(CALLER_UID, "lookup");
    expect(repliesOf(interaction)).toHaveLength(1);
    expect(repliesOf(interaction)[0]).toMatch(/\bx\b.*\by\b/);
  });

  test("measures from the Linked Player's position, and lists the 3 closest Exiles of its Kingdom in distance order", async () => {
    store.add(exileOf(FAR, "Far", { x: 3, y: 4 }));
    store.add(exileOf(BEYOND, "Beyond", { x: 10, y: 0 }));
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    store.add(exileOf(MID, "Mid", { x: 0, y: 2 }));
    const { context, getPlayer } = closestContext(store, {
      link: CALLER_LINK,
      read: readsOf(
        playerOf(CALLER_UID, "Caller", HOME, { x: 0, y: 0 }),
        playerOf(NEAR, "Near", HOME, { x: 1, y: 0 }),
        playerOf(MID, "Mid", HOME, { x: 0, y: 2 }),
        playerOf(FAR, "Far", HOME, { x: 3, y: 4 }),
        playerOf(BEYOND, "Beyond", HOME, { x: 10, y: 0 }),
      ),
    });
    const interaction = new FakeReaperInteraction({}, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(getPlayer).toHaveBeenCalledWith(CALLER_UID, "lookup");
    expect(titlesOf(exileEmbedsOf(interaction))).toEqual(["Near", "Mid", "Far"]);
    expect(JSON.stringify(answerOf(interaction))).not.toContain("Beyond");
  });

  test("measures from x and y, not from the Linked Player's position, when both are given", async () => {
    store.add(exileOf(FAR, "Far", { x: 3, y: 4 }));
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = closestContext(store, {
      link: CALLER_LINK,
      read: readsOf(
        playerOf(CALLER_UID, "Caller", HOME, { x: 120, y: 340 }),
        playerOf(NEAR, "Near", HOME, { x: 1, y: 0 }),
        playerOf(FAR, "Far", HOME, { x: 3, y: 4 }),
      ),
    });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(titlesOf(exileEmbedsOf(interaction))).toEqual(["Near", "Far"]);
  });

  test("answers for the Home Kingdom when the caller has no Link and gives x and y", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    store.add({ ...exileOf(FAR, "Far", { x: 3, y: 4 }), kingdom: OTHER_KINGDOM });
    const { context } = closestContext(store, { read: readsOf(playerOf(NEAR, "Near", HOME, { x: 1, y: 0 })) });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(titlesOf(exileEmbedsOf(interaction))).toEqual(["Near"]);
    expect(JSON.stringify(answerOf(interaction))).not.toContain("Far");
  });

  test("answers for the Kingdom of the caller's Linked Player", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = closestContext(store, {
      link: CALLER_LINK,
      read: readsOf(playerOf(CALLER_UID, "Caller", OTHER_KINGDOM, { x: 0, y: 0 })),
    });
    const interaction = new FakeReaperInteraction({}, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(repliesOf(interaction)).toEqual(["No Exiles in Kingdom 12."]);
  });

  test("says No Exiles in Kingdom N when the Kingdom has none", async () => {
    const { context, getPlayer } = closestContext(store, { read: readsOf() });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(getPlayer).not.toHaveBeenCalled();
    expect(repliesOf(interaction)).toEqual(["No Exiles in Kingdom 330."]);
  });

  test("opens with a header naming the origin, the Kingdom and that shields cannot be seen", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = closestContext(store, { read: readsOf(playerOf(NEAR, "Near", HOME, { x: 1, y: 0 })) });
    const interaction = new FakeReaperInteraction({ integers: { x: 10, y: 20 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    const header = embedsOf(answerOf(interaction))[0];
    expect(header).toBeDefined();
    const headerText = JSON.stringify(header);
    expect(headerText).toContain("Kingdom 330");
    expect(headerText).toContain("X:10 Y:20");
    expect(headerText).toContain("Neil cannot see shields reliably");
  });

  test("shows each of the 3 closest Exiles with coordinates, distance, reason and the date exiled", async () => {
    store.add(exileOf(FAR, "Far", { x: 3, y: 4 }));
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    store.add(exileOf(MID, "Mid", { x: 0, y: 2 }));
    const { context } = closestContext(store, {
      read: readsOf(
        playerOf(NEAR, "Near", HOME, { x: 1, y: 0 }),
        playerOf(MID, "Mid", HOME, { x: 0, y: 2 }),
        playerOf(FAR, "Far", HOME, { x: 3, y: 4 }),
      ),
    });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    const far = exileEmbedsOf(interaction)[2];
    expect(far).toBeDefined();
    if (far === undefined) return;
    expect(fieldValue(far, "Coordinates")).toBe("X:3 Y:4");
    expect(fieldValue(far, "Distance")).toContain("5");
    expect(fieldValue(far, "Reason")).toBe("Reason of Far");
    expect(fieldValue(far, "Exiled on")).toBeDefined();
  });

  test("shows each Exile with the player card as /player shows it", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const near = playerOf(NEAR, "Near", HOME, { x: 1, y: 0 });
    const { context } = closestContext(store, { read: readsOf(near) });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    const card = renderPlayerCard(near, FETCHED_AT, NOW);
    const shown = exileEmbedsOf(interaction)[0];
    expect(shown?.title).toBe(card.title);
    expect(shown?.fields).toEqual(expect.arrayContaining(card.fields ?? []));
  });

  test("shows every Exile of the Kingdom when there are fewer than 3", async () => {
    store.add(exileOf(FAR, "Far", { x: 3, y: 4 }));
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = closestContext(store, {
      read: readsOf(playerOf(NEAR, "Near", HOME, { x: 1, y: 0 }), playerOf(FAR, "Far", HOME, { x: 3, y: 4 })),
    });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(titlesOf(exileEmbedsOf(interaction))).toEqual(["Near", "Far"]);
  });

  test("marks an Exile that could not be read with its stored position and the date of it", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = closestContext(store, { read: () => Promise.reject(new Error("the Game API timed out")) });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    const [near] = exileEmbedsOf(interaction);
    expect(near).toBeDefined();
    expect(JSON.stringify(near)).toContain("position as of");
    expect(JSON.stringify(near)).toContain("Near");
  });

  test("ranks the Exiles left after the Daily Quota runs out by their stored positions", async () => {
    store.add(exileOf(FAR, "Far", { x: 100, y: 0 }));
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    store.add(exileOf(MID, "Mid", { x: 2, y: 0 }));
    const { context } = closestContext(store, {
      read: (uid) => {
        const result: LookupResult<Player> =
          uid === FAR ? found(playerOf(FAR, "Far", HOME, { x: 100, y: 0 })) : { kind: "quota-spent", resetsAt: RESETS_AT };
        return Promise.resolve(result);
      },
    });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    const shown = exileEmbedsOf(interaction);
    expect(titlesOf(shown)).toEqual(["Near", "Mid", "Far"]);
    expect(JSON.stringify(shown[0])).toContain("position as of");
    expect(JSON.stringify(shown[1])).toContain("position as of");
    expect(JSON.stringify(shown[2])).not.toContain("position as of");
  });

  test("says the usual quota text when the Daily Quota is spent and no Exile has a stored position", async () => {
    store.add(exileOf(NEAR, "Near", undefined));
    store.add(exileOf(MID, "Mid", undefined));
    const { context } = closestContext(store, {
      read: () => Promise.resolve({ kind: "quota-spent", resetsAt: RESETS_AT }),
    });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(repliesOf(interaction)).toEqual([lookupMessages.quotaSpent(RESETS_AT, NOW)]);
  });

  test("stores the name, Kingdom and position of an Exile from its fresh read, keeping reason, date and adder", async () => {
    const stored = exileOf(NEAR, "Old name", { x: 1, y: 1 });
    store.add(stored);
    const { context } = closestContext(store, { read: readsOf(playerOf(NEAR, "Vex", HOME, { x: 120, y: 340 })) });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(store.find(NEAR)).toEqual({
      ...stored,
      name: "Vex",
      position: { x: 120, y: 340 },
      positionAt: FETCHED_AT,
    });
  });

  test("stores the Kingdom an Exile moved to, and leaves that Exile out of the answer", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = closestContext(store, { read: readsOf(playerOf(NEAR, "Near", OTHER_KINGDOM, { x: 1, y: 0 })) });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(store.find(NEAR)?.kingdom).toBe(OTHER_KINGDOM);
    expect(repliesOf(interaction)).toEqual(["No Exiles in Kingdom 330."]);
  });

  test("reads at most 4 Exiles at once, and reads each of them", async () => {
    const exiles = [0, 1, 2, 3, 4, 5].map((index) => ({
      uid: uidOf(`14556325479${index.toString()}`),
      name: `Exile ${index.toString()}`,
      position: { x: index, y: 0 },
    }));
    for (const exile of exiles) {
      store.add(exileOf(exile.uid, exile.name, exile.position));
    }
    const waiting: (() => void)[] = [];
    let inFlight = 0;
    let peak = 0;
    const getPlayer = vi.fn<GetPlayer>((uid) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const exile = exiles.find((candidate) => candidate.uid === uid);
      return new Promise<LookupResult<Player>>((resolve) => {
        waiting.push(() => {
          inFlight -= 1;
          const result: LookupResult<Player> =
            exile === undefined ? { kind: "not-found" } : found(playerOf(uid, exile.name, HOME, exile.position));
          resolve(result);
        });
      });
    });
    const context: ReaperClosestContext = {
      links: { linkFor: () => undefined },
      gameApi: { getPlayer },
      reaper: store,
      homeKingdom: HOME,
      now: () => NOW,
      logError: vi.fn<(message: string) => void>(),
    };
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    const running = handleReaperClosest(interaction, context);
    for (let released = 0; released < exiles.length; released += 1) {
      await settle();
      const next = waiting.shift();
      if (next === undefined) break;
      next();
    }
    await running;

    expect(peak).toBe(4);
    expect(getPlayer).toHaveBeenCalledTimes(exiles.length);
  });

  test("never shows the Member who added an Exile", async () => {
    store.add(exileOf(NEAR, "Near", { x: 1, y: 0 }));
    const { context } = closestContext(store, { read: readsOf(playerOf(NEAR, "Near", HOME, { x: 1, y: 0 })) });
    const interaction = new FakeReaperInteraction({ integers: { x: 0, y: 0 } }, CALLER_ID);

    await handleReaperClosest(interaction, context);

    expect(JSON.stringify(interaction.calls)).not.toContain(ADDER_ID);
  });
});
