import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { APIActionRowComponent, APIButtonComponentWithCustomId, APIEmbed } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cancel, newRaid } from "../domain/raid.js";
import { AvailabilityStore } from "../storage/availability-store.js";
import { openDatabase } from "../storage/database.js";
import { RaidStore } from "../storage/raid-store.js";
import { FakeRaidServer, RAID_MEMBERS, WAR_COUNCIL_ROLE_ID } from "./__fakes__/raid-server.js";
import { createAvailabilityClock, type AvailabilityClock } from "./availability-clock.js";
import type { RaidSettings } from "./raid-plan.js";

const RAID_ID = "2026-11-21";
/** Saturday 12:00 Server Time. */
const START = new Date("2026-11-21T14:00:00.000Z");
/** 72 hours before: Wednesday 12:00 Server Time. */
const OPENS = new Date("2026-11-18T14:00:00.000Z");
const LEADERS = "800000000000000002";
const SETTINGS: Pick<RaidSettings, "warCouncilRoleId"> = { warCouncilRoleId: WAR_COUNCIL_ROLE_ID };
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function embedOf(message: { readonly embeds?: readonly unknown[] | undefined }): APIEmbed {
  return message.embeds?.[0] as APIEmbed;
}

describe("the Availability clock", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let raids: RaidStore;
  let availability: AvailabilityStore;
  let server: FakeRaidServer;
  let now: Date;
  let errors: string[];
  let clock: AvailabilityClock;

  function clockWith(settings: Pick<RaidSettings, "warCouncilRoleId">): AvailabilityClock {
    return createAvailabilityClock({
      availability,
      raids,
      server,
      settings,
      now: () => now,
      logError: (line) => errors.push(line),
    });
  }

  async function tickAt(moment: Date): Promise<void> {
    now = moment;
    await clock.tick();
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-availability-clock-"));
    db = openDatabase(dataDir);
    raids = new RaidStore(db);
    availability = new AvailabilityStore(db);
    server = new FakeRaidServer();
    errors = [];
    now = new Date("2026-11-16T12:00:00.000Z");
    clock = clockWith(SETTINGS);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("is off without the War Council role", async () => {
    clock = clockWith({ warCouncilRoleId: undefined });
    await tickAt(new Date(OPENS.getTime() + MINUTE));

    expect(server.posts).toEqual([]);
    expect(availability.poll(RAID_ID)).toBeUndefined();
  });

  test("posts nothing before 72 hours before the start", async () => {
    await tickAt(new Date(OPENS.getTime() - MINUTE));

    expect(server.posts).toEqual([]);
    expect(availability.poll(RAID_ID)).toBeUndefined();
  });

  test("at the opening, posts one card per Alliance and one summary, without mentions, once", async () => {
    await tickAt(OPENS);

    expect(server.posts.map((post) => post.channelId)).toEqual(["c-abc", "c-nml", "c-xyz", LEADERS]);
    for (const post of server.posts) {
      expect(post.message.allowedMentions).toEqual({ parse: [] });
      expect(post.message.content).toBeUndefined();
      expect(JSON.stringify(post.message)).not.toMatch(/<@/);
    }
    expect(embedOf(server.postsIn("c-nml")[0]?.message ?? {}).title).toBe("Availability Poll [NML]");
    const rows = server.postsIn("c-nml")[0]?.message.components as APIActionRowComponent<APIButtonComponentWithCustomId>[];
    expect(rows[0]?.components.map((button) => button.custom_id)).toEqual([`avail:yes:${RAID_ID}:NML`, `avail:no:${RAID_ID}:NML`]);
    expect(embedOf(server.postsIn(LEADERS)[0]?.message ?? {}).title).toBe("Availability Summary");
    expect(server.logs).toEqual([`Availability Poll opened for the Raid of ${RAID_ID}: 3 of 3 Alliances got a poll card.`]);

    await tickAt(new Date(OPENS.getTime() + MINUTE));
    expect(server.posts).toHaveLength(4);
  });

  test("a restart does not post again: the poll is kept in neil.db", async () => {
    await tickAt(OPENS);
    db.close();
    db = openDatabase(dataDir);
    raids = new RaidStore(db);
    availability = new AvailabilityStore(db);
    clock = clockWith(SETTINGS);
    await tickAt(new Date(OPENS.getTime() + HOUR));

    expect(server.posts).toHaveLength(4);
    expect(availability.poll(RAID_ID)?.cards.size).toBe(3);
  });

  test("a late start still posts before the Raid start, but not at or after it", async () => {
    await tickAt(new Date(START.getTime() - MINUTE));
    expect(server.posts).toHaveLength(4);
  });

  test("a Neil started only after the Raid start posts no poll", async () => {
    await tickAt(START);
    expect(server.posts).toEqual([]);
  });

  test("a Raid cancelled before the opening gets no poll", async () => {
    const cancelled = cancel(newRaid(RAID_ID, START), new Date(OPENS.getTime() - HOUR));
    if (!cancelled.ok) throw new Error("not cancelled");
    raids.save(cancelled.raid);
    await tickAt(OPENS);

    expect(server.posts).toEqual([]);
  });

  test("an Alliance without alliance-chat, or without #kvk-leaders, is logged and skipped", async () => {
    server.allianceChats.delete("XYZ");
    server.channels.delete("kvk-leaders");
    await tickAt(OPENS);

    expect(server.posts.map((post) => post.channelId)).toEqual(["c-abc", "c-nml"]);
    expect(server.logs).toEqual([
      "The Availability Poll card of [XYZ] was not posted: its area has no alliance-chat.",
      "The Availability Summary was not posted: the server has no #kvk-leaders.",
      `Availability Poll opened for the Raid of ${RAID_ID}: 2 of 3 Alliances got a poll card.`,
    ]);
  });

  test("a failed post is logged in one line and the other cards still go out", async () => {
    const post = server.post.bind(server);
    server.post = (channelId, message) => (channelId === "c-abc" ? Promise.reject(new Error("Missing Access")) : post(channelId, message));
    await tickAt(OPENS);

    expect(server.posts.map((sent) => sent.channelId)).toEqual(["c-nml", "c-xyz", LEADERS]);
    expect(server.logs[0]).toBe("The Availability Poll card of [ABC] could not be posted: Missing Access");
    expect(errors).toEqual(["The Availability Poll card of [ABC] could not be posted: Missing Access"]);
  });

  test("at the start, the cards lose their buttons and show the final counts, then the answers are gone", async () => {
    await tickAt(OPENS);
    availability.record(RAID_ID, { memberId: "101", tag: "NML", availability: { kind: "available", fighterClass: "whale" } }, OPENS);
    availability.record(RAID_ID, { memberId: "103", tag: "NML", availability: { kind: "available", fighterClass: "small-fry" } }, OPENS);
    availability.record(RAID_ID, { memberId: "201", tag: "ABC", availability: { kind: "not-available" } }, OPENS);

    await tickAt(new Date(START.getTime() - MINUTE));
    expect(server.edits).toEqual([]);
    await tickAt(START);

    expect(server.edits).toHaveLength(4);
    for (const edit of server.edits) {
      expect(edit.edit.components).toEqual([]);
      expect(edit.edit.embeds[0]?.title).toMatch(/\(closed\)$/);
    }
    const nml = server.edits.find((edit) => edit.card.channelId === "c-nml");
    expect(nml?.edit.embeds[0]?.fields?.[0]?.value).toContain("Whales: 1");
    expect(nml?.edit.embeds[0]?.fields?.[0]?.value).toContain("Small Fry (counted apart): 1");
    expect(nml?.edit.embeds[0]?.description).toContain("has started");
    expect(availability.answers(RAID_ID)).toEqual([]);
    expect(availability.poll(RAID_ID)?.state).toEqual({ kind: "closed", reason: "started" });
    expect(server.logs.at(-1)).toBe(
      `Availability Poll for the Raid of ${RAID_ID} closed at the Raid start. Kingdom: Whales 1, Dolphins 0, Seals 0, Fighters 1; Small Fry 1; Not available 1.`,
    );
    for (const line of server.logs) for (const member of RAID_MEMBERS) expect(line).not.toContain(member.id);

    await tickAt(new Date(START.getTime() + MINUTE));
    expect(server.edits).toHaveLength(4);
  });

  test("a cancel closes the poll as cancelled on the next tick", async () => {
    await tickAt(OPENS);
    availability.record(RAID_ID, { memberId: "101", tag: "NML", availability: { kind: "not-available" } }, OPENS);
    const cancelled = cancel(newRaid(RAID_ID, START), new Date(OPENS.getTime() + HOUR));
    if (!cancelled.ok) throw new Error("not cancelled");
    raids.save(cancelled.raid);
    await tickAt(new Date(OPENS.getTime() + HOUR + MINUTE));

    expect(server.edits).toHaveLength(4);
    expect(server.edits[0]?.edit.embeds[0]?.description).toContain("**Cancelled**");
    expect(server.edits.every((edit) => edit.edit.components.length === 0)).toBe(true);
    expect(availability.poll(RAID_ID)?.state).toEqual({ kind: "closed", reason: "cancelled" });
    expect(availability.answers(RAID_ID)).toEqual([]);
    expect(server.logs.at(-1)).toContain("closed, the Raid was cancelled");
  });

  test("a poll left open from an earlier week closes on the next tick", async () => {
    await tickAt(OPENS);
    await tickAt(new Date("2026-11-23T12:00:00.000Z"));

    expect(availability.poll(RAID_ID)?.state).toEqual({ kind: "closed", reason: "started" });
  });

  test("a gone card is logged once, not posted again", async () => {
    await tickAt(OPENS);
    const card = availability.poll(RAID_ID)?.cards.get("NML");
    if (card === undefined) throw new Error("no card");
    server.gone.add(card.messageId);
    await tickAt(START);

    expect(server.posts).toHaveLength(4);
    expect(server.logs.filter((line) => line.includes("is gone"))).toEqual([
      `The Availability Poll card of [NML] for the Raid of ${RAID_ID} is gone; Neil does not post it again.`,
    ]);
  });
});
