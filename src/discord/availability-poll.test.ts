import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  ButtonStyle,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
} from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { FighterClassThresholds } from "../domain/availability.js";
import { cancel, newRaid } from "../domain/raid.js";
import { AvailabilityStore } from "../storage/availability-store.js";
import { openDatabase } from "../storage/database.js";
import { RaidStore } from "../storage/raid-store.js";
import { FakeBootyCallGameApi, FakeBootyCallLinks } from "./__fakes__/booty-call-game.js";
import { FakeRaidServer, WAR_COUNCIL_ROLE_ID } from "./__fakes__/raid-server.js";
import { createAvailabilityClock } from "./availability-clock.js";
import { createAvailabilityPoll, type AvailabilityPoll, type AvailabilityPress } from "./availability-poll.js";

const RAID_ID = "2026-11-21";
const START = new Date("2026-11-21T14:00:00.000Z");
const OPENS = new Date("2026-11-18T14:00:00.000Z");
const THURSDAY = new Date("2026-11-19T12:00:00.000Z");
const SETTINGS = { warCouncilRoleId: WAR_COUNCIL_ROLE_ID };
const THRESHOLDS: FighterClassThresholds = {
  whale: { bracket: "T10", might: 150_000_000 },
  dolphin: { bracket: "T9", might: 60_000_000 },
  seal: { bracket: "T7", might: 20_000_000 },
};
const LEVELS = [1, 3, 6, 10, 14, 17, 20, 24, 27, 30];
const LEADERS = "800000000000000002";
const ALICE = "111111111111111111";

interface Answers {
  readonly replies: InteractionReplyOptions[];
  readonly edits: InteractionEditReplyOptions[];
  readonly updates: InteractionUpdateOptions[];
  deferred: number;
}

function pressOf(customId: string, roleNames: string[], userId = ALICE): AvailabilityPress & Answers {
  const answers: Answers = { replies: [], edits: [], updates: [], deferred: 0 };
  return Object.assign(answers, {
    customId,
    user: { id: userId },
    memberRoles: () => roleNames.map((name) => ({ id: `role-${name}`, name })),
    reply: (options: InteractionReplyOptions) => {
      answers.replies.push(options);
      return Promise.resolve();
    },
    deferReply: () => {
      answers.deferred += 1;
      return Promise.resolve();
    },
    editReply: (options: InteractionEditReplyOptions) => {
      answers.edits.push(options);
      return Promise.resolve();
    },
    update: (options: InteractionUpdateOptions) => {
      answers.updates.push(options);
      return Promise.resolve();
    },
  });
}

function buttonsOf(options: { readonly components?: readonly unknown[] | undefined }): APIButtonComponentWithCustomId[] {
  return ((options.components ?? []) as APIActionRowComponent<APIButtonComponentWithCustomId>[]).flatMap((row) => row.components);
}

