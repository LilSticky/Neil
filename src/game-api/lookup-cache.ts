/** A stored value and the moment its data was fetched from the Game API. */
export interface CacheEntry<T> {
  readonly value: T;
  readonly fetchedAt: Date;
}

export interface LookupCacheOptions {
  readonly ttlMs: number;
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 2000;

/**
 * An in-memory cache of Game API answers keyed by lookup. Entries are fresh for `ttlMs` after their `fetchedAt`.
 * Past `maxEntries` the oldest stored entry is dropped. Also shares one in-flight lookup between concurrent callers.
 */
export class LookupCache<T> {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(options: LookupCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /** The entry for `key` if it is younger than the TTL at `now`; otherwise `undefined`. */
  get(key: string, now: Date): CacheEntry<T> | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    return now.getTime() - entry.fetchedAt.getTime() < this.ttlMs ? entry : undefined;
  }

  /** The entry for `key` however old it is, for answers given when the Daily Quota is spent. */
  getStale(key: string): CacheEntry<T> | undefined {
    return this.entries.get(key);
  }

  /** Stores `value` under `key` as the newest entry, dropping the oldest stored entry past `maxEntries`. */
  store(key: string, value: T, fetchedAt: Date): void {
    this.entries.delete(key);
    this.entries.set(key, { value, fetchedAt });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done !== true) this.entries.delete(oldest.value);
    }
  }

  /**
   * Runs `run` once for `key` while it is in flight: concurrent callers get the same promise. The promise is
   * forgotten when it settles, so a later call runs again (also after a rejection).
   */
  share(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) return existing;

    const pending: Promise<T> = new Promise<T>((resolve) => {
      resolve(run());
    }).finally(() => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }
}
