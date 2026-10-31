import {
  adoptReported,
  canSend,
  canSendFor,
  countRequest,
  markLimitReached,
  todaysQuota,
  type DailyQuota,
  type RequestPurpose,
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
  /** Requests kept back for Onboarding Interviews; from GAME_API_QUOTA_RESERVE. */
  readonly reserve: number;
}

/** Why a request was not counted: today's Daily Quota is spent, or only the Quota Reserve is left for its purpose. */
export type RefusalReason = "spent" | "reserve";

/** The outcome of counting a request: the UTC day it is counted on, or the reason it was refused. */
export type CountAttempt = { readonly ok: true; readonly day: UtcDay } | { readonly ok: false; readonly reason: RefusalReason };

/**
 * Counts the Game API requests Neil sends against the Daily Quota. The stored row is the truth across restarts;
 * the requests still in flight are kept in memory only.
 */
export class QuotaKeeper {
  private readonly store: DailyQuotaStorage;
  private readonly now: () => Date;
  private readonly reserve: number;
  private inFlight = 0;

  constructor(options: QuotaKeeperOptions) {
    this.store = options.store;
    this.now = options.now;
    this.reserve = options.reserve;
  }

  /** Today's Daily Quota. Rolls over to a fresh day at 00:00 UTC and saves the roll. */
  today(): DailyQuota {
    const stored = this.store.load();
    const quota = todaysQuota(stored, this.now());
    if (quota !== stored) this.store.save(quota);
    return quota;
  }

  /**
   * Counts one request for the purpose before it is sent. Refused with nothing saved when the Daily Quota is spent,
   * or when a lookup would have to use the Quota Reserve.
   */
  tryCount(purpose: RequestPurpose): CountAttempt {
    const quota = this.today();
    if (!canSend(quota)) return { ok: false, reason: "spent" };
    if (!canSendFor(quota, purpose, this.reserve)) return { ok: false, reason: "reserve" };
    this.store.save(countRequest(quota));
    this.inFlight += 1;
    return { ok: true, day: quota.day };
  }

  /** Whether a request for the purpose may be sent today. Counts nothing. */
  mayCount(purpose: RequestPurpose): boolean {
    return canSendFor(this.today(), purpose, this.reserve);
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