describe("the Availability Poll buttons", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let raids: RaidStore;
  let availability: AvailabilityStore;
  let server: FakeRaidServer;
  let links: FakeBootyCallLinks;
  let game: FakeBootyCallGameApi;
  let now: Date;
  let poll: AvailabilityPoll;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-availability-poll-"));
    db = openDatabase(dataDir);
    raids = new RaidStore(db);
    availability = new AvailabilityStore(db);
    server = new FakeRaidServer();
    links = new FakeBootyCallLinks();
    links.link(ALICE, "145563254785");
    game = new FakeBootyCallGameApi();
    now = OPENS;
    const deps = { availability, raids, server, settings: SETTINGS, now: () => now, logError: () => undefined };
    await createAvailabilityClock(deps).tick();
    now = THURSDAY;
    poll = createAvailabilityPoll({ ...deps, links, game, thresholds: THRESHOLDS, troopBracketLevels: LEVELS });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("Available opens a private reply with the suggested class highlighted, from the uncharged cached lookup", async () => {
    const press = pressOf(`avail:yes:${RAID_ID}:NML`, ["[NML]"]);
    await poll.onButton(press);

    expect(press.deferred).toBe(1);
    expect(game.lookups).toEqual([{ uid: "145563254785", purpose: "lookup", freshness: undefined }]);
    const reply = press.edits[0] ?? {};
    // The fake Player: sanctuary level 42 (T10 with the default levels) and 15,902,728 Might.
    expect(reply.content).toContain("Your Troop Bracket is T10 and your Might is 15,902,728.");
    expect(reply.content).toContain("Neil suggests **Whale**");
    const buttons = buttonsOf(reply);
    expect(buttons.map((button) => button.label)).toEqual(["Whale (suggested)", "Dolphin", "Seal", "Small Fry"]);
    expect(buttons.map((button) => button.style)).toEqual([ButtonStyle.Primary, ButtonStyle.Secondary, ButtonStyle.Secondary, ButtonStyle.Secondary]);
    expect(buttons[2]?.custom_id).toBe(`avail:class:seal:${RAID_ID}:NML`);
    expect(availability.answers(RAID_ID)).toEqual([]);
  });

  test("a lookup that fails suggests Small Fry and says Neil could not read the Player", async () => {
    game.failWith({ kind: "try-again" });
    const press = pressOf(`avail:yes:${RAID_ID}:NML`, ["[NML]"]);
    await poll.onButton(press);

    expect(press.edits[0]?.content).toContain("Neil could not read your Player");
    expect(buttonsOf(press.edits[0] ?? {})[3]?.label).toBe("Small Fry (suggested)");
  });

  test("picking another class records it, says until when it can change, and updates the card and the summary", async () => {
    const press = pressOf(`avail:class:dolphin:${RAID_ID}:NML`, ["[NML]"]);
    await poll.onButton(press);

    expect(availability.answers(RAID_ID)).toEqual([
      { memberId: ALICE, tag: "NML", availability: { kind: "available", fighterClass: "dolphin" } },
    ]);
    expect(press.updates[0]?.content).toContain("Recorded: available as **Dolphin** for [NML]");
    expect(press.updates[0]?.content).toContain("until the Raid starts");
    expect(press.updates[0]?.components).toEqual([]);
    expect(server.edits.map((edit) => edit.card.channelId)).toEqual(["c-nml", LEADERS]);
    expect(server.edits[0]?.edit.embeds[0]?.fields?.[0]?.value).toContain("Dolphins: 1");
    expect(server.edits[0]?.edit.components).toHaveLength(1);
    expect(server.edits[1]?.edit.embeds[0]?.description).toContain("[NML] Whales 0 · Dolphins 1");
    expect(JSON.stringify(server.edits)).not.toContain(ALICE);
  });

  test("Not available is recorded at once, privately", async () => {
    const press = pressOf(`avail:no:${RAID_ID}:NML`, ["[NML]"]);
    await poll.onButton(press);

    expect(press.replies[0]?.content).toContain("Recorded: **not available** for [NML]");
    expect(press.replies[0]?.flags).toBeDefined();
    expect(availability.answerOf(RAID_ID, ALICE)?.availability).toEqual({ kind: "not-available" });
  });

  test("a second answer replaces the first, also from another Alliance's card, and both cards show the new counts", async () => {
    await poll.onButton(pressOf(`avail:class:whale:${RAID_ID}:NML`, ["[NML]", "[ABC]"]));
    server.edits.length = 0;
    await poll.onButton(pressOf(`avail:no:${RAID_ID}:ABC`, ["[NML]", "[ABC]"]));

    expect(availability.answers(RAID_ID)).toEqual([{ memberId: ALICE, tag: "ABC", availability: { kind: "not-available" } }]);
    expect(server.edits.map((edit) => edit.card.channelId)).toEqual(["c-abc", "c-nml", LEADERS]);
    expect(server.edits[1]?.edit.embeds[0]?.fields?.[0]?.value).toContain("Whales: 0");
    expect(server.edits[2]?.edit.embeds[0]?.fields?.[0]?.value).toContain("Not available: 1");
  });

  test("a second Available shows the current answer with the class buttons again", async () => {
    await poll.onButton(pressOf(`avail:class:seal:${RAID_ID}:NML`, ["[NML]"]));
    const press = pressOf(`avail:yes:${RAID_ID}:NML`, ["[NML]"]);
    await poll.onButton(press);

    expect(press.edits[0]?.content).toContain("Your answer so far: available as Seal on the poll of [NML].");
    expect(buttonsOf(press.edits[0] ?? {})).toHaveLength(4);
  });

  test.each([
    ["without a Link", "222222222222222222", ["[NML]"], "Only Linked Members"],
    ["without the Alliance role", ALICE, ["[ABC]"], "Only Members of [NML]"],
  ])("a Member %s is refused privately", async (_case, userId, roles, text) => {
    const press = pressOf(`avail:no:${RAID_ID}:NML`, roles, userId);
    await poll.onButton(press);

    expect(press.replies[0]?.content).toContain(text);
    expect(press.replies[0]?.flags).toBeDefined();
    expect(availability.answers(RAID_ID)).toEqual([]);
    expect(server.edits).toEqual([]);
  });

  test("a press at or after the start is refused privately", async () => {
    now = START;
    const press = pressOf(`avail:class:whale:${RAID_ID}:NML`, ["[NML]"]);
    await poll.onButton(press);

    expect(press.replies[0]?.content).toContain("closed");
    expect(press.updates).toEqual([]);
    expect(availability.answers(RAID_ID)).toEqual([]);
  });

  test("a press after a cancel is refused privately", async () => {
    const cancelled = cancel(newRaid(RAID_ID, START), THURSDAY);
    if (!cancelled.ok) throw new Error("not cancelled");
    raids.save(cancelled.raid);
    const press = pressOf(`avail:no:${RAID_ID}:NML`, ["[NML]"]);
    await poll.onButton(press);

    expect(press.replies[0]?.content).toContain("cancelled");
    expect(availability.answers(RAID_ID)).toEqual([]);
  });

  test("a press on an unknown or old poll is refused privately", async () => {
    const press = pressOf("avail:no:2026-11-14:NML", ["[NML]"]);
    await poll.onButton(press);

    expect(press.replies[0]?.content).toBe("This Availability Poll is not open any more.");
  });
});
