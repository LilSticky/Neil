import {
  adoptReported,
  canSend,
  countRequest,
  markLimitReached,
  todaysQuota,
  type DailyQuota,
  type UtcDay,
} from "../domain/daily-quota.js";

/** The storage port for today's Daily Quota row; the storage adapter implements it. */
export interface DailyQuotaStorage {
  load(): DailyQuota | undefined;
  save(q: DailyQuota): void;
}

export interface QuotaKeeperOptions {
  readonly store: DailyQuotaStorage;
  readonly now: () => Date;
}

/**
 * Counts the Game API requests Neil sends against the Daily Quota. The stored row is the truth across restarts;
 * the requests still in flight are kept in memory only.
 */
export class QuotaKeeper {
  private readonly store: DailyQuotaStorage;
  private readonly now: () => Date;
  private inFlight = 0;

  constructor(options: QuotaKeeperOptions) {
    this.store = options.store;
    this.now = options.now;
  }

  /** Today's Daily Quota. Rolls over to a fresh day at 00:00 UTC and saves the roll. */
  today(): DailyQuota {
    const stored = this.store.load();
    const quota = todaysQuota(stored, this.now());
    if (quota !== stored) this.store.save(quota);
    return quota;
  }

  /**
   * Counts one request before it is sent and returns the UTC day it is counted on. Undefined, with nothing saved,
   * when the Daily Quota is spent.
   */
  tryCount(): UtcDay | undefined {
    const quota = this.today();
    if (!canSend(quota)) return undefined;
    this.store.save(countRequest(quota));
    this.inFlight += 1;
    return quota.day;
  }

  /**
   * Ends one request in flight, counted on `day`. With the Game API's figures, adopts them plus the requests still
   * in flight. Figures for a day that is over are dropped, as they describe a day that no longer counts.
   */
  settle(day: UtcDay, figures: { readonly used: number; readonly limit: number } | undefined): void {
    this.endRequest();
    if (figures === undefined) return;
    const quota = this.today();
    if (quota.day !== day) return;
    this.store.save(adoptReported(quota, figures, this.inFlight, this.now()));
  }

  /** Ends the refused request in flight, counted on `day`, and marks that day's Daily Quota as spent. */
  limitReached(day: UtcDay): void {
    this.endRequest();
    const quota = this.today();
    if (quota.day !== day) return;
    this.store.save(markLimitReached(quota, this.now()));
  }

  private endRequest(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }
}
