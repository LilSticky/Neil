import { describe, expect, test, vi } from "vitest";
import {
  parseAllianceKey,
  parseKingdom,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type Uid,
} from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../domain/player.js";
import alliance from "./__fixtures__/alliance.json" with { type: "json" };
import allianceNotFound from "./__fixtures__/alliance-not-found.json" with { type: "json" };
import playerInAlliance from "./__fixtures__/player-in-alliance.json" with { type: "json" };
import { type FetchLike, GameApiClient } from "./client.js";

const FAKE_API_KEY = "fake-api-key-never-shown-b81e4d";
const VERSION = "0.1.0";
const PLAYER_UID_TEXT = "145563254785";
const PLAYER_PATH = `https://api.lastasylumtracker.com/v1/players/${PLAYER_UID_TEXT}`;

interface SentRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function parsedUid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid ${text} must parse`);
  return parsed.value;
}

function parsedKingdom(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok) throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

function parsedAllianceKey(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test alliance key "${text}" must parse`);
  return parsed.value;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fake fetch that records every request and answers each one with the given response. */
function fakeFetch(respond: () => Response) {
  const sent: SentRequest[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : input.toString();
    sent.push({ url, init });
    return Promise.resolve(respond());
  };
  return { fetch, sent };
}

function firstRequest(sent: readonly SentRequest[]): SentRequest {
  const request = sent[0];
  if (!request) throw new Error("the client sent no request");
  return request;
}

function clientWith(fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) {
  return new GameApiClient({
    apiKey: FAKE_API_KEY,
    version: VERSION,
    fetch,
    logError: vi.fn<(line: string) => void>(),
  });
}

