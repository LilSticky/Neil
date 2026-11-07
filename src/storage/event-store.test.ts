import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDatabase } from "./database.js";
import { type EventKind, type EventKindOwner, EventStore, type SentReminder } from "./event-store.js";

const EVENT_ID = "333333333333333333";
const OTHER_EVENT_ID = "444444444444444444";
const SEEN_AT = "2026-11-07T18:00:00.000Z";
const LATER = "2026-11-07T19:00:00.000Z";

const ALICE = "111111111111111111";
const BOB = "222222222222222222";

const KINGDOM: EventKindOwner = "kingdom";
const NML: EventKindOwner = "NML";

const AD: EventKind = { name: "AD", beforeStart: [1440, 60], signupOffsetMinutes: 120, beforeSignup: [60] };
const HIVE_MOVE: EventKind = { name: "Hive move", beforeStart: [60, 10], signupOffsetMinutes: undefined, beforeSignup: [] };

function kindNumbered(index: number): EventKind {
  return { name: `Kind ${index.toString()}`, beforeStart: [60], signupOffsetMinutes: undefined, beforeSignup: [] };
}

describe("EventStore", () => {
  let dataDir: string;
  let db: DatabaseSync;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "neil-event-store-"));
    db = openDatabase(dataDir);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  describe("Events", () => {
    test("findEvent gives undefined for an Event never seen", () => {
      expect(new EventStore(db).findEvent(EVENT_ID)).toBeUndefined();
    });

    test("recordFirstSeen then findEvent gives the Event with no invitation yet", () => {
      const store = new EventStore(db);

      store.recordFirstSeen(EVENT_ID, SEEN_AT);

      expect(store.findEvent(EVENT_ID)).toEqual({ eventId: EVENT_ID, firstSeenAt: SEEN_AT, invitedAt: undefined });
    });

    test("markInvited sets the time of the invitation", () => {
      const store = new EventStore(db);
      store.recordFirstSeen(EVENT_ID, SEEN_AT);

      store.markInvited(EVENT_ID, LATER);

      expect(store.findEvent(EVENT_ID)).toEqual({ eventId: EVENT_ID, firstSeenAt: SEEN_AT, invitedAt: LATER });
    });

    test("a second markInvited keeps the first invitation time", () => {
      const store = new EventStore(db);
      store.recordFirstSeen(EVENT_ID, SEEN_AT);
      store.markInvited(EVENT_ID, SEEN_AT);

      store.markInvited(EVENT_ID, LATER);

      expect(store.findEvent(EVENT_ID)?.invitedAt).toBe(SEEN_AT);
    });

    test("deleteEvent removes the Event", () => {
      const store = new EventStore(db);
      store.recordFirstSeen(EVENT_ID, SEEN_AT);

      store.deleteEvent(EVENT_ID);

      expect(store.findEvent(EVENT_ID)).toBeUndefined();
    });
  });

  describe("Sent reminders", () => {
    test("remindersSent gives the reminders recorded for one Event and not another", () => {
      const store = new EventStore(db);
      store.recordFirstSeen(EVENT_ID, SEEN_AT);
      store.recordFirstSeen(OTHER_EVENT_ID, SEEN_AT);
      const startHour: SentReminder = { target: "start", leadMinutes: 60 };
      const signupHour: SentReminder = { target: "signup", leadMinutes: 60 };

      store.recordReminderSent(EVENT_ID, startHour);
      store.recordReminderSent(EVENT_ID, signupHour);
      store.recordReminderSent(OTHER_EVENT_ID, { target: "start", leadMinutes: 30 });

      expect(store.remindersSent(EVENT_ID)).toHaveLength(2);
      expect(store.remindersSent(EVENT_ID)).toEqual(expect.arrayContaining([startHour, signupHour]));
      expect(store.remindersSent(OTHER_EVENT_ID)).toEqual([{ target: "start", leadMinutes: 30 }]);
    });

    test("recording the same reminder twice keeps one", () => {
      const store = new EventStore(db);
      store.recordFirstSeen(EVENT_ID, SEEN_AT);
      store.recordReminderSent(EVENT_ID, { target: "start", leadMinutes: 60 });

      expect(() => {
        store.recordReminderSent(EVENT_ID, { target: "start", leadMinutes: 60 });
      }).not.toThrow();

      expect(store.remindersSent(EVENT_ID)).toEqual([{ target: "start", leadMinutes: 60 }]);
    });

    test("deleting the Event removes its sent reminders", () => {
      const store = new EventStore(db);
      store.recordFirstSeen(EVENT_ID, SEEN_AT);
      store.recordReminderSent(EVENT_ID, { target: "start", leadMinutes: 60 });

      store.deleteEvent(EVENT_ID);
      store.recordFirstSeen(EVENT_ID, LATER);

      expect(store.remindersSent(EVENT_ID)).toEqual([]);
    });
  });

  describe("Event Kinds", () => {
    test("listKinds gives nothing for an owner with no Event Kinds", () => {
      expect(new EventStore(db).listKinds(KINGDOM)).toEqual([]);
    });

    test("addKind then listKinds gives the kind with its lead times and Sign-up Deadline offset", () => {
      const store = new EventStore(db);

      store.addKind(KINGDOM, AD);

      expect(store.listKinds(KINGDOM)).toEqual([AD]);
    });

    test("a kind without a Sign-up Deadline has no offset and no Sign-up lead times", () => {
      const store = new EventStore(db);

      store.addKind(NML, HIVE_MOVE);

      expect(store.listKinds(NML)).toEqual([HIVE_MOVE]);
    });

    test("addKind with the same name ignoring case replaces the kind", () => {
      const store = new EventStore(db);
      store.addKind(KINGDOM, AD);
      const replacement: EventKind = { name: "ad", beforeStart: [180], signupOffsetMinutes: undefined, beforeSignup: [] };

      store.addKind(KINGDOM, replacement);

      expect(store.listKinds(KINGDOM)).toEqual([replacement]);
    });

    test("removeKind removes the kind whose name matches ignoring case", () => {
      const store = new EventStore(db);
      store.addKind(KINGDOM, AD);

      store.removeKind(KINGDOM, "ad");

      expect(store.listKinds(KINGDOM)).toEqual([]);
    });

    test("removeKind of a name that is not listed keeps the other kinds", () => {
      const store = new EventStore(db);
      store.addKind(KINGDOM, AD);

      store.removeKind(KINGDOM, "Hive move");

      expect(store.listKinds(KINGDOM)).toEqual([AD]);
    });

    test("the 26th kind for one owner is refused and the list keeps 25", () => {
      const store = new EventStore(db);
      for (let index = 1; index <= 25; index += 1) {
        expect(store.addKind(KINGDOM, kindNumbered(index)).ok).toBe(true);
      }

      const result = store.addKind(KINGDOM, kindNumbered(26));

      expect(result.ok).toBe(false);
      expect(store.listKinds(KINGDOM)).toHaveLength(25);
      expect(store.listKinds(KINGDOM)).not.toContainEqual(kindNumbered(26));
    });

    test("replacing a kind by name is allowed when the list already has 25", () => {
      const store = new EventStore(db);
      for (let index = 1; index <= 25; index += 1) {
        store.addKind(KINGDOM, kindNumbered(index));
      }
      const replacement: EventKind = { name: "Kind 1", beforeStart: [10], signupOffsetMinutes: undefined, beforeSignup: [] };

      const result = store.addKind(KINGDOM, replacement);

      expect(result.ok).toBe(true);
      expect(store.listKinds(KINGDOM)).toHaveLength(25);
      expect(store.listKinds(KINGDOM)).toContainEqual(replacement);
    });

    test("an owner does not see the Event Kinds of another owner", () => {
      const store = new EventStore(db);
      store.addKind(KINGDOM, AD);
      store.addKind(NML, HIVE_MOVE);

      expect(store.listKinds(KINGDOM)).toEqual([AD]);
      expect(store.listKinds(NML)).toEqual([HIVE_MOVE]);
    });

    test("two owners can each keep a kind of the same name, and removing one leaves the other", () => {
      const store = new EventStore(db);
      store.addKind(KINGDOM, AD);
      store.addKind(NML, AD);

      store.removeKind(NML, "AD");

      expect(store.listKinds(NML)).toEqual([]);
      expect(store.listKinds(KINGDOM)).toEqual([AD]);
    });
  });

  describe("Event Invitations Off", () => {
    test("setInvitationsOff switches the Member's invitations off and no one else's", () => {
      const store = new EventStore(db);

      store.setInvitationsOff(ALICE);

      expect(store.hasInvitationsOff(ALICE)).toBe(true);
      expect(store.hasInvitationsOff(BOB)).toBe(false);
    });

    test("clearInvitationsOff switches the invitations back on", () => {
      const store = new EventStore(db);
      store.setInvitationsOff(ALICE);

      store.clearInvitationsOff(ALICE);

      expect(store.hasInvitationsOff(ALICE)).toBe(false);
    });

    test("forgetMember forgets the Member's choice and keeps the choices of others", () => {
      const store = new EventStore(db);
      store.setInvitationsOff(ALICE);
      store.setInvitationsOff(BOB);

      store.forgetMember(ALICE);

      expect(store.hasInvitationsOff(ALICE)).toBe(false);
      expect(store.hasInvitationsOff(BOB)).toBe(true);
    });
  });
});
