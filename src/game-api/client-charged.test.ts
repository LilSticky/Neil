import { describe, expect, test, vi } from "vitest";
import type { MemberId } from "../domain/rank-approval.js";
import { todaysQuota, type RequestPurpose } from "../domain/daily-quota.js";
import {
  parseAllianceKey,
  parseKingdom,
  parsePlayerName,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type PlayerName,
  type Uid,
} from "../domain/lookup-input.js";
import type { Player } from "../domain/player.js";
import alliance from "./__fixtures__/alliance.json" with { type: "json" };
import playerInAlliance from "./__fixtures__/player-in-alliance.json" with { type: "json" };
import { AllowanceKeeper, type LookupCaller } from "./allowance-keeper.js";
import { GameApiClient, type ChargedResult } from "./client.js";
import {
  FakeClock,
  FakeMemberUsageStorage,
  FakeQuotaStore,
  fakeFetch,
  jsonResponse,
  textResponse,
} from "./__fakes__/game-api-fakes.js";
import { QuotaKeeper } from "./quota-keeper.js";

const FAKE_API_KEY = "fake-api-key-never-shown-7c2e91";
const VERSION = "0.1.0";
const PLAYER_UID_TEXT = "145563254785";
const FIXED_NOW = new Date("2026-10-30T15:20:00Z");
const NEXT_MIDNIGHT_UTC = new Date("2026-10-31T00:00:00Z");
const CACHE_TTL_MS = 600_000;
const QUOTA_RESERVE = 100;
const SYNC_SHARE = 500;
/** The default Daily Quota limit of 1,000, less the reserve and the sync share, over 100 Expected Lookup Members. */
const DAILY_ALLOWANCE = 4;
/** The random factor of a retry pause: the middle of [0, 1). */
const JITTER = 0.5;

const ALICE: MemberId = "111111111111111111";
const BOB: MemberId = "222222222222222222";
const alice: LookupCaller = { memberId: ALICE, officer: false };
const bob: LookupCaller = { memberId: BOB, officer: false };
const aliceOfficer: LookupCaller = { memberId: ALICE, officer: true };

function parsedUid(text: string): Uid {
  const parsed = parseUid(text);
  if (!parsed.ok) throw new Error(`test uid ${text} must parse`);
  return parsed.value;
}

function parsedName(text: string): PlayerName {
  const parsed = parsePlayerName(text);
  if (!parsed.ok) throw new Error(`test player name "${text}" must parse`);
  return parsed.value;
}

function parsedKingdom(number: number): KingdomNumber {
  const parsed = parseKingdom(number);
  if (!parsed.ok)
    throw new Error(`test Kingdom ${number.toString()} must parse`);
  return parsed.value;
}

function parsedAllianceKey(text: string): AllianceKey {
  const parsed = parseAllianceKey(text);
  if (!parsed.ok) throw new Error(`test alliance key "${text}" must parse`);
  return parsed.value;
}

const UID = parsedUid(PLAYER_UID_TEXT);
const ALPHA = parsedName("Alpha");
const BRAVO = parsedName("Bravo");
const CHARLIE = parsedName("Charlie");
const DELTA = parsedName("Delta");
const ECHO = parsedName("Echo");
const KINGDOM_ONE = parsedKingdom(1);
const NML = parsedAllianceKey("NML");
const NO_MANS_LAND = parsedAllianceKey("No Man's Land");

/** The Game API's answers: the recorded Alliance for an alliance path, the recorded Player for any other. */
function answerFor(url: string): Response {
  return url.includes("/alliances/")
    ? jsonResponse(200, alliance)
    : jsonResponse(200, playerInAlliance);
}

/**
 * A client on a fake fetch, a fake Daily Quota store and a real AllowanceKeeper over a fake usage store. The default
 * Daily Allowance is 4: the limit of 1,000 less the reserve and the sync share, over 100 Expected Lookup Members.
 */
function setUp(respond: (url: string) => Response = answerFor) {
  const clock = new FakeClock(FIXED_NOW);
  const quotaStore = new FakeQuotaStore();
  const quota = new QuotaKeeper({
    store: quotaStore,
    now: clock.now,
    reserve: QUOTA_RESERVE,
  });
  const usage = new FakeMemberUsageStorage();
  const allowance = new AllowanceKeeper({
    store: usage,
    quota,
    now: clock.now,
    reserve: QUOTA_RESERVE,
    syncShare: SYNC_SHARE,
  });
  const { fetch, sent } = fakeFetch(respond);
  const client = new GameApiClient({
    apiKey: FAKE_API_KEY,
    version: VERSION,
    fetch,
    now: clock.now,
    quota,
    sleep: clock.sleep,
    random: () => JITTER,
    cacheTtlMs: CACHE_TTL_MS,
    logError: vi.fn<(line: string) => void>(),
    allowance,
  });
  return { client, clock, quotaStore, allowance, sent };
}

