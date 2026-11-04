import { describe, expect, test } from "vitest";
import { isOwner, parseReaperCustomId, ReaperPages, reaperPageCustomId } from "./reaper-pages.js";

const OWNER_ID = "123456789012345678";
const OTHER_MEMBER_ID = "223456789012345678";
const OPENED_AT = new Date("2026-11-04T16:00:00Z");
const LIFETIME_MS = 15 * 60_000;
const MAX_SESSIONS = 500;

/** Opens a listing for the owner and returns the session as it is read back at once. */
function openSession(pages: ReaperPages<string>, ownerId: string) {
  const id = pages.open(ownerId, "a listing", OPENED_AT);
  const session = pages.get(id, OPENED_AT);
  if (session === "expired") throw new Error("a listing opened just now should not be expired");
  return session;
}

describe("ReaperPages.open", () => {
  test("returns an id of at most 16 characters", () => {
    const pages = new ReaperPages<string>();

    const id = pages.open(OWNER_ID, "a listing", OPENED_AT);

    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(16);
  });

  test("gives every listing its own id", () => {
    const pages = new ReaperPages<string>();

    const ids = new Set(Array.from({ length: 100 }, () => pages.open(OWNER_ID, "a listing", OPENED_AT)));

    expect(ids.size).toBe(100);
  });
});

describe("ReaperPages.get", () => {
  test("gives the listing with its owner and content while it is younger than 15 minutes", () => {
    const pages = new ReaperPages<string>();
    const id = pages.open(OWNER_ID, "the closest Exiles", OPENED_AT);

    const justBeforeExpiry = new Date(OPENED_AT.getTime() + LIFETIME_MS - 1);

    expect(pages.get(id, justBeforeExpiry)).toMatchObject({ ownerId: OWNER_ID, content: "the closest Exiles" });
  });

  test("gives expired from exactly 15 minutes on", () => {
    const pages = new ReaperPages<string>();
    const id = pages.open(OWNER_ID, "a listing", OPENED_AT);

    const atExpiry = new Date(OPENED_AT.getTime() + LIFETIME_MS);

    expect(pages.get(id, atExpiry)).toBe("expired");
  });

  test("gives expired for an id that was never opened", () => {
    const pages = new ReaperPages<string>();

    expect(pages.get("never-opened", OPENED_AT)).toBe("expired");
  });
});

describe("ReaperPages capacity", () => {
  test("keeps 500 listings and drops the oldest when one more is opened", () => {
    const pages = new ReaperPages<string>();
    const ids = Array.from({ length: MAX_SESSIONS }, () => pages.open(OWNER_ID, "a listing", OPENED_AT));
    const oldest = ids[0];
    const newest = ids.at(-1);
    if (oldest === undefined || newest === undefined) throw new Error("500 listings should have been opened");

    expect(pages.get(oldest, OPENED_AT)).not.toBe("expired");

    const later = pages.open(OWNER_ID, "a listing", OPENED_AT);

    expect(pages.get(oldest, OPENED_AT)).toBe("expired");
    expect(pages.get(newest, OPENED_AT)).not.toBe("expired");
    expect(pages.get(later, OPENED_AT)).not.toBe("expired");
  });
});

describe("isOwner", () => {
  test("is true for the Member who opened the listing", () => {
    const session = openSession(new ReaperPages<string>(), OWNER_ID);

    expect(isOwner(session, OWNER_ID)).toBe(true);
  });

  test("is false for any other Member", () => {
    const session = openSession(new ReaperPages<string>(), OWNER_ID);

    expect(isOwner(session, OTHER_MEMBER_ID)).toBe(false);
  });
});

describe("reaperPageCustomId", () => {
  test("builds the page button id of a listing's session with its page number", () => {
    expect(reaperPageCustomId("ab12cd34ef56", 2)).toBe("reaper:ab12cd34ef56:page:2");
  });

  test("builds page 0 as page 0", () => {
    expect(reaperPageCustomId("ab12cd34ef56", 0)).toBe("reaper:ab12cd34ef56:page:0");
  });
});

describe("parseReaperCustomId", () => {
  const sessionId = "ab12cd34ef56";

  test("reads a page button id with its session and page number", () => {
    expect(parseReaperCustomId(`reaper:${sessionId}:page:2`)).toEqual({ sessionId, page: 2 });
  });

  test("reads page 0", () => {
    expect(parseReaperCustomId(`reaper:${sessionId}:page:0`)).toEqual({ sessionId, page: 0 });
  });

  test("reads back an id that reaperPageCustomId built", () => {
    expect(parseReaperCustomId(reaperPageCustomId(sessionId, 5))).toEqual({ sessionId, page: 5 });
  });

  test.each([
    ["an empty id", ""],
    ["only the prefix", "reaper"],
    ["no action", `reaper:${sessionId}`],
    ["a page button without a number", `reaper:${sessionId}:page`],
    ["a page button with an empty number", `reaper:${sessionId}:page:`],
    ["a negative page", `reaper:${sessionId}:page:-1`],
    ["a fractional page", `reaper:${sessionId}:page:1.5`],
    ["a page that is not a number", `reaper:${sessionId}:page:two`],
    ["an empty session id", "reaper::page:1"],
    ["an action other than page", `reaper:${sessionId}:select:1`],
    ["extra parts after the page", `reaper:${sessionId}:page:1:extra`],
    ["a different prefix", `pick:${sessionId}:page:1`],
  ])("gives undefined for %s", (_label, customId) => {
    expect(parseReaperCustomId(customId)).toBeUndefined();
  });
});
