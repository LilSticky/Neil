import { GuildScheduledEventStatus } from "discord.js";
import { describe, expect, test } from "vitest";
import { eventOf } from "./events.js";

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
