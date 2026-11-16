import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { addPhase, assign, cancel, newRaid, publish, type Raid, type RaidResult } from "../domain/raid.js";
import { openDatabase } from "../storage/database.js";
import { RaidStore } from "../storage/raid-store.js";
import { FakeRaidServer, WAR_COUNCIL_ROLE_ID } from "./__fakes__/raid-server.js";
import { createRaidClock, type RaidClock } from "./raid-clock.js";
import type { RaidSettings } from "./raid-plan.js";

const RAID_ID = "2026-11-21";
const START = new Date("2026-11-21T22:00:00.000Z");
const LEADERS = "800000000000000002";
const SETTINGS: RaidSettings = { warCouncilRoleId: WAR_COUNCIL_ROLE_ID, startMinutes: 20 * 60, planHours: 24, confirmationHours: 2 };
const TAGS = ["ABC", "NML", "XYZ"];
const HOUR = 3_600_000;

function ok(result: RaidResult): Raid {
  if (!result.ok) throw new Error(result.refusal.kind);
  return result.raid;
}

function hoursBeforeStart(hours: number): Date {
  return new Date(START.getTime() - hours * HOUR);
}

/** Published Thursday: Phase Opening at 20:00 with NML, Phase Push at 21:00 with nobody, ABC for the whole Raid. */
function publishedRaid(): Raid {
  let raid = ok(addPhase(newRaid(RAID_ID, START), "Opening", "20:00"));
  raid = ok(addPhase(raid, "Push", "21:00"));
  raid = ok(assign(raid, { tag: "NML", objective: "Royal City", phase: "Opening", task: undefined }, TAGS));
  raid = ok(assign(raid, { tag: "ABC", objective: "Enemy sanctuaries", phase: undefined, task: undefined }, TAGS));
  return ok(publish(raid, new Date("2026-11-19T12:00:00.000Z")));
}

describe("the Raid clock", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let raids: RaidStore;
  let server: FakeRaidServer;
  let now: Date;
  let clock: RaidClock;

  function clockWith(settings: RaidSettings): RaidClock {
    return createRaidClock({ raids, server, settings, now: () => now, logError: () => undefined });
  }

  async function tickAt(moment: Date): Promise<void> {
    now = moment;
    await clock.tick();
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-raid-clock-"));
    db = openDatabase(dataDir);
    raids = new RaidStore(db);
    server = new FakeRaidServer();
    now = new Date("2026-11-16T12:00:00.000Z");
    clock = clockWith(SETTINGS);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("does nothing while the War Council role is unset", async () => {
    clock = clockWith({ ...SETTINGS, warCouncilRoleId: undefined, startMinutes: undefined });
    await tickAt(hoursBeforeStart(1));

    expect(server.posts).toEqual([]);
    expect(raids.find(RAID_ID)).toBeUndefined();
  });

  test("at the Plan Deadline with nothing published, mentions the War Council in kvk-leaders, once", async () => {
    await tickAt(hoursBeforeStart(24.5));
    expect(server.posts).toEqual([]);

    await tickAt(hoursBeforeStart(24));
    await tickAt(hoursBeforeStart(23.9));

    expect(server.postsIn(LEADERS)).toHaveLength(1);
    expect(server.posts[0]?.message.content).toContain("no Battle Plan is published");
    expect(server.posts[0]?.message.allowedMentions).toEqual({ parse: [], users: ["900"] });
  });

  test("a draft cancelled before the Plan Deadline gets no mention", async () => {
    raids.save(ok(cancel(newRaid(RAID_ID, START), hoursBeforeStart(30))));
    await tickAt(hoursBeforeStart(24));

    expect(server.posts).toEqual([]);
  });

  test("chases only the unconfirmed on-plan Alliances, 12 h and 2 h before the Confirmation Deadline, then lists the missing", async () => {
    raids.save(publishedRaid());
    raids.addConfirmation(RAID_ID, { tag: "ABC", memberId: "201", at: hoursBeforeStart(20) });

    await tickAt(hoursBeforeStart(14));
    await tickAt(hoursBeforeStart(4));
    await tickAt(hoursBeforeStart(2));

    const posts = server.postsIn(LEADERS);
    expect(posts.map((post) => post.message.content?.split(".")[0])).toEqual([
      "Plan Confirmation still missing from [NML]",
      "Plan Confirmation still missing from [NML]",
      "War Council: the Confirmation Deadline has come",
    ]);
    expect(posts[0]?.message.allowedMentions).toEqual({ parse: [], users: ["101", "102"] });
    expect(posts[2]?.message.content).toContain("No Plan Confirmation from [NML]");
    expect(posts[2]?.message.allowedMentions).toEqual({ parse: [], users: ["900"] });
  });

  test("Raid Reminders 30 minutes before the start and at each Phase, in the assigned Alliances' alliance-chat", async () => {
    raids.save(publishedRaid());
    for (const key of ["plan-deadline", "chase:12h", "chase:2h", "confirmation-deadline"]) raids.recordNotice(publishedRaid(), key, START);

    await tickAt(hoursBeforeStart(0.5));
    expect(server.posts.map((post) => post.channelId).sort()).toEqual(["c-abc", "c-nml"]);
    expect(server.postsIn("c-nml")[0]?.message.allowedMentions).toEqual({ parse: [], users: ["101", "102", "103"] });
    expect(server.postsIn("c-nml")[0]?.message.content).toContain("[NML] -> Royal City");

    await tickAt(START);
    expect(server.postsIn("c-nml")).toHaveLength(2);
    expect(server.postsIn("c-nml")[1]?.message.content).toContain("Phase Opening starts now");
    expect(server.postsIn("c-abc")).toHaveLength(1);

    await tickAt(new Date(START.getTime() + HOUR));
    expect(server.posts).toHaveLength(3);
    expect(server.logs.some((line) => line.includes("Phase Push") && line.includes("no Assignments"))).toBe(true);
  });

  test("nothing is sent twice, also after a restart with a new clock", async () => {
    raids.save(publishedRaid());
    await tickAt(hoursBeforeStart(14));
    clock = clockWith(SETTINGS);
    await tickAt(hoursBeforeStart(14));

    expect(server.postsIn(LEADERS)).toHaveLength(1);
  });

  test("missed while off: only the deadline list goes out, the chases are recorded", async () => {
    raids.save(publishedRaid());
    await tickAt(hoursBeforeStart(1.5));

    expect(server.postsIn(LEADERS)).toHaveLength(1);
    expect(server.posts[0]?.message.content).toContain("Confirmation Deadline has come");
    expect(raids.noticesHandled(RAID_ID)).toEqual(new Set(["plan-deadline", "chase:12h", "chase:2h", "confirmation-deadline"]));
  });

  test("a cancelled Raid sends nothing more", async () => {
    raids.save(ok(cancel(publishedRaid(), hoursBeforeStart(20))));
    for (const hours of [14, 4, 2, 0.5, 0]) await tickAt(hoursBeforeStart(hours));

    expect(server.posts).toEqual([]);
  });
});