/** One charged player-name lookup per name, for the caller, in order; returns each result. */
async function spend(
  client: GameApiClient,
  caller: LookupCaller,
  names: readonly PlayerName[],
): Promise<ChargedResult<Player>[]> {
  const results: ChargedResult<Player>[] = [];
  for (const name of names) {
    results.push(await client.chargedTo(caller).findPlayer(name, undefined));
  }
  return results;
}

describe("GameApiClient.chargedTo, an uncached lookup", () => {
  test("is sent, and the caller's usage goes up by one", async () => {
    const { client, sent, allowance } = setUp();

    const result = await client.chargedTo(alice).getPlayer(UID);

    expect(result).toMatchObject({ kind: "found" });
    expect(sent).toHaveLength(1);
    expect(allowance.usageOf(ALICE)).toBe(1);
  });

  test("a cached answer sends nothing and charges nothing", async () => {
    const { client, sent, allowance } = setUp();
    const charged = client.chargedTo(alice);
    const first = await charged.getPlayer(UID);

    const second = await charged.getPlayer(UID);

    expect(second).toEqual(first);
    expect(sent).toHaveLength(1);
    expect(allowance.usageOf(ALICE)).toBe(1);
  });
});

describe("GameApiClient.chargedTo at the Daily Allowance", () => {
  test("a lookup past the Daily Allowance is refused with allowance-spent at the next 00:00 UTC, sends nothing, and counts nothing against the Daily Quota", async () => {
    const { client, sent, quotaStore, allowance } = setUp();
    expect(allowance.allowance()).toBe(DAILY_ALLOWANCE);
    await spend(client, alice, [ALPHA, BRAVO, CHARLIE, DELTA]);
    const usedBefore = quotaStore.current?.used;

    const refused = await client.chargedTo(alice).findPlayer(ECHO, undefined);

    expect(refused).toEqual({
      kind: "allowance-spent",
      resetsAt: NEXT_MIDNIGHT_UTC,
    });
    expect(sent).toHaveLength(DAILY_ALLOWANCE);
    expect(quotaStore.current?.used).toBe(usedBefore);
  });

  test("a cached answer is still found, with no request and no charge", async () => {
    const { client, sent, allowance } = setUp();
    const [firstAlpha] = await spend(client, alice, [
      ALPHA,
      BRAVO,
      CHARLIE,
      DELTA,
    ]);

    const cached = await client.chargedTo(alice).findPlayer(ALPHA, undefined);

    expect(cached).toEqual(firstAlpha);
    expect(sent).toHaveLength(DAILY_ALLOWANCE);
    expect(allowance.usageOf(ALICE)).toBe(DAILY_ALLOWANCE);
  });

  test("a stale cached answer is returned as found with its old fetchedAt, and no request is sent", async () => {
    const { client, clock, sent } = setUp();
    const charged = client.chargedTo(alice);
    const first = await charged.findPlayer(ALPHA, undefined);
    clock.took(CACHE_TTL_MS + 1_000);
    await spend(client, alice, [BRAVO, CHARLIE, DELTA]);

    const stale = await charged.findPlayer(ALPHA, undefined);

    expect(stale).toEqual(first);
    expect(stale).toMatchObject({ kind: "found", fetchedAt: FIXED_NOW });
    expect(sent).toHaveLength(DAILY_ALLOWANCE);
  });

  test("an Officer past the Daily Allowance is sent and charged", async () => {
    const { client, sent, allowance } = setUp();
    await spend(client, aliceOfficer, [ALPHA, BRAVO, CHARLIE, DELTA, ECHO]);

    expect(sent).toHaveLength(DAILY_ALLOWANCE + 1);
    expect(allowance.usageOf(ALICE)).toBe(DAILY_ALLOWANCE + 1);
  });

  test("a failed request counts against the Daily Allowance", async () => {
    const { client, allowance } = setUp(() => textResponse(500, "error"));

    const result = await client.chargedTo(alice).getPlayer(UID);

    expect(result).toEqual({ kind: "unavailable", reason: "unexpected" });
    expect(allowance.usageOf(ALICE)).toBe(1);
  });

  test("a retry is a request of its own and counts against the Daily Allowance", async () => {
    let attempt = 0;
    const { client, clock, sent, allowance } = setUp(() => {
      attempt += 1;
      return attempt === 1
        ? textResponse(503, "error code: 503")
        : jsonResponse(200, playerInAlliance);
    });

    const result = await client.chargedTo(alice).getPlayer(UID);

    expect(result).toMatchObject({ kind: "found" });
    expect(sent).toHaveLength(2);
    expect(clock.pauses).toHaveLength(1);
    expect(allowance.usageOf(ALICE)).toBe(2);
  });

  test("no retry is made when the first attempt used up the Daily Allowance, and the lookup ends as try-again", async () => {
    const { client, clock, sent, allowance } = setUp((url) =>
      url.endsWith(`/${DELTA}`)
        ? textResponse(503, "error code: 503")
        : jsonResponse(200, playerInAlliance),
    );
    await spend(client, alice, [ALPHA, BRAVO, CHARLIE]);

    const result = await client.chargedTo(alice).findPlayer(DELTA, undefined);

    expect(result).toEqual({ kind: "try-again" });
    expect(sent).toHaveLength(DAILY_ALLOWANCE);
    expect(clock.pauses).toEqual([]);
    expect(allowance.usageOf(ALICE)).toBe(DAILY_ALLOWANCE);
  });

  test("a request refused by the Quota Reserve charges nothing and comes back as reserve-kept", async () => {
    const { client, quotaStore, sent, allowance } = setUp();
    quotaStore.save({ ...todaysQuota(undefined, FIXED_NOW), used: 900 });

    const result = await client.chargedTo(alice).getPlayer(UID);

    expect(result).toEqual({
      kind: "reserve-kept",
      resetsAt: NEXT_MIDNIGHT_UTC,
    });
    expect(sent).toEqual([]);
    expect(allowance.usageOf(ALICE)).toBe(0);
  });
});

