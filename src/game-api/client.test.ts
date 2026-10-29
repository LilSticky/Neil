import { describe, expect, test, vi } from "vitest";
import { parseUid, type Uid } from "../domain/lookup-input.js";
import playerInAlliance from "./__fixtures__/player-in-alliance.json" with { type: "json" };
import { GameApiClient } from "./client.js";

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
