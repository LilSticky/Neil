import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { GuildScheduledEventStatus } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { parseKingdom, type KingdomNumber } from "../domain/lookup-input.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { FakeAppliedStore } from "./__fakes__/applied-store.js";
import {
  ANNOUNCEMENTS_CHANNEL_ID,
  FakeEventInvitationServer,
  type PostedEventMessage,
} from "./__fakes__/event-invitation-server.js";
import { FakeLinkStore } from "./__fakes__/link-store.js";
import { createEventReminders, type EventReminders } from "./event-reminders.js";

/** The Discord event as Neil receives it: a plain object with the fields the boundary reads. */
interface ScheduledEventFake {
  id: string;
  name: string;
  scheduledStartTimestamp: number | null;
  description: string | null;
  status: GuildScheduledEventStatus;
  creatorId: string | null;
  guildId: string;
}

function kingdomOf(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

const HOME_KINGDOM = kingdomOf(330);
const GUILD_ID = "1000000000000000003";
const MINUTE_MS = 60_000;

/** 2026-11-14 19:00 UTC: the start of the Event in these tests. */
const START = new Date("2026-11-14T19:00:00Z");
/** Two hours after START: the start of an Event that has been moved. */
const LATER_START = new Date(START.getTime() + 120 * MINUTE_MS);
/** 2026-11-07 12:00 UTC: when Neil first saw the Event, long before any reminder. */
const FIRST_SEEN = new Date("2026-11-07T12:00:00Z");

const EVENT_ID = "1100000000000000010";
const SECOND_EVENT_ID = "1100000000000000011";
const NML_CHAT_ID = "700000000000000011";

/** The Members of these tests, in ascending id order, so the expected mentions are sorted as written. */
const ALICE = "111111111111111111"; // Home Member, Linked
const BOB = "222222222222222222"; // Home Member, Linked, holds [NML]
const CAROL = "333333333333333333"; // Guest, Linked, holds [NML]
const DAVE = "444444444444444444"; // Guest, Linked
const EVE = "555555555555555555"; // Home Member, Linked, Event Invitations Off
const FRANK = "666666666666666666"; // not Linked
const GREG = "777777777777777777"; // Home Member, Linked, has left the server

const NML_ROLE_NAME = "[NML]";

/** A discord.js scheduled event for the Event, starting at START and scheduled, unless overridden. */
function scheduledEvent(overrides: Partial<ScheduledEventFake> = {}): ScheduledEventFake {
  return {
    id: EVENT_ID,
    name: "AD round 3",
    scheduledStartTimestamp: START.getTime(),
    description: null,
    status: GuildScheduledEventStatus.Scheduled,
    creatorId: ALICE,
    guildId: GUILD_ID,
    ...overrides,
  };
}

/** The moment `minutes` before `at`. */
function before(at: Date, minutes: number): Date {
  return new Date(at.getTime() - minutes * MINUTE_MS);
}

/** The mentioned Members of a posted message, sorted. */
function mentionsOf(post: PostedEventMessage | undefined): string[] {
  return [...(post?.message.allowedMentions?.users ?? [])].sort();
}

/** Discord's Unix seconds for a moment, as the texts show it in <t:…>. */
function unixOf(moment: Date): string {
  return Math.floor(moment.getTime() / 1000).toString();
}

describe("Event reminders (US2, T011 and T012)", () => {
  let dataDir: string;
  let db: DatabaseSync;
  let events: EventStore;
  let links: FakeLinkStore;
  let applied: FakeAppliedStore;
  let server: FakeEventInvitationServer;
  let logErrors: string[];
  let clock: Date;
  let reminders: EventReminders;

  /** Moves the clock to the moment, then runs one tick of the one-minute timer. */
  async function tickAt(moment: Date): Promise<void> {
    clock = moment;
    await reminders.tick();
  }

  /** Lists the Discord events, as Discord gives them at this moment. */
  function listed(...scheduled: ScheduledEventFake[]): void {
    server.setScheduledEvents(scheduled);
  }

  /** Neil has placed the Event and posted its invitation: the rows a reminder needs. */
  function placeAndInvite(eventId: string): void {
    events.recordFirstSeen(eventId, FIRST_SEEN.toISOString());
    events.markInvited(eventId, FIRST_SEEN.toISOString());
  }

  function addKind(owner: string, name: string, beforeStart: number[], signupOffsetMinutes?: number, beforeSignup: number[] = []): void {
    const result = events.addKind(owner, { name, beforeStart, signupOffsetMinutes, beforeSignup });
    expect(result).toEqual({ ok: true });
  }

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-event-reminders-"));
    db = openDatabase(dataDir);
    events = new EventStore(db);
    links = new FakeLinkStore();
    applied = new FakeAppliedStore();
    server = new FakeEventInvitationServer();
    logErrors = [];
    clock = FIRST_SEEN;

    for (const memberId of [ALICE, BOB, EVE, GREG]) links.link(memberId, { source: "game-api", rank: "R2" });
    links.link(CAROL, { source: "game-api", rank: "R2" });
    links.link(DAVE, { source: "game-api", rank: "R2" });
    applied.record(ALICE, ["#330"]);
    applied.record(BOB, ["#330", NML_ROLE_NAME]);
    applied.record(EVE, ["#330"]);
    applied.record(GREG, ["#330"]);
    applied.record(CAROL, [NML_ROLE_NAME]);
    applied.record(DAVE, ["NML"]);
    server.grantRole(NML_ROLE_NAME, BOB);
    server.grantRole(NML_ROLE_NAME, CAROL);
    server.grantAllianceChat("NML", NML_CHAT_ID);
    events.setInvitationsOff(EVE);

    reminders = createEventReminders({
      events,
      links,
      applied,
      homeKingdom: HOME_KINGDOM,
      server,
      now: () => clock,
      logError: (line) => logErrors.push(line),
    });
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("the default reminder and who is mentioned (T011)", () => {
    test("posts one start reminder 30 minutes before the start, in #event-announcements, mentioning the Interested Member", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 30));

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.channelId).toBe(ANNOUNCEMENTS_CHANNEL_ID);
      expect(server.posts[0]?.message.content).toContain("starts");
      expect(mentionsOf(server.posts[0])).toEqual([ALICE]);
    });

    test("posts no reminder while more than 30 minutes remain before the start, with no kind", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 31));

      expect(server.posts).toHaveLength(0);
    });

    test("a Member Interested who is not Linked is not mentioned", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE, FRANK]);

      await tickAt(before(START, 30));

      expect(mentionsOf(server.posts[0])).toEqual([ALICE]);
    });

    test("a Member Interested who has left the server is not mentioned", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE, GREG]);
      server.leave(GREG);

      await tickAt(before(START, 30));

      expect(mentionsOf(server.posts[0])).toEqual([ALICE]);
    });

    test("for a Kingdom Event, a Guest Interested is not mentioned", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE, DAVE]);

      await tickAt(before(START, 30));

      expect(mentionsOf(server.posts[0])).toEqual([ALICE]);
    });

    test("a Member with Event Invitations Off who is Interested is still mentioned in the reminder", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [EVE]);

      await tickAt(before(START, 30));

      expect(mentionsOf(server.posts[0])).toEqual([EVE]);
    });

    test("for an Alliance Event, only Interested holders of the [NML] role are mentioned", async () => {
      listed(scheduledEvent({ name: "[NML] Hive move" }));
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE, BOB]);

      await tickAt(before(START, 30));

      expect(mentionsOf(server.posts[0])).toEqual([BOB]);
    });

    test("for an Alliance Event, an Interested Guest who holds the [NML] role is mentioned", async () => {
      listed(scheduledEvent({ name: "[NML] Hive move" }));
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [CAROL, ALICE]);

      await tickAt(before(START, 30));

      expect(mentionsOf(server.posts[0])).toEqual([CAROL]);
    });

    test("an Alliance Event's reminder is posted in its Alliance's alliance-chat", async () => {
      listed(scheduledEvent({ name: "[NML] Hive move" }));
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [BOB]);

      await tickAt(before(START, 30));

      expect(server.posts[0]?.channelId).toBe(NML_CHAT_ID);
    });

    test("nobody Interested: nothing is posted or logged, but the reminder is recorded as sent", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, []);

      await tickAt(before(START, 30));

      expect(server.posts).toHaveLength(0);
      expect(server.logs).toHaveLength(0);
      expect(events.remindersSent(EVENT_ID)).toEqual([{ target: "start", leadMinutes: 30 }]);
    });

    test("a reminder is posted once: a later tick for the same lead time posts nothing", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 30));
      await tickAt(before(START, 29));

      expect(server.posts).toHaveLength(1);
      expect(events.remindersSent(EVENT_ID)).toEqual([{ target: "start", leadMinutes: 30 }]);
    });

    test("writes one #neil-log line for the reminder posted, naming the Event", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 30));

      expect(server.logs).toHaveLength(1);
      expect(server.logs[0]).toContain("AD round 3");
    });
  });

  describe("the Event Kind (T011)", () => {
    test("the kind found in the Event's own list gives its lead times, and no others", async () => {
      addKind("kingdom", "AD", [60, 10]);
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 61));
      expect(server.posts).toHaveLength(0);

      await tickAt(before(START, 60));
      expect(server.posts).toHaveLength(1);

      await tickAt(before(START, 30));
      expect(server.posts).toHaveLength(1);

      await tickAt(before(START, 10));
      expect(server.posts).toHaveLength(2);
    });

    test("an Alliance Event looks only in its own list: a kingdom kind whose name it holds does not apply", async () => {
      addKind("kingdom", "AD", [60]);
      listed(scheduledEvent({ name: "[NML] AD prep" }));
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [BOB]);

      await tickAt(before(START, 60));
      expect(server.posts).toHaveLength(0);

      await tickAt(before(START, 30));
      expect(server.posts).toHaveLength(1);
    });

    test("a kind with a Sign-up Deadline sends a Sign-up reminder that closes at the deadline", async () => {
      addKind("kingdom", "AD", [30], 120, [60]);
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 180));

      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.message.content).toContain("Sign-up");
      expect(server.posts[0]?.message.content).toContain(`<t:${unixOf(before(START, 120))}:F>`);
      expect(mentionsOf(server.posts[0])).toEqual([ALICE]);
    });

    test("with no matching kind, no Sign-up reminder is sent 3 hours before the start", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 180));

      expect(server.posts).toHaveLength(0);
    });

    test("when several lead times are due at once, one reminder goes out for the shortest and the others are recorded without posting", async () => {
      addKind("kingdom", "AD", [60, 10]);
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 5));

      expect(server.posts).toHaveLength(1);
      expect(events.remindersSent(EVENT_ID)).toHaveLength(2);
      expect(events.remindersSent(EVENT_ID)).toEqual(
        expect.arrayContaining([
          { target: "start", leadMinutes: 10 },
          { target: "start", leadMinutes: 60 },
        ]),
      );
    });
  });

  describe("Events Neil does not remind about (T011)", () => {
    test("an Event Neil never placed gets no reminders", async () => {
      listed(scheduledEvent());
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 30));

      expect(server.posts).toHaveLength(0);
    });

    test("an Event that was seen but not invited gets no reminders", async () => {
      listed(scheduledEvent());
      events.recordFirstSeen(EVENT_ID, FIRST_SEEN.toISOString());
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 30));

      expect(server.posts).toHaveLength(0);
    });

    test("one failed post is logged, and the tick goes on to the next Event", async () => {
      listed(scheduledEvent(), scheduledEvent({ id: SECOND_EVENT_ID, name: "AD round 4" }));
      placeAndInvite(EVENT_ID);
      placeAndInvite(SECOND_EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);
      server.setInterested(SECOND_EVENT_ID, [ALICE]);
      server.failNextPost(new Error("Missing Permissions"));

      await expect(tickAt(before(START, 30))).resolves.toBeUndefined();

      expect(logErrors).toHaveLength(1);
      expect(logErrors[0]).toContain("Missing Permissions");
      expect(server.posts).toHaveLength(1);
      expect(server.posts[0]?.message.content).toContain("AD round 4");
    });
  });

  describe("a moved start, a cancel and a delete (T012)", () => {
    test("a moved start: the reminder follows the new start, not the old one", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 40));
      listed(scheduledEvent({ scheduledStartTimestamp: LATER_START.getTime() }));

      await tickAt(before(START, 30));
      expect(server.posts).toHaveLength(0);

      await tickAt(before(LATER_START, 30));
      expect(server.posts).toHaveLength(1);
    });

    test("a moved start: a lead time already sent is not sent again for the new start", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 30));
      listed(scheduledEvent({ scheduledStartTimestamp: LATER_START.getTime() }));

      await tickAt(before(LATER_START, 30));

      expect(server.posts).toHaveLength(1);
    });

    test("a moved start: a lead time not yet sent follows the new start", async () => {
      addKind("kingdom", "AD", [60, 10]);
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 60));
      expect(server.posts).toHaveLength(1);

      listed(scheduledEvent({ scheduledStartTimestamp: LATER_START.getTime() }));
      await tickAt(before(LATER_START, 10));

      expect(server.posts).toHaveLength(2);
      expect(events.remindersSent(EVENT_ID)).toEqual(
        expect.arrayContaining([
          { target: "start", leadMinutes: 10 },
          { target: "start", leadMinutes: 60 },
        ]),
      );
    });

    test("a cancelled Event posts nothing", async () => {
      listed(scheduledEvent({ status: GuildScheduledEventStatus.Canceled }));
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);

      await tickAt(before(START, 30));

      expect(server.posts).toHaveLength(0);
    });

    test("onDeleted deletes the Event's rows and its sent reminders", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);
      await tickAt(before(START, 30));
      expect(events.remindersSent(EVENT_ID)).toHaveLength(1);

      reminders.onDeleted(EVENT_ID);

      expect(events.findEvent(EVENT_ID)).toBeUndefined();
      expect(events.remindersSent(EVENT_ID)).toEqual([]);
    });

    test("a deleted Event gets no reminders, even if Discord still lists it", async () => {
      listed(scheduledEvent());
      placeAndInvite(EVENT_ID);
      server.setInterested(EVENT_ID, [ALICE]);
      reminders.onDeleted(EVENT_ID);

      await tickAt(before(START, 30));

      expect(server.posts).toHaveLength(0);
    });
  });
});
