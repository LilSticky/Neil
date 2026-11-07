import { describe, expect, test } from "vitest";
import { parseAllianceKey, type AllianceKey } from "./lookup-input.js";
import type { AllianceRank } from "./player.js";
import {
  dueReminders,
  eventOwnerOf,
  kindForEventName,
  mayActOnEvent,
  parseLeadTimes,
  type EventCreator,
  type EventKind,
  type EventOwner,
  type EventStatus,
  type SentReminder,
} from "./events.js";

describe("eventOwnerOf", () => {
  test("an Alliance Event takes the tag in leading brackets as its Alliance", () => {
    expect(eventOwnerOf("[NML] Hive move")).toEqual({ kind: "alliance", tag: "NML" });
  });

  test("a name without a leading bracketed tag is a Kingdom Event", () => {
    expect(eventOwnerOf("Alliance Duel round 3")).toEqual({ kind: "kingdom" });
  });

  test("a bracketed tag that is not at the start does not make an Alliance Event", () => {
    expect(eventOwnerOf("Hive move [NML]")).toEqual({ kind: "kingdom" });
  });
});

describe("parseLeadTimes", () => {
  test("reads a list of lead times as minutes, in the order written", () => {
    expect(parseLeadTimes("24h, 1h, 10m")).toEqual({ ok: true, value: [1440, 60, 10] });
  });

  test("reads a single lead time", () => {
    expect(parseLeadTimes("2d")).toEqual({ ok: true, value: [2880] });
  });

  test("accepts the bounds: one minute and seven days", () => {
    expect(parseLeadTimes("1m, 7d")).toEqual({ ok: true, value: [1, 10080] });
  });

  test("accepts three lead times, the most a list can have", () => {
    expect(parseLeadTimes("3d,12h,30m")).toEqual({ ok: true, value: [4320, 720, 30] });
  });

  test.each([
    ["empty", ""],
    ["a word", "soon"],
    ["a unit that is not known", "1x"],
    ["a number without a unit", "24"],
    ["a unit without a number", "h"],
    ["a decimal", "1.5h"],
    ["a negative value", "-1h"],
    ["an empty item between commas", "1h,,2h"],
  ])("refuses unreadable text: %s", (_label, input) => {
    expect(parseLeadTimes(input)).toEqual({ ok: false, reason: "unreadable" });
  });

  test("refuses more than three lead times", () => {
    expect(parseLeadTimes("1d, 12h, 1h, 10m")).toEqual({ ok: false, reason: "too-many" });
  });

  test.each([
    ["zero minutes", "0m"],
    ["under a minute, in hours", "0h"],
    ["more than seven days", "8d"],
    ["one minute more than seven days", "10081m"],
  ])("refuses a lead time out of range: %s", (_label, input) => {
    expect(parseLeadTimes(input)).toEqual({ ok: false, reason: "out-of-range" });
  });
});

function allianceKey(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`not an Alliance key: ${text}`);
  return parsed.value;
}

const NML = allianceKey("NML");
const OTHER = allianceKey("XYZ");
const NML_OWNER: EventOwner = { kind: "alliance", tag: NML };
const KINGDOM_OWNER: EventOwner = { kind: "kingdom" };

function linkedAs(tag: AllianceKey, rank: AllianceRank, officer = false): EventCreator {
  return { alliance: { tag, rank }, officer };
}

describe("mayActOnEvent", () => {
  test("an Alliance Event may be acted on for a creator Linked as that Alliance's R5", () => {
    expect(mayActOnEvent(NML_OWNER, linkedAs(NML, "R5"))).toBe(true);
  });

  test("an Alliance Event may be acted on for a creator Linked as that Alliance's R4", () => {
    expect(mayActOnEvent(NML_OWNER, linkedAs(NML, "R4"))).toBe(true);
  });

  test("an Alliance Event may be acted on for an Officer, whatever their Alliance", () => {
    expect(mayActOnEvent(NML_OWNER, { alliance: undefined, officer: true })).toBe(true);
  });

  test.each([
    ["R3 of that Alliance", linkedAs(NML, "R3")],
    ["an unknown rank in that Alliance", linkedAs(NML, "unknown")],
    ["R5 of another Alliance", linkedAs(OTHER, "R5")],
    ["no Alliance and not an Officer", { alliance: undefined, officer: false }],
  ])("an Alliance Event is refused for a creator who is %s", (_label, creator) => {
    expect(mayActOnEvent(NML_OWNER, creator)).toBe(false);
  });

  test("a Kingdom Event may be acted on for an Officer", () => {
    expect(mayActOnEvent(KINGDOM_OWNER, { alliance: undefined, officer: true })).toBe(true);
  });

  test.each([
    ["R5 of an Alliance, not an Officer", linkedAs(NML, "R5")],
    ["no Alliance and not an Officer", { alliance: undefined, officer: false }],
  ])("a Kingdom Event is refused for a creator who is %s", (_label, creator) => {
    expect(mayActOnEvent(KINGDOM_OWNER, creator)).toBe(false);
  });

  test.each<EventOwner>([NML_OWNER, KINGDOM_OWNER])("an Event with no creator is refused, owner %o", (owner) => {
    expect(mayActOnEvent(owner, undefined)).toBe(false);
  });
});

