import {
  daysToRecord,
  dailyAllowance,
  expectedLookupMembers,
  mayUse,
  type LookupMemberRecord,
} from "../domain/daily-allowance.js";
import { type UtcDay, utcDayOf } from "../domain/daily-quota.js";
import type { MemberId } from "../domain/rank-approval.js";
import type { QuotaKeeper } from "./quota-keeper.js";

/** Who makes a lookup: the Member, and whether the Member is an Officer. */
export type LookupCaller = { memberId: MemberId; officer: boolean };

/** How many requests one Member's lookups caused on a UTC day. */
export interface MemberUsage {
  readonly memberId: MemberId;
  readonly requests: number;
}

/** The storage port for Member usage and Lookup Member records; the storage adapter implements it. */
export interface MemberUsageStorage {
  countRequest(memberId: MemberId, day: UtcDay): void;
  requestsOf(memberId: MemberId, day: UtcDay): number;
  usageOn(day: UtcDay): readonly MemberUsage[];
  records(): readonly LookupMemberRecord[];
  firstUsageDay(): UtcDay | undefined;
  rollover(days: readonly UtcDay[], today: UtcDay): void;
}

export interface AllowanceKeeperOptions {
  readonly store: MemberUsageStorage;
  readonly quota: QuotaKeeper;
  readonly now: () => Date;
  /** Requests kept back for Onboarding Interviews; from GAME_API_QUOTA_RESERVE. */
  readonly reserve: number;
  /** Requests kept back for the Daily Sync; from SYNC_SHARE. */
  readonly syncShare: number;
}

/**
 * Keeps each Member within the Daily Allowance: counts the requests a Member's lookups cause, and rolls the usage
 * over at 00:00 UTC. The database is the truth; the rollover guard is kept in memory only.
 */
export class AllowanceKeeper {
  private readonly store: MemberUsageStorage;
  private readonly quota: QuotaKeeper;
  private readonly now: () => Date;
  private readonly reserve: number;
  private readonly syncShare: number;
  private rolledOverFor: UtcDay | undefined;

  constructor(options: AllowanceKeeperOptions) {
    this.store = options.store;
    this.quota = options.quota;
    this.now = options.now;
    this.reserve = options.reserve;
    this.syncShare = options.syncShare;
  }

  /** The Expected Lookup Members of today. */
  expected(): number {
    const today = this.rollOver();
    return expectedLookupMembers(this.store.records(), today);
  }

  /** The Daily Allowance of today: how many requests one Member's lookups may cause. */
  allowance(): number {
    const today = this.rollOver();
    return this.allowanceOn(today);
  }

  /** How many requests the Member's lookups caused today. */
  usageOf(memberId: MemberId): number {
    const today = this.rollOver();
    return this.store.requestsOf(memberId, today);
  }

  /** Whether the caller's next lookup may cause a request: an Officer always may, a Member below the allowance. */
  mayCharge(caller: LookupCaller): boolean {
    const today = this.rollOver();
    const used = this.store.requestsOf(caller.memberId, today);
    return mayUse(used, this.allowanceOn(today), caller.officer);
  }

  /** Counts one request against the caller's usage today. Call only when mayCharge is true. */
  charge(caller: LookupCaller): void {
    const today = this.rollOver();
    this.store.countRequest(caller.memberId, today);
  }

  /** The n Members with the most requests today, most first, ties by Member id. */
  top(n: number): readonly MemberUsage[] {
    const today = this.rollOver();
    return this.store.usageOn(today).slice(0, n);
  }

  private allowanceOn(today: UtcDay): number {
    return dailyAllowance({
      limit: this.quota.today().limit,
      reserve: this.reserve,
      syncShare: this.syncShare,
      expected: expectedLookupMembers(this.store.records(), today),
    });
  }

  /** Records the finished days and drops old usage, once per UTC day; returns today. */
  private rollOver(): UtcDay {
    const today = utcDayOf(this.now());
    if (this.rolledOverFor === today) return today;
    const records = this.store.records();
    const lastRecorded = records[records.length - 1]?.day;
    const days = daysToRecord(lastRecorded, this.store.firstUsageDay(), today);
    this.store.rollover(days, today);
    this.rolledOverFor = today;
    return today;
  }
}
