import { describe, expect, test } from "vitest";
import { cameOnline, wantsInterview } from "./interview-start.js";

describe("cameOnline", () => {
  test.each(["online", "idle", "dnd"] as const)("is true when a Member was offline and is now %s", (after) => {
    expect(cameOnline("offline", after)).toBe(true);
  });

  test.each(["online", "idle", "dnd"] as const)("is true when a Member had no presence before and is now %s", (after) => {
    expect(cameOnline(undefined, after)).toBe(true);
  });

  test("is false when a Member goes offline", () => {
    expect(cameOnline("online", "offline")).toBe(false);
    expect(cameOnline("idle", "offline")).toBe(false);
  });

  test("is false when a Member was offline and is still offline", () => {
    expect(cameOnline("offline", "offline")).toBe(false);
    expect(cameOnline(undefined, "offline")).toBe(false);
  });

  test.each([
    ["online", "idle"],
    ["online", "dnd"],
    ["idle", "online"],
    ["idle", "dnd"],
    ["dnd", "online"],
    ["dnd", "idle"],
  ] as const)("is false when a Member changes from %s to %s while online", (before, after) => {
    expect(cameOnline(before, after)).toBe(false);
  });
});

describe("wantsInterview", () => {
  test("wants an Interview for a Member who is not a bot, not Linked, has no open Interview and was not handed off", () => {
    expect(wantsInterview({ bot: false, linked: false, open: false, handedOff: false })).toBe(true);
  });

  test("does not want an Interview for a bot", () => {
    expect(wantsInterview({ bot: true, linked: false, open: false, handedOff: false })).toBe(false);
  });

  test("does not want an Interview for a Linked Member", () => {
    expect(wantsInterview({ bot: false, linked: true, open: false, handedOff: false })).toBe(false);
  });

  test("does not want an Interview while the Member has an open Interview", () => {
    expect(wantsInterview({ bot: false, linked: false, open: true, handedOff: false })).toBe(false);
  });

  test("does not want an Interview after the last one was handed off", () => {
    expect(wantsInterview({ bot: false, linked: false, open: false, handedOff: true })).toBe(false);
  });
});
