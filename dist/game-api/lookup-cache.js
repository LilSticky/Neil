const DEFAULT_MAX_ENTRIES = 2000;
/**
 * Shares one in-flight run per key between concurrent callers. The promise is forgotten when it settles, so a later
 * call runs again (also after a rejection).
 */
export class InFlight {
    pending = new Map();
    share(key, run) {
        const existing = this.pending.get(key);
        if (existing !== undefined)
            return existing;
        const shared = new Promise((resolve) => {
            resolve(run());
        }).finally(() => {
            if (this.pending.get(key) === shared)
                this.pending.delete(key);
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
export class LookupCache {
    ttlMs;
    maxEntries;
    entries = new Map();
    constructor(options) {
        this.ttlMs = options.ttlMs;
        this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    }
    /**
     * The entry for `key` if it is young enough at `now` for the freshness asked for: a copy lookup counts from when it
     * was stored, a live lookup, which takes only a `liveUsable` entry, from when the game sent it. Otherwise `undefined`.
     */
    get(key, now, freshness) {
        const entry = this.entries.get(key);
        if (entry === undefined)
            return undefined;
        if (freshness === "live" && !entry.liveUsable)
            return undefined;
        const since = freshness === "live" ? entry.asOf : entry.storedAt;
        return now.getTime() - since.getTime() < this.ttlMs ? entry : undefined;
    }
    /** The entry for `key` however old it is, for answers given when the Daily Quota is spent. */
    getStale(key) {
        return this.entries.get(key);
    }
    /**
     * Stores `value` under `key` as the newest entry, dropping the oldest stored entry past `maxEntries`. `liveUsable`
     * says whether a live lookup may take it (see CacheEntry).
     */
    store(key, value, asOf, storedAt, liveUsable) {
        this.entries.delete(key);
        this.entries.set(key, { value, asOf, storedAt, liveUsable });
        if (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done !== true)
                this.entries.delete(oldest.value);
        }
    }
}
//# sourceMappingURL=lookup-cache.js.map