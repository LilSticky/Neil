import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { CityRotationMode, SiegeTime } from "../domain/city-rotation.js";
import { CityRotationStore, EMPTY_CITY_ROTATION, type CityRotationState } from "../storage/city-rotation-store.js";
import { openDatabase } from "../storage/database.js";
import { HandoverStore } from "../storage/handover-store.js";
import {
  FakeEventInvitationServer,
  KINGDOM_ANNOUNCEMENTS_CHANNEL_ID,
  NAP_LEADERS_CHANNEL_ID,
} from "./__fakes__/event-invitation-server.js";
import { createHandoverReminders, type HandoverReminders } from "./handover-reminders.js";

const HOUR_MS = 60 * 60_000;
/** Friday 20 November 2026, 18:00 Server Time. */
const SIEGE = new Date("2026-11-20T20:00:00Z");
const SIEGE_TIME: SiegeTime = { hour: 18, minute: 0 };
const ROTATION: CityRotationState = { ...EMPTY_CITY_ROTATION, order: ["NML", "ABC", "XYZ"], holding: "ABC" };

const ANNA = "111111111111111111";
const BEN = "222222222222222222";
const CARL = "333333333333333333";
const DORA = "444444444444444444";

function before(hours: number): Date {
  return new Date(SIEGE.getTime() - hours * HOUR_MS);
}

