import { describe, expect, test } from "vitest";
import { nextServerReset, SERVER_TIME_OFFSET_MINUTES, serverDayOf, serverTimeOf } from "./server-time.js";

describe("Server Time", () => {
  test("is UTC-2", () => {
    expect(SERVER_TIME_OFFSET_MINUTES).toBe(-120);
  });

  test("01:59 UTC is still the previous Server day, and 02:00 UTC starts the next one", () => {
    expect(serverDayOf(new Date("2026-11-16T01:59:59Z"))).toEqual({ date: "2026-11-15", weekday: 0 });
    expect(serverDayOf(new Date("2026-11-16T02:00:00Z"))).toEqual({ date: "2026-11-16", weekday: 1 });
  });

  test("the turn of the year comes at 02:00 UTC on January 1st", () => {
    expect(serverDayOf(new Date("2027-01-01T01:00:00Z")).date).toBe("2026-12-31");
    expect(serverDayOf(new Date("2027-01-01T02:00:00Z")).date).toBe("2027-01-01");
  });

  test("a German evening, 18:00 CET (17:00 UTC), is 15:00 Server Time", () => {
    const time = serverTimeOf(new Date("2026-11-16T17:00:00Z"));
    expect(time.getUTCHours()).toBe(15);
    expect(time.getUTCMinutes()).toBe(0);
  });

  test("the next reset is the next 02:00 UTC strictly after now", () => {
    expect(nextServerReset(new Date("2026-11-16T01:59:00Z"))).toEqual(new Date("2026-11-16T02:00:00Z"));
    expect(nextServerReset(new Date("2026-11-16T02:00:00Z"))).toEqual(new Date("2026-11-17T02:00:00Z"));
    expect(nextServerReset(new Date("2026-11-16T17:00:00Z"))).toEqual(new Date("2026-11-17T02:00:00Z"));
    expect(nextServerReset(new Date("2026-12-31T23:00:00Z"))).toEqual(new Date("2027-01-01T02:00:00Z"));
  });
});
