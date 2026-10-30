import { describe, expect, test } from "vitest";
import { parseUid } from "../domain/lookup-input.js";
import type { RosterEntry } from "../domain/player.js";
import { isOwner, pageCount, pageOf, parseCustomId, PickSessions, type PickSession } from "./pick-sessions.js";

const OWNER_ID = "123456789012345678";
const OTHER_MEMBER_ID = "223456789012345678";
const OPENED_AT = new Date("2026-10-30T10:00:00Z");
const LIFETIME_MS = 15 * 60_000;
const MAX_SESSIONS = 500;
const PAGE_SIZE = 25;

/** A range of numbers from start up to, not including, end. */
function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_value, i) => start + i);
}

/** Opens a pick list over the owner's Player matches and returns the session as it is read back at once. */
function openSession(sessions: PickSessions, ownerId: string): PickSession {
  const id = sessions.open(ownerId, { kind: "players", matches: [] }, OPENED_AT);
  const session = sessions.get(id, OPENED_AT);
  if (session === "expired") throw new Error("a session opened just now should not be expired");
  return session;
}

describe("PickSessions.open", () => {
  test("returns an id of at most 16 characters", () => {
    const sessions = new PickSessions();

    const id = sessions.open(OWNER_ID, { kind: "players", matches: [] }, OPENED_AT);

    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(16);
  });

  test("gives every pick list its own id", () => {
    const sessions = new PickSessions();

    const ids = new Set(
      Array.from({ length: 100 }, () => sessions.open(OWNER_ID, { kind: "players", matches: [] }, OPENED_AT)),
    );

    expect(ids.size).toBe(100);
  });
});

describe("PickSessions.get", () => {
  test("gives the session while it is younger than 15 minutes", () => {
    const sessions = new PickSessions();
    const id = sessions.open(OWNER_ID, { kind: "players", matches: [] }, OPENED_AT);

    const justBeforeExpiry = new Date(OPENED_AT.getTime() + LIFETIME_MS - 1);

    expect(sessions.get(id, justBeforeExpiry)).toMatchObject({ ownerId: OWNER_ID });
  });

  test("gives expired from exactly 15 minutes on", () => {
    const sessions = new PickSessions();
    const id = sessions.open(OWNER_ID, { kind: "players", matches: [] }, OPENED_AT);

    const atExpiry = new Date(OPENED_AT.getTime() + LIFETIME_MS);

    expect(sessions.get(id, atExpiry)).toBe("expired");
  });

  test("gives expired for an id that was never opened", () => {
    const sessions = new PickSessions();

    expect(sessions.get("never-opened", OPENED_AT)).toBe("expired");
  });
});

describe("PickSessions capacity", () => {
  test("keeps 500 sessions and drops the oldest when one more is opened", () => {
    const sessions = new PickSessions();
    const ids = Array.from({ length: MAX_SESSIONS }, () =>
      sessions.open(OWNER_ID, { kind: "players", matches: [] }, OPENED_AT),
    );
    const oldest = ids[0];
    const newest = ids.at(-1);
    if (oldest === undefined || newest === undefined) throw new Error("500 sessions should have been opened");

    expect(sessions.get(oldest, OPENED_AT)).not.toBe("expired");

    const later = sessions.open(OWNER_ID, { kind: "players", matches: [] }, OPENED_AT);

    expect(sessions.get(oldest, OPENED_AT)).toBe("expired");
    expect(sessions.get(newest, OPENED_AT)).not.toBe("expired");
    expect(sessions.get(later, OPENED_AT)).not.toBe("expired");
  });
});

describe("isOwner", () => {
  test("is true for the Member who opened the pick list", () => {
    const session = openSession(new PickSessions(), OWNER_ID);

    expect(isOwner(session, OWNER_ID)).toBe(true);
  });

  test("is false for any other Member", () => {
    const session = openSession(new PickSessions(), OWNER_ID);

    expect(isOwner(session, OTHER_MEMBER_ID)).toBe(false);
  });
});

describe("pageOf", () => {
  const entries = range(0, 60);

  test("gives the first 25 entries on page 0", () => {
    expect(pageOf(entries, 0)).toEqual(range(0, 25));
  });

  test("gives the next 25 entries on page 1", () => {
    expect(pageOf(entries, 1)).toEqual(range(25, 50));
  });

  test("gives the remaining entries on the last page", () => {
    expect(pageOf(entries, 2)).toEqual(range(50, 60));
  });

  test("clamps a page past the last one to the last page", () => {
    expect(pageOf(entries, 9)).toEqual(range(50, 60));
  });

  test("clamps a negative page to the first page", () => {
    expect(pageOf(entries, -1)).toEqual(range(0, 25));
  });
});

