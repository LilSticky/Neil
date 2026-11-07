import { describe, expect, test } from "vitest";
import {
  type BootyWindow,
  isBootyCallCoolingDown,
  isBootyMatch,
  isBootyOnline,
  isConfirmationExpired,
  isInsideBootyWindow,
  parseBootyTime,
  parseBootyWindow,
} from "./booty.js";

const ONE_MINUTE_MS = 60_000;

/** A window that the test expects to be valid; the parse itself is covered by parseBootyWindow tests. */
function windowOf(start: number, end: number): BootyWindow {
  const parsed = parseBootyWindow(start, end);
  if (!parsed.ok) throw new Error(`the window ${String(start)} to ${String(end)} should parse`);
  return parsed.value;
}

describe("parseBootyWindow", () => {
  test("accepts the first and last minute of the day", () => {
    expect(parseBootyWindow(0, 1439).ok).toBe(true);
  });

  test.each([
    ["a start before midnight", -1, 480],
    ["a start after the last minute", 1440, 480],
    ["an end before midnight", 480, -1],
    ["an end after the last minute", 480, 1440],
    ["a start that is not a whole minute", 480.5, 480],
    ["an end that is not a whole minute", 480, 1380.5],
  ])("refuses a window with %s", (_label, start, end) => {
    expect(parseBootyWindow(start, end)).toEqual({ ok: false });
  });
});

describe("isInsideBootyWindow", () => {
  test("includes the start minute and excludes the end minute", () => {
    const window = windowOf(480, 1380);
    expect(isInsideBootyWindow(window, 479)).toBe(false);
    expect(isInsideBootyWindow(window, 480)).toBe(true);
    expect(isInsideBootyWindow(window, 1379)).toBe(true);
    expect(isInsideBootyWindow(window, 1380)).toBe(false);
  });

  test("covers the whole day when the start and the end are the same", () => {
    const window = windowOf(0, 0);
    expect(isInsideBootyWindow(window, 0)).toBe(true);
    expect(isInsideBootyWindow(window, 720)).toBe(true);
    expect(isInsideBootyWindow(window, 1439)).toBe(true);
  });

  test("covers the whole day when the start and the end are the same and not midnight", () => {
    const window = windowOf(480, 480);
    expect(isInsideBootyWindow(window, 0)).toBe(true);
    expect(isInsideBootyWindow(window, 479)).toBe(true);
    expect(isInsideBootyWindow(window, 1439)).toBe(true);
  });

  test("runs over midnight when the start is after the end", () => {
    const window = windowOf(1320, 360);
    expect(isInsideBootyWindow(window, 1319)).toBe(false);
    expect(isInsideBootyWindow(window, 1320)).toBe(true);
    expect(isInsideBootyWindow(window, 1439)).toBe(true);
    expect(isInsideBootyWindow(window, 0)).toBe(true);
    expect(isInsideBootyWindow(window, 60)).toBe(true);
    expect(isInsideBootyWindow(window, 359)).toBe(true);
    expect(isInsideBootyWindow(window, 360)).toBe(false);
    expect(isInsideBootyWindow(window, 720)).toBe(false);
  });
});

describe("parseBootyTime", () => {
  test.each([
    ["00:00", 0],
    ["08:00", 480],
    ["12:30", 750],
    ["23:59", 1439],
  ])("reads %s as minute %i after midnight", (input, minute) => {
    expect(parseBootyTime(input)).toEqual({ ok: true, value: minute });
  });

  test.each([
    ["an hour of 24", "24:00"],
    ["a minute of 60", "12:60"],
    ["a 12-hour time with am/pm", "7pm"],
    ["no colon", "1200"],
    ["a minute with one digit", "12:5"],
    ["seconds", "12:00:00"],
    ["a negative hour", "-1:00"],
    ["empty", ""],
    ["letters", "ab:cd"],
  ])("refuses %s", (_label, input) => {
    expect(parseBootyTime(input)).toEqual({ ok: false });
  });
});

