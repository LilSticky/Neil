import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { GuildScheduledEventStatus } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { ANNOUNCEMENTS_CHANNEL_ID, FakeEventInvitationServer } from "./__fakes__/event-invitation-server.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import { createEventInvitations, eventOf, type EventInvitations } from "./events.js";

/** A discord.js scheduled event as Neil receives it: a plain object with the fields the boundary reads. */
interface ScheduledEventFake {
  id: string;
  name: string;
  scheduledStartTimestamp: number | null;
  description: string | null;
  status: GuildScheduledEventStatus;
  creatorId: string | null;
  guildId: string;
}

/** 2026-11-14 19:00 UTC, in milliseconds, as discord.js gives a start. */
const START_MS = Date.UTC(2026, 10, 14, 19, 0);

function scheduledEvent(overrides: Partial<ScheduledEventFake> = {}): ScheduledEventFake {
  return {
    id: "1100000000000000001",
    name: "[NML] Hive move",
    scheduledStartTimestamp: START_MS,
    description: "Guide: https://example.com/hive",
    status: GuildScheduledEventStatus.Scheduled,
    creatorId: "1100000000000000002",
    guildId: "1000000000000000003",
    ...overrides,
  };
}

describe("eventOf", () => {
  test("reads a scheduled event as an Event: id, name, start, description, status and creator", () => {
    expect(eventOf(scheduledEvent())).toEqual({
      ok: true,
      value: {
        id: "1100000000000000001",
        name: "[NML] Hive move",
        start: new Date(START_MS),
        description: "Guide: https://example.com/hive",
        status: "scheduled",
        creatorId: "1100000000000000002",
      },
    });
  });

  test.each([
    [GuildScheduledEventStatus.Scheduled, "scheduled"],
    [GuildScheduledEventStatus.Active, "active"],
    [GuildScheduledEventStatus.Completed, "completed"],
    [GuildScheduledEventStatus.Canceled, "cancelled"],
  ])("reads Discord status %s as the Event status %s", (discordStatus, eventStatus) => {
    const result = eventOf(scheduledEvent({ status: discordStatus }));

    expect(result).toMatchObject({ ok: true, value: { status: eventStatus } });
  });

  test("reads an empty description as empty text", () => {
    const result = eventOf(scheduledEvent({ description: null }));

    expect(result).toMatchObject({ ok: true, value: { description: "" } });
  });

  test("reads an event with no creator as having no creator id", () => {
    const result = eventOf(scheduledEvent({ creatorId: null }));

    expect(result).toMatchObject({ ok: true, value: { creatorId: undefined } });
  });

  test("rejects an event with no start, without throwing", () => {
    expect(() => eventOf(scheduledEvent({ scheduledStartTimestamp: null }))).not.toThrow();
    expect(eventOf(scheduledEvent({ scheduledStartTimestamp: null }))).toEqual({ ok: false, reason: "no-start" });
  });

  test("rejects an event whose id is not a Discord id, without throwing", () => {
    expect(() => eventOf(scheduledEvent({ id: "not-an-id" }))).not.toThrow();
    expect(eventOf(scheduledEvent({ id: "not-an-id" }))).toEqual({ ok: false, reason: "malformed-id" });
  });

  test("rejects anything that is not a scheduled event, without throwing", () => {
    expect(() => eventOf(null)).not.toThrow();
    expect(eventOf(null).ok).toBe(false);
    expect(eventOf("[NML] Hive move").ok).toBe(false);
  });
});

/** 2026-11-07 12:00 UTC: the moment Neil sees the Events in these tests. */
const NOW = new Date("2026-11-07T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
/** A start three days after NOW: still ahead. */
const AHEAD_MS = NOW.getTime() + 3 * DAY_MS;
const EVENT_ID = "1100000000000000010";

/** The Members of these tests. Their ids are snowflake-like strings, as Discord gives them. */
const ALICE = "111111111111111111";
const BOB = "222222222222222222";
const CAROL = "333333333333333333";
const DAVE = "444444444444444444";
const EVE = "555555555555555555";
const FRANK = "666666666666666666";

const OFFICER_ROLE = { id: "900000000000000001", name: "King" };
const NML_ROLE = { id: "900000000000000002", name: "[NML]" };
const NML_CHAT_ID = "700000000000000011";

/** An Event created by a Member, starting three days from NOW and scheduled, unless overridden. */
function eventCreatedBy(creatorId: string, name: string, overrides: Partial<ScheduledEventFake> = {}): ScheduledEventFake {
  return scheduledEvent({
    id: EVENT_ID,
    name,
    scheduledStartTimestamp: AHEAD_MS,
    creatorId,
    ...overrides,
  });
}

/** Distinct 18-digit Member ids, for the chunking test. */
function manyMemberIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `1${index.toString().padStart(17, "0")}`);
}

