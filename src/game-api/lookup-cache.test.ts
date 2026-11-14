import { describe, expect, test, vi } from "vitest";
import { InFlight, LookupCache } from "./lookup-cache.js";

const TTL_MS = 10 * 60_000;
const TWO_HOURS_MS = 2 * 60 * 60_000;
const asOf = new Date("2026-10-30T10:00:00Z");
const playerKey = "player:1";

/** A promise whose settlement the test controls. */
function deferred<R>(): {
  promise: Promise<R>;
  resolve: (value: R) => void;
  reject: (reason: Error) => void;
} {
  let resolve: (value: R) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<R>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("LookupCache.get", () => {
  test("returns the entry with its value, asOf and storedAt while it was stored less than the TTL ago", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    const storedAt = new Date(asOf.getTime() + TWO_HOURS_MS);
    cache.store(playerKey, "Alice", asOf, storedAt);

    const justBeforeExpiry = new Date(storedAt.getTime() + TTL_MS - 1);

    expect(cache.get(playerKey, justBeforeExpiry)).toStrictEqual({ value: "Alice", asOf, storedAt });
  });

  test("returns nothing once the entry was stored exactly the TTL ago", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    cache.store(playerKey, "Alice", asOf, asOf);

    const atExpiry = new Date(asOf.getTime() + TTL_MS);

    expect(cache.get(playerKey, atExpiry)).toBeUndefined();
  });

  test("counts the TTL from when Neil stored the entry, not from the asOf of the game data", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    const storedAt = new Date(asOf.getTime() + TWO_HOURS_MS);
    cache.store(playerKey, "Alice", asOf, storedAt);

    const justAfterStoring = new Date(storedAt.getTime() + 60_000);

    expect(cache.get(playerKey, justAfterStoring)).toStrictEqual({ value: "Alice", asOf, storedAt });
  });

  test("returns nothing for an entry stored long ago, even when its asOf is recent", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    const storedAt = asOf;
    const recentAsOf = new Date(asOf.getTime() + TWO_HOURS_MS);
    cache.store(playerKey, "Alice", recentAsOf, storedAt);

    const later = new Date(storedAt.getTime() + TTL_MS + 1_000);

    expect(cache.get(playerKey, later)).toBeUndefined();
  });

  test("an entry has no liveUsable flag: whatever the lookup, only storedAt decides", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    cache.store(playerKey, "Alice", asOf, asOf);

    const entry = cache.get(playerKey, new Date(asOf.getTime() + 60_000));

    expect(entry).not.toHaveProperty("liveUsable");
  });
});

describe("LookupCache.getStale", () => {
  test("returns an entry however old it is, with its asOf and storedAt", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    cache.store(playerKey, "Alice", asOf, asOf);

    const yearLater = new Date(asOf.getTime() + 365 * 24 * 60 * 60_000);
    expect(cache.get(playerKey, yearLater)).toBeUndefined();

    expect(cache.getStale(playerKey)).toStrictEqual({ value: "Alice", asOf, storedAt: asOf });
  });

  test("returns nothing for a key that was never stored", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });

    expect(cache.getStale("alliance:1:nml")).toBeUndefined();
  });
});

describe("LookupCache.store capacity", () => {
  test("with maxEntries 2, storing a third entry drops the oldest stored one", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS, maxEntries: 2 });
    cache.store("player:1", "Alice", asOf, asOf);
    cache.store("player:2", "Bob", asOf, asOf);
    cache.store("player:3", "Carol", asOf, asOf);

    expect(cache.getStale("player:1")).toBeUndefined();
    expect(cache.getStale("player:2")).toStrictEqual({ value: "Bob", asOf, storedAt: asOf });
    expect(cache.getStale("player:3")).toStrictEqual({ value: "Carol", asOf, storedAt: asOf });
  });

  test("by default holds 2,000 entries and drops the oldest stored one past that", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    for (let i = 0; i < 2000; i++) {
      cache.store(`player:${String(i)}`, `Player ${String(i)}`, asOf, asOf);
    }

    expect(cache.getStale("player:0")).toBeDefined();

    cache.store("player:2000", "Player 2000", asOf, asOf);

    expect(cache.getStale("player:0")).toBeUndefined();
    expect(cache.getStale("player:1")).toBeDefined();
    expect(cache.getStale("player:2000")).toBeDefined();
  });
});

describe("InFlight.share", () => {
  test("gives concurrent callers with the same key the same promise and runs once", async () => {
    const inFlight = new InFlight<string>();
    const lookup = deferred<string>();
    const run = vi.fn(() => lookup.promise);

    const first = inFlight.share(playerKey, run);
    const second = inFlight.share(playerKey, run);

    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);

    lookup.resolve("Alice");
    await expect(first).resolves.toBe("Alice");
    await expect(second).resolves.toBe("Alice");
  });

  test("runs again for a later call once the shared promise has resolved", async () => {
    const inFlight = new InFlight<string>();

    await expect(inFlight.share(playerKey, () => Promise.resolve("Alice"))).resolves.toBe("Alice");

    const later = vi.fn(() => Promise.resolve("Alice again"));
    await expect(inFlight.share(playerKey, later)).resolves.toBe("Alice again");
    expect(later).toHaveBeenCalledTimes(1);
  });

  test("forgets the shared promise when it rejects, so a later call runs again", async () => {
    const inFlight = new InFlight<string>();

    await expect(
      inFlight.share(playerKey, () => Promise.reject(new Error("Game API unreachable"))),
    ).rejects.toThrow("Game API unreachable");

    const later = vi.fn(() => Promise.resolve("Alice"));
    await expect(inFlight.share(playerKey, later)).resolves.toBe("Alice");
    expect(later).toHaveBeenCalledTimes(1);
  });
});