describe("isBootyMatch", () => {
  test("never matches when the mode is off, inside the window or not", () => {
    const bootyAlerts = { mode: "off" as const, window: windowOf(0, 0) };
    expect(isBootyMatch(bootyAlerts, { online: true, localMinute: 720 })).toBe(false);
    expect(isBootyMatch(bootyAlerts, { online: false, localMinute: 720 })).toBe(false);
  });

  test("matches an always Member both online and offline, inside the window", () => {
    const bootyAlerts = { mode: "always" as const, window: windowOf(0, 0) };
    expect(isBootyMatch(bootyAlerts, { online: true, localMinute: 720 })).toBe(true);
    expect(isBootyMatch(bootyAlerts, { online: false, localMinute: 720 })).toBe(true);
  });

  test("matches an online Member only while they are online", () => {
    const bootyAlerts = { mode: "online" as const, window: windowOf(0, 0) };
    expect(isBootyMatch(bootyAlerts, { online: true, localMinute: 720 })).toBe(true);
    expect(isBootyMatch(bootyAlerts, { online: false, localMinute: 720 })).toBe(false);
  });

  test("matches an offline Member only while they are offline", () => {
    const bootyAlerts = { mode: "offline" as const, window: windowOf(0, 0) };
    expect(isBootyMatch(bootyAlerts, { online: false, localMinute: 720 })).toBe(true);
    expect(isBootyMatch(bootyAlerts, { online: true, localMinute: 720 })).toBe(false);
  });

  test("never matches outside the window, whatever the mode", () => {
    const bootyAlerts = { mode: "always" as const, window: windowOf(480, 1380) };
    expect(isBootyMatch(bootyAlerts, { online: true, localMinute: 1380 })).toBe(false);
    expect(isBootyMatch(bootyAlerts, { online: false, localMinute: 1380 })).toBe(false);
  });

  test("an offline Member, Booty Alerts with a window from 08:00 to 23:00 is mentioned at 12:00 only while offline", () => {
    const bootyAlerts = { mode: "offline" as const, window: windowOf(480, 1380) };
    expect(isBootyMatch(bootyAlerts, { online: false, localMinute: 720 })).toBe(true);
    expect(isBootyMatch(bootyAlerts, { online: true, localMinute: 720 })).toBe(false);
    expect(isBootyMatch(bootyAlerts, { online: false, localMinute: 1410 })).toBe(false);
  });

  test("an always Member, Booty Alerts with a window from 22:00 to 06:00 is mentioned at 01:00", () => {
    const bootyAlerts = { mode: "always" as const, window: windowOf(1320, 360) };
    expect(isBootyMatch(bootyAlerts, { online: true, localMinute: 60 })).toBe(true);
  });
});

describe("isConfirmationExpired", () => {
  test("is not expired before one minute has passed", () => {
    expect(isConfirmationExpired(1_000, 1_000 + ONE_MINUTE_MS - 1)).toBe(false);
  });

  test("is expired once one minute has passed", () => {
    expect(isConfirmationExpired(1_000, 1_000 + ONE_MINUTE_MS)).toBe(true);
  });
});

describe("isBootyCallCoolingDown", () => {
  test("is cooling down just under one minute after the Booty Call", () => {
    expect(isBootyCallCoolingDown(1_000, 1_000 + ONE_MINUTE_MS - 1)).toBe(true);
  });

  test("is no longer cooling down at exactly one minute after the Booty Call", () => {
    expect(isBootyCallCoolingDown(1_000, 1_000 + ONE_MINUTE_MS)).toBe(false);
  });
});

describe("isBootyOnline", () => {
  const LAST_SEEN = new Date("2026-11-07T11:00:00Z");

  test("is online when Discord shows the Member not offline, even when the game says offline", () => {
    expect(isBootyOnline({ online: false, lastOnlineAt: LAST_SEEN }, true)).toBe(true);
  });

  test("is online when the game's online flag says so, and Discord shows offline", () => {
    expect(isBootyOnline({ online: true, lastOnlineAt: undefined }, false)).toBe(true);
  });

  test("is offline when the game's online flag says offline and Discord shows offline", () => {
    expect(isBootyOnline({ online: false, lastOnlineAt: undefined }, false)).toBe(false);
  });

  test("with no online flag, is online when no Last Online is given", () => {
    expect(isBootyOnline({ online: undefined, lastOnlineAt: undefined }, false)).toBe(true);
  });

  test("with no online flag, is offline when a Last Online is given", () => {
    expect(isBootyOnline({ online: undefined, lastOnlineAt: LAST_SEEN }, false)).toBe(false);
  });

  test("with no game reading at all, follows Discord alone", () => {
    expect(isBootyOnline(undefined, false)).toBe(false);
    expect(isBootyOnline(undefined, true)).toBe(true);
  });
});