describe("GameApiClient.getPlayer request", () => {
  test("sends GET to the player's path on the Game API", async () => {
    const { fetch, sent } = fakeFetch(() => jsonResponse(200, playerInAlliance));

    await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(firstRequest(sent).url).toBe(PLAYER_PATH);
    expect(firstRequest(sent).init?.method ?? "GET").toBe("GET");
  });

  test("authenticates with the API key and identifies Neil in the User-Agent", async () => {
    const { fetch, sent } = fakeFetch(() => jsonResponse(200, playerInAlliance));

    await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    const headers = new Headers(firstRequest(sent).init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${FAKE_API_KEY}`);
    expect(headers.get("User-Agent")).toBe(`Neil/${VERSION} (+https://github.com/LilSticky/Neil)`);
    expect(headers.get("Accept")).toBe("application/json");
  });

  test("passes an abort signal so a slow Game API cannot hang the lookup", async () => {
    const { fetch, sent } = fakeFetch(() => jsonResponse(200, playerInAlliance));

    await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(firstRequest(sent).init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("GameApiClient.getPlayer result", () => {
  test("a 200 for the requested player is found, mapped to a Player with its Alliance Rank", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(200, playerInAlliance));

    const result = await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(result).toEqual({
      kind: "found",
      value: {
        uid: "145563254785",
        name: "DrLOL",
        kingdom: 1,
        power: 15902728,
        sanctuaryLevel: 23,
        alliance: { tag: "NML", name: "No Man's Land" },
        allianceRank: "R5",
      },
    });
  });

  test.each([
    ["0", 0],
    ["null", null],
  ])("a player with aid %s and an empty roster has no Alliance and no Alliance Rank", async (_label, aid) => {
    const body = { ...playerInAlliance, aid, alliance_members: [] };
    const { fetch } = fakeFetch(() => jsonResponse(200, body));

    const result = await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(result).toEqual({
      kind: "found",
      value: {
        uid: "145563254785",
        name: "DrLOL",
        kingdom: 1,
        power: 15902728,
        sanctuaryLevel: 23,
        alliance: undefined,
        allianceRank: undefined,
      },
    });
  });

  test("a player whose own row is missing from the roster has the unknown Alliance Rank", async () => {
    const body = {
      ...playerInAlliance,
      alliance_members: playerInAlliance.alliance_members.filter((row) => row.uid !== 145563254785),
    };
    const { fetch } = fakeFetch(() => jsonResponse(200, body));

    const result = await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(result).toMatchObject({
      kind: "found",
      value: { alliance: { tag: "NML", name: "No Man's Land" }, allianceRank: "unknown" },
    });
  });

  test("a 404 is not-found", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(404, { detail: "player_not_found" }));

    const result = await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(result).toEqual({ kind: "not-found" });
  });

  test("a 200 for another player is unavailable, reason unexpected", async () => {
    const body = { ...playerInAlliance, uid: 1 };
    const { fetch } = fakeFetch(() => jsonResponse(200, body));

    const result = await clientWith(fetch).getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(result).toEqual({ kind: "unavailable", reason: "unexpected" });
  });
});

function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

function failingFetch(respond: () => Response): FetchLike {
  return () => Promise.resolve(respond());
}

function rejectingFetch(error: Error): FetchLike {
  return () => Promise.reject(error);
}

/** A client whose log lines are collected, so the tests can check exactly what was logged. */
function loggingClientWith(fetch: FetchLike) {
  const logged: string[] = [];
  const client = new GameApiClient({
    apiKey: FAKE_API_KEY,
    version: VERSION,
    fetch,
    logError: (line: string) => {
      logged.push(line);
    },
  });
  return { client, logged };
}

interface FailureScenario {
  readonly label: string;
  readonly fetch: FetchLike;
  readonly expected: LookupResult<Player>;
  /** The cause that the one log line must name: the status, "timeout" or "network". */
  readonly loggedCause: string;
}

const PLAYER_PATH_IN_LOG = /\/players\/(\{uid\}|145563254785)/;

const failureScenarios: readonly FailureScenario[] = [
  {
    label: "429",
    fetch: failingFetch(() => jsonResponse(429, { detail: "rate_limited" })),
    expected: { kind: "quota-spent" },
    loggedCause: "429",
  },
  {
    label: "502",
    fetch: failingFetch(() => textResponse(502, "error code: 502")),
    expected: { kind: "try-again" },
    loggedCause: "502",
  },
  {
    label: "503",
    fetch: failingFetch(() => textResponse(503, "error code: 503")),
    expected: { kind: "try-again" },
    loggedCause: "503",
  },
  {
    label: "504",
    fetch: failingFetch(() => textResponse(504, "error code: 504")),
    expected: { kind: "try-again" },
    loggedCause: "504",
  },
  {
    label: "timeout",
    fetch: rejectingFetch(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    expected: { kind: "try-again" },
    loggedCause: "timeout",
  },
  {
    label: "network error",
    fetch: rejectingFetch(new TypeError("fetch failed")),
    expected: { kind: "try-again" },
    loggedCause: "network",
  },
  {
    label: "401",
    fetch: failingFetch(() => jsonResponse(401, { detail: "invalid_key" })),
    expected: { kind: "unavailable", reason: "auth" },
    loggedCause: "401",
  },
  {
    label: "403",
    fetch: failingFetch(() => jsonResponse(403, { detail: "forbidden" })),
    expected: { kind: "unavailable", reason: "auth" },
    loggedCause: "403",
  },
  {
    label: "500",
    fetch: failingFetch(() => textResponse(500, "Internal Server Error")),
    expected: { kind: "unavailable", reason: "unexpected" },
    loggedCause: "500",
  },
  {
    label: "418",
    fetch: failingFetch(() => textResponse(418, "I'm a teapot")),
    expected: { kind: "unavailable", reason: "unexpected" },
    loggedCause: "418",
  },
];

describe("GameApiClient.getPlayer failure mapping", () => {
  test.each(failureScenarios)("$label gives $expected.kind", async (scenario) => {
    const { client } = loggingClientWith(scenario.fetch);

    const result = await client.getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(result).toEqual(scenario.expected);
  });

  test.each(failureScenarios)("$label logs one line with the path and the cause, never the key", async (scenario) => {
    const { client, logged } = loggingClientWith(scenario.fetch);

    await client.getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(PLAYER_PATH_IN_LOG);
    expect(logged[0]).toContain(scenario.loggedCause);
    expect(logged.join("\n")).not.toContain(FAKE_API_KEY);
  });

  test("a 404 is not logged", async () => {
    const { client, logged } = loggingClientWith(failingFetch(() => jsonResponse(404, { detail: "player_not_found" })));

    await client.getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(logged).toEqual([]);
  });

  test("a 200 with an invalid body is unavailable, and the one log line names the zod issue path, never the key", async () => {
    const body = { ...playerInAlliance, nick: undefined };
    const { client, logged } = loggingClientWith(failingFetch(() => jsonResponse(200, body)));

    const result = await client.getPlayer(parsedUid(PLAYER_UID_TEXT));

    expect(result).toEqual({ kind: "unavailable", reason: "unexpected" });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("nick");
    expect(logged.join("\n")).not.toContain(FAKE_API_KEY);
  });
});

const ALLIANCE_PATH = "https://api.lastasylumtracker.com/v1/alliances/1/NML";

describe("GameApiClient.getAlliance request", () => {
  test("sends GET to the alliance's path in its Kingdom on the Game API", async () => {
    const { fetch, sent } = fakeFetch(() => jsonResponse(200, alliance));

    await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("NML"));

    expect(firstRequest(sent).url).toBe(ALLIANCE_PATH);
    expect(firstRequest(sent).init?.method ?? "GET").toBe("GET");
  });

  test("percent-encodes an alliance key with a space", async () => {
    const { fetch, sent } = fakeFetch(() => jsonResponse(200, alliance));

    await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("No Man"));

    expect(firstRequest(sent).url).toBe("https://api.lastasylumtracker.com/v1/alliances/1/No%20Man");
  });

  test("authenticates with the API key and identifies Neil in the User-Agent", async () => {
    const { fetch, sent } = fakeFetch(() => jsonResponse(200, alliance));

    await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("NML"));

    const headers = new Headers(firstRequest(sent).init?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${FAKE_API_KEY}`);
    expect(headers.get("User-Agent")).toBe(`Neil/${VERSION} (+https://github.com/LilSticky/Neil)`);
  });
});

describe("GameApiClient.getAlliance result", () => {
  test("a 200 for the requested Kingdom is found, mapped to an Alliance", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(200, alliance));

    const result = await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("NML"));

    const expected: Alliance = {
      tag: "NML",
      name: "No Man's Land",
      kingdom: parsedKingdom(1),
      power: 208815434,
      memberCount: 52,
      capacity: 100,
      leaderName: "DrLOL",
    };
    expect(result).toEqual({ kind: "found", value: expected });
  });

  test("a null leader_name gives an Alliance without a leader name", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(200, { ...alliance, leader_name: null }));

    const result = await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("NML"));

    expect(result).toMatchObject({
      kind: "found",
      value: { tag: "NML", leaderName: undefined },
    });
  });

  test("a 404 is not-found", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(404, allianceNotFound));

    const result = await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("ZZZQX"));

    expect(result).toEqual({ kind: "not-found" });
  });

  test("a 409 with a readable matches list is ambiguous, each match mapped with its server as kingdom", async () => {
    // Hand-written, not recorded (research R9): the shape of a 409 for a name shared by two alliances.
    const body = {
      matches: [
        { tag: "NML", name: "No Man's Land", server: 1, uid: 145563254785 },
        { tag: "NMX", name: "No Man's Land", server: 2, uid: 93159425 },
      ],
    };
    const { fetch } = fakeFetch(() => jsonResponse(409, body));

    const result = await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("No Man's Land"));

    expect(result).toEqual({
      kind: "ambiguous",
      matches: [
        { tag: "NML", name: "No Man's Land", kingdom: 1, uid: "145563254785" },
        { tag: "NMX", name: "No Man's Land", kingdom: 2, uid: "93159425" },
      ],
    });
  });

  test.each([
    ["a JSON body without matches", () => jsonResponse(409, { detail: "alliance_ambiguous" })],
    ["a plain-text body", () => textResponse(409, "error code: 409")],
  ])("a 409 with %s is unavailable, reason unexpected", async (_label, respond) => {
    const { fetch } = fakeFetch(respond);

    const result = await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("NML"));

    expect(result).toEqual({ kind: "unavailable", reason: "unexpected" });
  });

  test("a 200 for another Kingdom is unavailable, reason unexpected", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(200, { ...alliance, sid: 2 }));

    const result = await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("NML"));

    expect(result).toEqual({ kind: "unavailable", reason: "unexpected" });
  });

  test("a 429 is quota-spent, as for a player", async () => {
    const { fetch } = fakeFetch(() => jsonResponse(429, { detail: "rate_limited" }));

    const result = await clientWith(fetch).getAlliance(parsedKingdom(1), parsedAllianceKey("NML"));

    expect(result).toEqual({ kind: "quota-spent" });
  });
});