describe("pageCount", () => {
  test.each([
    [1, 1],
    [PAGE_SIZE, 1],
    [PAGE_SIZE + 1, 2],
    [2 * PAGE_SIZE, 2],
    [60, 3],
  ])("gives %d entries %d page(s)", (entryCount, expected) => {
    expect(pageCount(range(0, entryCount))).toBe(expected);
  });
});

/** A roster of the given size, with uids and names in the order the roster menu shows them. */
function rosterOf(count: number): RosterEntry[] {
  return Array.from({ length: count }, (_value, index) => {
    const parsed = parseUid((100_000_000_000 + index).toString());
    if (!parsed.ok) throw new Error(`test uid for member ${index.toString()} is not valid`);
    return { uid: parsed.value, name: `M${index.toString().padStart(2, "0")}`, allianceRank: "R4" };
  });
}

describe("PickSessions.turnPage", () => {
  test("starts a roster pick list on its first page", () => {
    const sessions = new PickSessions();
    const id = sessions.open(OWNER_ID, { kind: "roster", entries: rosterOf(60) }, OPENED_AT);

    expect(sessions.get(id, OPENED_AT)).toMatchObject({ page: 0 });
  });

  test("remembers the page the Member turned to", () => {
    const sessions = new PickSessions();
    const id = sessions.open(OWNER_ID, { kind: "roster", entries: rosterOf(60) }, OPENED_AT);

    sessions.turnPage(id, 2);

    expect(sessions.get(id, OPENED_AT)).toMatchObject({ page: 2 });
  });

  test("clamps a page past the last one to the last page", () => {
    const sessions = new PickSessions();
    const id = sessions.open(OWNER_ID, { kind: "roster", entries: rosterOf(60) }, OPENED_AT);

    sessions.turnPage(id, 9);

    expect(sessions.get(id, OPENED_AT)).toMatchObject({ page: 2 });
  });

  test("clamps a negative page to the first page", () => {
    const sessions = new PickSessions();
    const id = sessions.open(OWNER_ID, { kind: "roster", entries: rosterOf(60) }, OPENED_AT);
    sessions.turnPage(id, 2);

    sessions.turnPage(id, -1);

    expect(sessions.get(id, OPENED_AT)).toMatchObject({ page: 0 });
  });

  test("does nothing for an id that was never opened", () => {
    const sessions = new PickSessions();

    expect(() => {
      sessions.turnPage("never-opened", 1);
    }).not.toThrow();
    expect(sessions.get("never-opened", OPENED_AT)).toBe("expired");
  });
});

describe("parseCustomId", () => {
  const sessionId = "ab12cd34ef56";

  test("reads the select menu id of a pick list", () => {
    expect(parseCustomId(`pick:${sessionId}:select`)).toEqual({ sessionId, action: "select" });
  });

  test("reads the select menu id of a roster page, with the page number", () => {
    expect(parseCustomId(`pick:${sessionId}:select:2`)).toEqual({ sessionId, action: "select", page: 2 });
  });

  test("reads the select menu id of roster page 0, with page 0", () => {
    expect(parseCustomId(`pick:${sessionId}:select:0`)).toEqual({ sessionId, action: "select", page: 0 });
  });

  test("reads a page button id with its page number", () => {
    expect(parseCustomId(`pick:${sessionId}:page:2`)).toEqual({ sessionId, action: "page", page: 2 });
  });

  test("reads page 0", () => {
    expect(parseCustomId(`pick:${sessionId}:page:0`)).toEqual({ sessionId, action: "page", page: 0 });
  });

  test.each([
    ["an empty id", ""],
    ["only the prefix", "pick"],
    ["no action", `pick:${sessionId}`],
    ["a page button without a number", `pick:${sessionId}:page`],
    ["a page button with an empty number", `pick:${sessionId}:page:`],
    ["a negative page", `pick:${sessionId}:page:-1`],
    ["a fractional page", `pick:${sessionId}:page:1.5`],
    ["a page that is not a number", `pick:${sessionId}:page:two`],
    ["a select page without a number", `pick:${sessionId}:select:`],
    ["a negative select page", `pick:${sessionId}:select:-1`],
    ["a fractional select page", `pick:${sessionId}:select:1.5`],
    ["a select page that is not a number", `pick:${sessionId}:select:two`],
    ["an unknown action with extra parts", `pick:${sessionId}:select:extra`],
    ["an empty session id", "pick::select"],
    ["a different prefix", `roster:${sessionId}:select`],
    ["a different prefix on a page button", `other:${sessionId}:page:1`],
  ])("gives undefined for %s", (_label, customId) => {
    expect(parseCustomId(customId)).toBeUndefined();
  });
});
