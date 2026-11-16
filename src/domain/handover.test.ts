import { describe, expect, test } from "vitest";
import { dueHandoverPosts, HANDOVER_REMINDER_LEADS, type HandoverPostKind } from "./handover.js";

const HOUR_MS = 60 * 60_000;
/** Friday 20 November 2026, 18:00 Server Time. */
const SIEGE = new Date("2026-11-20T20:00:00Z");

function at(hoursBefore: number): Date {
  return new Date(SIEGE.getTime() - hoursBefore * HOUR_MS);
}

function sent(...kinds: HandoverPostKind[]): ReadonlySet<HandoverPostKind> {
  return new Set(kinds);
}

describe("the Handover posts due before a Royal City siege", () => {
  test("the Handover Reminders are 24 hours and 1 hour before the siege", () => {
    expect(HANDOVER_REMINDER_LEADS.map((lead) => [lead.kind, lead.leadMs])).toEqual([
      ["reminder-24h", 24 * HOUR_MS],
      ["reminder-1h", HOUR_MS],
    ]);
  });

  test("nothing is due before the 24-hour mark", () => {
    expect(dueHandoverPosts(SIEGE, sent(), new Date(at(24).getTime() - 1))).toEqual({ post: [], drop: [] });
  });

  test("at the 24-hour mark, the first reminder and the announcement are due", () => {
    expect(dueHandoverPosts(SIEGE, sent(), at(24))).toEqual({ post: ["reminder-24h", "announcement"], drop: [] });
  });

  test("between the marks, a missed first reminder is sent late, and nothing sent is due again", () => {
    expect(dueHandoverPosts(SIEGE, sent(), at(5))).toEqual({ post: ["reminder-24h", "announcement"], drop: [] });
    expect(dueHandoverPosts(SIEGE, sent("reminder-24h", "announcement"), at(5))).toEqual({ post: [], drop: [] });
  });

  test("at the 1-hour mark, the second reminder is due", () => {
    expect(dueHandoverPosts(SIEGE, sent("reminder-24h", "announcement"), at(1))).toEqual({ post: ["reminder-1h"], drop: [] });
  });

  test("a first reminder overtaken by the second is dropped, and the announcement still goes out", () => {
    expect(dueHandoverPosts(SIEGE, sent(), at(0.5))).toEqual({
      post: ["reminder-1h", "announcement"],
      drop: ["reminder-24h"],
    });
  });

  test("nothing is due from the siege on", () => {
    expect(dueHandoverPosts(SIEGE, sent(), SIEGE)).toEqual({ post: [], drop: [] });
  });
});