describe("Event invitations (US1, T006 and T007)", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let events: EventStore;
  let links: FakeLinkStore;
  let server: FakeEventInvitationServer;
  let logErrors: string[];
  let invitations: EventInvitations;

  /** A handler over the same stores and server, as it is after a restart. */
  function invitationsOver(): EventInvitations {
    return createEventInvitations({
      events,
      links,
      server,
      officerRoleIds: [OFFICER_ROLE.id],
      now: () => NOW,
      logError: (line) => logErrors.push(line),
    });
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-event-invitations-"));
    db = openDatabase(dataDir);
    events = new EventStore(db);
    links = new FakeLinkStore();
    server = new FakeEventInvitationServer();
    logErrors = [];
    server.giveRoles(ALICE, [OFFICER_ROLE]);
    links.link(BOB, { source: "game-api", rank: "R5" });
    server.giveRoles(BOB, [NML_ROLE]);
    links.link(CAROL, { source: "game-api", rank: "R2" });
    server.giveRoles(CAROL, [NML_ROLE]);
    server.grantAllianceChat("NML", NML_CHAT_ID);
    invitations = invitationsOver();
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("a created Event (T006)", () => {
    test("a Kingdom Event by an Officer is posted once in #event-announcements, mentioning the Events holders", async () => {
      server.grantRole("Events", DAVE);
      server.grantRole("Events", EVE);

      await invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"));

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]).toMatchObject({
        channelId: ANNOUNCEMENTS_CHANNEL_ID,
        message: { allowedMentions: { users: [DAVE, EVE] } },
      });
    });

    test("a Kingdom Event leaves out the Events holders who have Event Invitations Off", async () => {
      server.grantRole("Events", DAVE);
      server.grantRole("Events", EVE);
      events.setInvitationsOff(EVE);

      await invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"));

      expect(server.posts[0]).toMatchObject({ message: { allowedMentions: { users: [DAVE] } } });
    });

    test("an Alliance Event by its R5 is posted in that Alliance's alliance-chat, mentioning the holders of its role", async () => {
      server.grantRole("[NML]", BOB);
      server.grantRole("[NML]", FRANK);

      await invitations.onCreated(eventCreatedBy(BOB, "[NML] Hive move"));

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]).toMatchObject({
        channelId: NML_CHAT_ID,
        message: { allowedMentions: { users: [BOB, FRANK] } },
      });
    });

    test("an Event with nobody to mention is posted without mentions", async () => {
      await invitations.onCreated(eventCreatedBy(BOB, "[NML] Hive move"));

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]).toMatchObject({ message: { allowedMentions: { users: [] } } });
      expect(server.posts[0]?.message.content).not.toContain("<@");
    });

    test("an Event with more mentions than one message holds is posted once, with the rest in follow-up messages", async () => {
      for (const memberId of manyMemberIds(85)) server.grantRole("Events", memberId);

      await invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"));

      expect(server.posts.map((post) => post.message.allowedMentions?.users?.length)).toEqual([80, 5]);
      const cards = server.posts.filter((post) => (post.message.embeds?.length ?? 0) > 0);
      expect(cards).toHaveLength(1);
    });

    test("marks the Event invited at the moment it is posted", async () => {
      await invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"));

      expect(events.findEvent(EVENT_ID)?.invitedAt).toBe(NOW.toISOString());
    });

    test("records when Neil first saw the Event", async () => {
      await invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"));

      expect(events.findEvent(EVENT_ID)?.firstSeenAt).toBe(NOW.toISOString());
    });

    test("writes one #neil-log line for the invitation, naming the Event", async () => {
      await invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"));

      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toContain("AD round 3");
    });

    test("refuses an Alliance Event whose tag has no Alliance role or alliance-chat: no post, one log line naming the Event", async () => {
      await invitations.onCreated(eventCreatedBy(ALICE, "[XYZ] Hive move"));

      expect(server.posts).toHaveLength(0);
      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toContain("[XYZ] Hive move");
      expect(events.findEvent(EVENT_ID)?.invitedAt).toBeUndefined();
    });

    test("refuses an Alliance Event by a Member who is not R4 or R5 of its Alliance: no post, one log line naming the Event and its creator", async () => {
      await invitations.onCreated(eventCreatedBy(CAROL, "[NML] Hive move"));

      expect(server.posts).toHaveLength(0);
      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toContain("[NML] Hive move");
      expect(server.logs[0]).toContain(CAROL);
    });

    test("refuses a Kingdom Event by a Member who is not an Officer: no post, one log line naming the Event and its creator", async () => {
      await invitations.onCreated(eventCreatedBy(BOB, "AD round 3"));

      expect(server.posts).toHaveLength(0);
      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toContain("AD round 3");
      expect(server.logs[0]).toContain(BOB);
    });

    test("a failed post logs the error and throws nothing, and the Event is not marked invited", async () => {
      server.failNextPost(new Error("Missing Permissions"));

      await expect(invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"))).resolves.toBeUndefined();

      expect(server.posts).toHaveLength(0);
      expect(logErrors).toHaveLength(1);
      expect(events.findEvent(EVENT_ID)?.invitedAt).toBeUndefined();
    });
  });

  describe("at startup and on an edit (T007)", () => {
    test("invites each fetched Event that is still ahead and has no invitation yet", async () => {
      server.setScheduledEvents([
        eventCreatedBy(ALICE, "AD round 3", { id: "1100000000000000011" }),
        eventCreatedBy(BOB, "[NML] Hive move", { id: "1100000000000000012" }),
      ]);

      await invitations.onStartup();

      expect(server.posts.map((post) => post.channelId)).toEqual([ANNOUNCEMENTS_CHANNEL_ID, NML_CHAT_ID]);
    });

    test("posts nothing for a fetched Event whose start has already passed", async () => {
      server.setScheduledEvents([eventCreatedBy(ALICE, "AD round 3", { scheduledStartTimestamp: NOW.getTime() - 60 * 60 * 1000 })]);

      await invitations.onStartup();

      expect(server.posts).toHaveLength(0);
    });

    test("after a restart, posts no second invitation for an Event already invited", async () => {
      const event = eventCreatedBy(ALICE, "AD round 3");
      await invitations.onCreated(event);
      server.setScheduledEvents([event]);

      await invitationsOver().onStartup();

      expect(server.posts).toHaveLength(1);
    });

    test("an edit of an invited Event posts nothing", async () => {
      await invitations.onCreated(eventCreatedBy(ALICE, "AD round 3"));

      await invitations.onUpdated(eventCreatedBy(ALICE, "AD round 3 (moved)", { scheduledStartTimestamp: AHEAD_MS + DAY_MS }));

      expect(server.posts).toHaveLength(1);
    });
  });
});
