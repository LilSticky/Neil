import type { Freshness } from "../domain/player.js";

/**
 * A stored value, when the game sent its data, when Neil stored it, and whether a live lookup may take it. A live
 * lookup may take an entry from a live request, or from a copy answer whose age the game gave; `asOf` alone cannot
 * say so, as an answer without an age is shown as of the moment it arrived.
 */
export interface CacheEntry<T> {
  readonly value: T;
  readonly asOf: Date;
  readonly storedAt: Date;
  readonly liveUsable: boolean;
}

export interface LookupCacheOptions {
  readonly ttlMs: number;
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 2000;

/**
 * Shares one in-flight run per key between concurrent callers. The promise is forgotten when it settles, so a later
 * call runs again (also after a rejection).
 */
export class InFlight<R> {
  private readonly pending = new Map<string, Promise<R>>();

  share(key: string, run: () => Promise<R>): Promise<R> {
    const existing = this.pending.get(key);
    if (existing !== undefined) return existing;

    const shared: Promise<R> = new Promise<R>((resolve) => {
      resolve(run());
    }).finally(() => {
      if (this.pending.get(key) === shared) this.pending.delete(key);
    });
    this.pending.set(key, shared);
    return shared;
  }
}

/**
 * An in-memory cache of Game API answers keyed by lookup. A copy lookup takes an entry stored less than `ttlMs` ago;
 * a live lookup takes one that is `liveUsable` and whose `asOf` is less than `ttlMs` ago. Past `maxEntries` the oldest
 * stored entry is dropped.
 */
export class LookupCache<T> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(options: LookupCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * The entry for `key` if it is young enough at `now` for the freshness asked for: a copy lookup counts from when it
   * was stored, a live lookup, which takes only a `liveUsable` entry, from when the game sent it. Otherwise `undefined`.
   */
  get(key: string, now: Date, freshness: Freshness): CacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (freshness === "live" && !entry.liveUsable) return undefined;
    const since = freshness === "live" ? entry.asOf : entry.storedAt;
    return now.getTime() - since.getTime() < this.ttlMs ? entry : undefined;
  }

  /** The entry for `key` however old it is, for answers given when the Daily Quota is spent. */
  getStale(key: string): CacheEntry<T> | undefined {
    return this.entries.get(key);
  }

  /**
   * Stores `value` under `key` as the newest entry, dropping the oldest stored entry past `maxEntries`. `liveUsable`
   * says whether a live lookup may take it (see CacheEntry).
   */
  store(key: string, value: T, asOf: Date, storedAt: Date, liveUsable: boolean): void {
    this.entries.delete(key);
    this.entries.set(key, { value, asOf, storedAt, liveUsable });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
  }
}
