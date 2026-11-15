import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { APIEmbed } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { DuelPlan } from "../domain/duel-plan.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { ANNOUNCEMENTS_CHANNEL_ID, FakeEventInvitationServer } from "./__fakes__/event-invitation-server.js";
import { createDuelPlanPoster, type DuelPlanPoster } from "./duel-plan.js";

const MINUTE_MS = 60_000;
/** Monday 16 November 2026, 00:00 Server Time. */
const MONDAY_RESET = new Date("2026-11-16T02:00:00Z");
const TUESDAY_RESET = new Date("2026-11-17T02:00:00Z");

const entry = { scores: "Build and research.", save: "Speedups for Thursday." };
const FULL_PLAN: DuelPlan = {
  monday: entry,
  tuesday: entry,
  wednesday: entry,
  thursday: entry,
  friday: entry,
  saturday: entry,
};

function unixOf(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

describe("the Duel Plan poster", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let store: EventStore;
  let server: FakeEventInvitationServer;
  let clock: Date;
  let errors: string[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-duel-plan-"));
    db = openDatabase(dataDir);
    store = new EventStore(db);
    server = new FakeEventInvitationServer();
    clock = MONDAY_RESET;
    errors = [];
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function poster(
    plan: DuelPlan = FULL_PLAN,
    overrides: { readonly server?: Pick<FakeEventInvitationServer, "announcementsChannelId" | "post" | "log">; readonly events?: EventStore } = {},
  ): DuelPlanPoster {
    return createDuelPlanPoster({
      server: overrides.server ?? server,
      events: overrides.events ?? store,
      plan,
      now: () => clock,
      logError: (line) => {
        errors.push(line);
      },
    });
  }

  function embedOf(index: number): APIEmbed {
    const embed = server.posts[index]?.message.embeds?.[0];
    if (embed === undefined || !("title" in embed)) throw new Error("no embed posted");
    return embed;
  }

  test("at Monday's reset, posts one card in #event-announcements with both texts, mentioning nobody", async () => {
    await poster().tick();

    expect(server.posts).toHaveLength(1);
    expect(server.posts[0]?.channelId).toBe(ANNOUNCEMENTS_CHANNEL_ID);
    const message = server.posts[0]?.message;
    expect(message?.allowedMentions).toEqual({ parse: [] });
    expect(message?.content ?? "").not.toMatch(/<@/);
    const embed = embedOf(0);
    expect(embed.title).toBe("Alliance Duel: Monday");
    const end = unixOf(TUESDAY_RESET);
    expect(embed.description).toBe(`This Duel day ends <t:${end}:t> (<t:${end}:R>).`);
    expect(embed.fields).toEqual([
      { name: "Scores today", value: "Build and research." },
      { name: "Save for later", value: "Speedups for Thursday." },
    ]);
  });

  test("leaves out the Save for later field when its text is empty", async () => {
    await poster({ ...FULL_PLAN, monday: { scores: "Build.", save: "  " } }).tick();

    expect(embedOf(0).fields).toEqual([{ name: "Scores today", value: "Build." }]);
  });

  test("ticking every minute through a Duel day, and again after reopening the database, posts exactly one card", async () => {
    const duel = poster();
    for (let at = MONDAY_RESET.getTime(); at < TUESDAY_RESET.getTime(); at += 10 * MINUTE_MS) {
      clock = new Date(at);
      await duel.tick();
    }
    db.close();
    db = openDatabase(dataDir);
    store = new EventStore(db);
    clock = new Date("2026-11-16T20:00:00Z");
    await poster().tick();

    expect(server.posts).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test("a first tick late in the Duel day still posts that day's card", async () => {
    clock = new Date("2026-11-16T20:00:00Z");

    await poster().tick();

    expect(server.posts).toHaveLength(1);
    expect(embedOf(0).title).toBe("Alliance Duel: Monday");
  });

  test("posts nothing on a Sunday in Server Time, including Monday before 02:00 UTC", async () => {
    for (const at of ["2026-11-22T02:00:00Z", "2026-11-22T12:00:00Z", "2026-11-23T01:59:00Z"]) {
      clock = new Date(at);
      await poster().tick();
    }

    expect(server.posts).toEqual([]);
    expect(server.logs).toEqual([]);
  });

  test("a failed post is logged once and not retried that day", async () => {
    server.failNextPost(new Error("Missing Access"));
    const duel = poster();

    await duel.tick();
    clock = new Date(MONDAY_RESET.getTime() + MINUTE_MS);
    await duel.tick();

    expect(server.posts).toEqual([]);
    expect(errors).toEqual([expect.stringContaining("Missing Access")]);
  });

  test("a day with an empty text posts no card and writes one #neil-log line", async () => {
    const duel = poster({ ...FULL_PLAN, monday: { scores: " ", save: "Speedups." } });

    await duel.tick();
    clock = new Date(MONDAY_RESET.getTime() + MINUTE_MS);
    await duel.tick();

    expect(server.posts).toEqual([]);
    expect(server.logs).toEqual(["No Duel Plan text for Monday in src/duel-plan.ts; nothing was posted."]);
  });

  test("with no #event-announcements, logs the error and posts nothing", async () => {
    const noChannel = {
      announcementsChannelId: (): string | undefined => undefined,
      post: server.post.bind(server),
      log: server.log.bind(server),
    };

    await poster(FULL_PLAN, { server: noChannel }).tick();

    expect(server.posts).toEqual([]);
    expect(errors).toEqual([expect.stringContaining("event-announcements")]);
  });

  test("never throws: a failing store is logged", async () => {
    const failing = new EventStore(db);
    failing.duelPlanPostedOn = () => {
      throw new Error("neil.db is locked");
    };

    await expect(poster(FULL_PLAN, { events: failing }).tick()).resolves.toBeUndefined();

    expect(errors).toEqual([expect.stringContaining("neil.db is locked")]);
  });
});
