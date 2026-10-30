import { describe, expect, test, vi } from "vitest";
import { LookupCache } from "./lookup-cache.js";

const TTL_MS = 10 * 60_000;
const fetchedAt = new Date("2026-10-30T10:00:00Z");
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
  test("returns the entry with its fetchedAt while it is younger than the TTL", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    cache.store(playerKey, "Alice", fetchedAt);

    const justBeforeExpiry = new Date(fetchedAt.getTime() + TTL_MS - 1);

    expect(cache.get(playerKey, justBeforeExpiry)).toEqual({ value: "Alice", fetchedAt });
  });

  test("returns nothing once the entry is exactly the TTL old", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    cache.store(playerKey, "Alice", fetchedAt);

    const atExpiry = new Date(fetchedAt.getTime() + TTL_MS);

    expect(cache.get(playerKey, atExpiry)).toBeUndefined();
  });
});

describe("LookupCache.getStale", () => {
  test("returns an entry however old it is", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    cache.store(playerKey, "Alice", fetchedAt);

    const yearLater = new Date(fetchedAt.getTime() + 365 * 24 * 60 * 60_000);
    expect(cache.get(playerKey, yearLater)).toBeUndefined();

    expect(cache.getStale(playerKey)).toEqual({ value: "Alice", fetchedAt });
  });

  test("returns nothing for a key that was never stored", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });

    expect(cache.getStale("alliance:1:nml")).toBeUndefined();
  });
});

describe("LookupCache.store capacity", () => {
  test("with maxEntries 2, storing a third entry drops the oldest stored one", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS, maxEntries: 2 });
    cache.store("player:1", "Alice", fetchedAt);
    cache.store("player:2", "Bob", fetchedAt);
    cache.store("player:3", "Carol", fetchedAt);

    expect(cache.getStale("player:1")).toBeUndefined();
    expect(cache.getStale("player:2")).toEqual({ value: "Bob", fetchedAt });
    expect(cache.getStale("player:3")).toEqual({ value: "Carol", fetchedAt });
  });

  test("by default holds 2,000 entries and drops the oldest stored one past that", () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    for (let i = 0; i < 2000; i++) {
      cache.store(`player:${String(i)}`, `Player ${String(i)}`, fetchedAt);
    }

    expect(cache.getStale("player:0")).toBeDefined();

    cache.store("player:2000", "Player 2000", fetchedAt);

    expect(cache.getStale("player:0")).toBeUndefined();
    expect(cache.getStale("player:1")).toBeDefined();
    expect(cache.getStale("player:2000")).toBeDefined();
  });
});

describe("LookupCache.share", () => {
  test("gives concurrent callers with the same key the same promise and runs once", async () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });
    const lookup = deferred<string>();
    const run = vi.fn(() => lookup.promise);

    const first = cache.share(playerKey, run);
    const second = cache.share(playerKey, run);

    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);

    lookup.resolve("Alice");
    await expect(first).resolves.toBe("Alice");
    await expect(second).resolves.toBe("Alice");
  });

  test("runs again for a later call once the shared promise has resolved", async () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });

    await expect(cache.share(playerKey, () => Promise.resolve("Alice"))).resolves.toBe("Alice");

    const later = vi.fn(() => Promise.resolve("Alice again"));
    await expect(cache.share(playerKey, later)).resolves.toBe("Alice again");
    expect(later).toHaveBeenCalledTimes(1);
  });

  test("forgets the shared promise when it rejects, so a later call runs again", async () => {
    const cache = new LookupCache<string>({ ttlMs: TTL_MS });

    await expect(
      cache.share(playerKey, () => Promise.reject(new Error("Game API unreachable"))),
    ).rejects.toThrow("Game API unreachable");

    const later = vi.fn(() => Promise.resolve("Alice"));
    await expect(cache.share(playerKey, later)).resolves.toBe("Alice");
    expect(later).toHaveBeenCalledTimes(1);
  });
});