function unixOf(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

describe("the Handover Reminders", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let rotation: CityRotationStore;
  let handovers: HandoverStore;
  let server: FakeEventInvitationServer;
  let clock: Date;
  let errors: string[];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-handover-reminders-"));
    db = openDatabase(dataDir);
    rotation = new CityRotationStore(db);
    rotation.save(ROTATION);
    handovers = new HandoverStore(db);
    server = new FakeEventInvitationServer();
    // Anna and Ben lead the outgoing and the receiving Alliance; Carl is an R5 elsewhere; Dora is in [ABC] but not its R5.
    server.grantRole("R5", ANNA);
    server.grantRole("[ABC]", ANNA);
    server.grantRole("R5", BEN);
    server.grantRole("[XYZ]", BEN);
    server.grantRole("R5", CARL);
    server.grantRole("[NML]", CARL);
    server.grantRole("[ABC]", DORA);
    clock = before(24);
    errors = [];
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function reminders(options: { readonly mode?: CityRotationMode; readonly siegeTime?: SiegeTime | null } = {}): HandoverReminders {
    return createHandoverReminders({
      server,
      rotation,
      handovers,
      mode: options.mode ?? "rotation",
      siegeTime: options.siegeTime === null ? undefined : (options.siegeTime ?? SIEGE_TIME),
      now: () => clock,
      logError: (line) => {
        errors.push(line);
      },
    });
  }

  function postsIn(channelId: string) {
    return server.posts.filter((post) => post.channelId === channelId);
  }

  test("24 hours before the siege, posts a Handover Reminder in #nap-leaders mentioning exactly the two R5s", async () => {
    await reminders().tick();

    const [reminder, ...rest] = postsIn(NAP_LEADERS_CHANNEL_ID);
    expect(rest).toEqual([]);
    const content = reminder?.message.content ?? "";
    expect(content).toContain("[ABC]");
    expect(content).toContain("[XYZ]");
    expect(content).toContain(`<t:${unixOf(SIEGE)}:F>`);
    expect(content).toContain(`<t:${unixOf(SIEGE)}:R>`);
    expect(content).toContain(`<@${ANNA}>`);
    expect(content).toContain(`<@${BEN}>`);
    expect(content).not.toContain(CARL);
    expect(content).not.toContain(DORA);
    expect(reminder?.message.allowedMentions).toEqual({ parse: [], users: [ANNA, BEN] });
    expect(errors).toEqual([]);
  });

  test("with the 24-hour reminder, announces the next Holding Alliance in #home-kingdom-announcements, pinging nobody", async () => {
    await reminders().tick();

    const [announcement, ...rest] = postsIn(KINGDOM_ANNOUNCEMENTS_CHANNEL_ID);
    expect(rest).toEqual([]);
    const content = announcement?.message.content ?? "";
    expect(content).toContain("[XYZ]");
    expect(content).toContain(`<t:${unixOf(SIEGE)}:F>`);
    expect(content).not.toContain("<@");
    expect(announcement?.message.allowedMentions).toEqual({ parse: [] });
  });

  test("1 hour before the siege, posts the second Handover Reminder, saying the siege starts soon", async () => {
    await reminders().tick();
    clock = before(1);
    await reminders().tick();

    const leaders = postsIn(NAP_LEADERS_CHANNEL_ID);
    expect(leaders).toHaveLength(2);
    const content = leaders[1]?.message.content ?? "";
    expect(content).toContain("starts soon");
    expect(content).toContain(`<t:${unixOf(SIEGE)}:R>`);
    expect(leaders[1]?.message.allowedMentions).toEqual({ parse: [], users: [ANNA, BEN] });
    expect(postsIn(KINGDOM_ANNOUNCEMENTS_CHANNEL_ID)).toHaveLength(1);
  });

  test("posts nothing before the 24-hour mark and nothing from the siege on", async () => {
    clock = new Date(before(24).getTime() - 60_000);
    await reminders().tick();
    clock = SIEGE;
    await reminders().tick();

    expect(server.posts).toEqual([]);
  });

  test("posts nothing twice across repeated ticks and a reopened database", async () => {
    await reminders().tick();
    clock = new Date(clock.getTime() + 60_000);
    await reminders().tick();
    db.close();
    db = openDatabase(dataDir);
    rotation = new CityRotationStore(db);
    handovers = new HandoverStore(db);
    clock = before(1);
    await reminders().tick();
    clock = new Date(clock.getTime() + 60_000);
    await reminders().tick();

    expect(postsIn(NAP_LEADERS_CHANNEL_ID)).toHaveLength(2);
    expect(postsIn(KINGDOM_ANNOUNCEMENTS_CHANNEL_ID)).toHaveLength(1);
  });

  test("sends a missed 24-hour reminder late while the 1-hour mark is ahead", async () => {
    clock = before(10);
    await reminders().tick();

    expect(postsIn(NAP_LEADERS_CHANNEL_ID)).toHaveLength(1);
    expect(postsIn(NAP_LEADERS_CHANNEL_ID)[0]?.message.content).not.toContain("starts soon");
    expect(postsIn(KINGDOM_ANNOUNCEMENTS_CHANNEL_ID)).toHaveLength(1);
  });

  test("drops the 24-hour reminder once the 1-hour one is due, and still sends the announcement", async () => {
    clock = before(0.5);
    await reminders().tick();
    clock = new Date(clock.getTime() + 60_000);
    await reminders().tick();

    const leaders = postsIn(NAP_LEADERS_CHANNEL_ID);
    expect(leaders).toHaveLength(1);
    expect(leaders[0]?.message.content).toContain("starts soon");
    expect(postsIn(KINGDOM_ANNOUNCEMENTS_CHANNEL_ID)).toHaveLength(1);
    expect(handovers.handoverPosted(SIEGE, "reminder-24h")).toBe(true);
  });

  test("posts nothing in Contested mode", async () => {
    await reminders({ mode: "contested" }).tick();

    expect(server.posts).toEqual([]);
  });

  test("posts nothing while the siege time is not set (the rotation is paused)", async () => {
    await reminders({ siegeTime: null }).tick();

    expect(server.posts).toEqual([]);
  });

  test("posts nothing without a City Rotation", async () => {
    rotation.save(EMPTY_CITY_ROTATION);
    await reminders().tick();

    expect(server.posts).toEqual([]);
  });

  test("posts nothing when the next Alliance is the Holding Alliance", async () => {
    rotation.save({ ...EMPTY_CITY_ROTATION, order: ["ABC"], holding: "ABC" });
    await reminders().tick();

    expect(server.posts).toEqual([]);
  });

  test("names an Alliance without an R5 without a mention, and writes one #neil-log line", async () => {
    server.removeRole("R5", BEN);
    await reminders().tick();
    clock = new Date(clock.getTime() + 60_000);
    await reminders().tick();

    const reminder = postsIn(NAP_LEADERS_CHANNEL_ID)[0];
    expect(reminder?.message.content).toContain("[XYZ]");
    expect(reminder?.message.allowedMentions).toEqual({ parse: [], users: [ANNA] });
    expect(server.logs).toHaveLength(1);
    expect(server.logs[0]).toContain("[XYZ]");
    expect(server.logs[0]).toContain("R5");
  });

  test("logs a missing #nap-leaders or #home-kingdom-announcements once per post, and does not retry", async () => {
    server.withoutChannel("nap-leaders");
    server.withoutChannel("home-kingdom-announcements");
    await reminders().tick();
    clock = new Date(clock.getTime() + 60_000);
    await reminders().tick();

    expect(server.posts).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors.some((line) => line.includes("#nap-leaders"))).toBe(true);
    expect(errors.some((line) => line.includes("#home-kingdom-announcements"))).toBe(true);
  });

  test("logs a failed post once and does not retry it", async () => {
    server.failNextPost(new Error("Missing Access"));
    await reminders().tick();
    clock = new Date(clock.getTime() + 60_000);
    await reminders().tick();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Missing Access");
    expect(server.posts).toHaveLength(1);
  });
});