function kind(
  name: string,
  beforeStart: readonly number[],
  signup?: { readonly offset: number; readonly beforeSignup: readonly number[] },
): EventKind {
  return {
    name,
    beforeStart,
    signupOffsetMinutes: signup?.offset,
    beforeSignup: signup?.beforeSignup ?? [],
  };
}

describe("kindForEventName", () => {
  const AD = kind("AD", [30]);

  test("gives the kind whose name appears in the Event's name", () => {
    expect(kindForEventName([AD], "AD round 3")).toBe(AD);
  });

  test("matches the name ignoring case", () => {
    const hiveMove = kind("hive move", [30]);
    expect(kindForEventName([hiveMove], "[NML] Hive MOVE")).toBe(hiveMove);
  });

  test("prefers the longest name when two names appear", () => {
    const adRound = kind("AD round", [60]);
    expect(kindForEventName([AD, adRound], "AD round 3")).toBe(adRound);
    expect(kindForEventName([adRound, AD], "AD round 3")).toBe(adRound);
  });

  test("gives undefined when no kind's name appears", () => {
    expect(kindForEventName([AD], "Tournament")).toBeUndefined();
  });

  test("gives undefined for an empty list", () => {
    expect(kindForEventName([], "AD round 3")).toBeUndefined();
  });
});

const at = (hhmm: string): Date => new Date(`2026-11-07T${hhmm}:00Z`);
const START = at("12:00");
const FIRST_SEEN = at("10:00");
const NO_SENT: readonly SentReminder[] = [];

describe("dueReminders", () => {
  test("with no Event Kind, sends one start reminder 30 minutes before the start and no Sign-up reminder", () => {
    expect(dueReminders(START, "scheduled", undefined, NO_SENT, FIRST_SEEN, at("11:30"))).toEqual({
      send: [{ target: "start", leadMinutes: 30 }],
      record: [],
    });
  });

  test("sends the Event Kind's start reminder when its lead time is reached", () => {
    const kinds = kind("AD", [60, 10]);
    expect(dueReminders(START, "scheduled", kinds, NO_SENT, FIRST_SEEN, at("11:00"))).toEqual({
      send: [{ target: "start", leadMinutes: 60 }],
      record: [],
    });
  });

  test("sends the next lead time once the earlier one was already sent", () => {
    const kinds = kind("AD", [60, 10]);
    const sent: SentReminder[] = [{ target: "start", leadMinutes: 60 }];
    expect(dueReminders(START, "scheduled", kinds, sent, FIRST_SEEN, at("11:50"))).toEqual({
      send: [{ target: "start", leadMinutes: 10 }],
      record: [],
    });
  });

  test("sends the Sign-up reminder at its lead time before the Sign-up Deadline", () => {
    const kinds = kind("AD", [30], { offset: 120, beforeSignup: [60] });
    expect(dueReminders(START, "scheduled", kinds, NO_SENT, at("08:00"), at("09:00"))).toEqual({
      send: [{ target: "signup", leadMinutes: 60 }],
      record: [],
    });
  });

  test("sends nothing for a lead time already sent", () => {
    const kinds = kind("AD", [30]);
    const sent: SentReminder[] = [{ target: "start", leadMinutes: 30 }];
    expect(dueReminders(START, "scheduled", kinds, sent, FIRST_SEEN, at("11:45"))).toEqual({
      send: [],
      record: [],
    });
  });

  test("collapses several due reminders for one target into the shortest lead time and records the others", () => {
    const kinds = kind("AD", [60, 30, 10]);
    expect(dueReminders(START, "scheduled", kinds, NO_SENT, FIRST_SEEN, at("11:35"))).toEqual({
      send: [{ target: "start", leadMinutes: 30 }],
      record: [{ target: "start", leadMinutes: 60 }],
    });
  });

  test("skips a reminder due before the Event was first seen", () => {
    const kinds = kind("AD", [60]);
    expect(dueReminders(START, "scheduled", kinds, NO_SENT, at("11:30"), at("11:35")).send).toEqual([]);
  });

  test("skips a start reminder once the start has passed", () => {
    const kinds = kind("AD", [30]);
    expect(dueReminders(START, "scheduled", kinds, NO_SENT, FIRST_SEEN, at("12:05")).send).toEqual([]);
  });

  test("skips a Sign-up reminder once the Sign-up Deadline has passed", () => {
    const kinds = kind("AD", [30], { offset: 120, beforeSignup: [60] });
    expect(dueReminders(START, "scheduled", kinds, NO_SENT, FIRST_SEEN, at("10:30")).send).toEqual([]);
  });

  test.each<EventStatus>(["cancelled", "completed", "deleted"])("sends nothing for an Event that is %s", (status) => {
    const kinds = kind("AD", [30]);
    expect(dueReminders(START, status, kinds, NO_SENT, FIRST_SEEN, at("11:45"))).toEqual({
      send: [],
      record: [],
    });
  });

  test("a moved start keeps the reminders already sent and follows the new start for the rest", () => {
    const kinds = kind("AD", [60, 10]);
    const sent: SentReminder[] = [{ target: "start", leadMinutes: 60 }];
    expect(dueReminders(at("13:00"), "scheduled", kinds, sent, FIRST_SEEN, at("12:55"))).toEqual({
      send: [{ target: "start", leadMinutes: 10 }],
      record: [],
    });
  });
});