describe("GameApiClient.chargedTo simultaneous lookups by one Member", () => {
  test("two simultaneous lookups of the same answer with one request left send one request", async () => {
    const { client, sent, allowance } = setUp();
    await spend(client, alice, [ALPHA, BRAVO, CHARLIE]);
    const charged = client.chargedTo(alice);

    const [first, second] = await Promise.all([
      charged.findPlayer(DELTA, undefined),
      charged.findPlayer(DELTA, undefined),
    ]);

    expect(first).toMatchObject({ kind: "found" });
    expect(second).toEqual(first);
    expect(sent).toHaveLength(DAILY_ALLOWANCE);
    expect(allowance.usageOf(ALICE)).toBe(DAILY_ALLOWANCE);
  });

  test("two simultaneous lookups of different answers with one request left send one, and the other is refused", async () => {
    const { client, sent, allowance } = setUp();
    await spend(client, alice, [ALPHA, BRAVO, CHARLIE]);
    const charged = client.chargedTo(alice);

    const [first, second] = await Promise.all([
      charged.findPlayer(DELTA, undefined),
      charged.findPlayer(ECHO, undefined),
    ]);

    expect([first.kind, second.kind].sort()).toEqual([
      "allowance-spent",
      "found",
    ]);
    expect(sent).toHaveLength(DAILY_ALLOWANCE);
    expect(allowance.usageOf(ALICE)).toBe(DAILY_ALLOWANCE);
  });
});

describe("GameApiClient.chargedTo simultaneous lookups by two Members", () => {
  test("two Members asking the same uncached answer at once each send a request and are each charged", async () => {
    const { client, sent, allowance } = setUp();

    const [alices, bobs] = await Promise.all([
      client.chargedTo(alice).findPlayer(ALPHA, undefined),
      client.chargedTo(bob).findPlayer(ALPHA, undefined),
    ]);

    expect(alices).toMatchObject({ kind: "found" });
    expect(bobs).toMatchObject({ kind: "found" });
    expect(sent).toHaveLength(2);
    expect(allowance.usageOf(ALICE)).toBe(1);
    expect(allowance.usageOf(BOB)).toBe(1);
  });

  test("a Member refused at the Daily Allowance never shares the answer another Member is fetching", async () => {
    const { client, sent, allowance } = setUp();
    await spend(client, alice, [ALPHA, BRAVO, CHARLIE, DELTA]);

    const [refused, bobs] = await Promise.all([
      client.chargedTo(alice).findPlayer(ECHO, undefined),
      client.chargedTo(bob).findPlayer(ECHO, undefined),
    ]);

    expect(refused).toEqual({
      kind: "allowance-spent",
      resetsAt: NEXT_MIDNIGHT_UTC,
    });
    expect(bobs).toMatchObject({ kind: "found" });
    expect(sent).toHaveLength(DAILY_ALLOWANCE + 1);
    expect(allowance.usageOf(ALICE)).toBe(DAILY_ALLOWANCE);
    expect(allowance.usageOf(BOB)).toBe(1);
  });
});

describe("GameApiClient uncharged methods", () => {
  test.each<RequestPurpose>(["lookup", "onboarding-interview", "sync"])(
    "the %s purpose's lookups charge nobody, not even a Member past the Daily Allowance",
    async (purpose) => {
      const { client, sent, allowance } = setUp();
      await spend(client, alice, [ALPHA, BRAVO, CHARLIE, DELTA]);

      const player = await client.getPlayer(UID, purpose);
      const playerByName = await client.findPlayer(ECHO, undefined, purpose);
      const allianceByKey = await client.getAlliance(KINGDOM_ONE, NML, purpose);
      const allianceByName = await client.findAlliance(NO_MANS_LAND, purpose);

      expect(player).toMatchObject({ kind: "found" });
      expect(playerByName).toMatchObject({ kind: "found" });
      expect(allianceByKey).toMatchObject({ kind: "found" });
      expect(allianceByName).toMatchObject({ kind: "found" });
      expect(sent).toHaveLength(DAILY_ALLOWANCE + 4);
      expect(allowance.usageOf(ALICE)).toBe(DAILY_ALLOWANCE);
      expect(allowance.usageOf(BOB)).toBe(0);
    },
  );
});
