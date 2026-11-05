import type { LookupMemberRecord } from "../../domain/daily-allowance.js";
import type { DailyQuota, UtcDay } from "../../domain/daily-quota.js";
import type { MemberId } from "../../domain/rank-approval.js";
import { AllowanceKeeper, type MemberUsage, type MemberUsageStorage } from "../allowance-keeper.js";
import type { FetchLike } from "../client.js";
import type { DailyQuotaStorage, QuotaKeeper } from "../quota-keeper.js";

/** The Quota Reserve and Daily Sync share the client tests run with; the Daily Allowance follows from them. */
const TEST_QUOTA_RESERVE = 100;
const TEST_SYNC_SHARE = 500;

/**
 * A Daily Allowance keeper over an in-memory usage store, on the given Daily Quota, with the reserve and sync share the
 * tests run with. Existing tests use it only to build a client; their lookups are uncharged.
 */
export function fakeAllowance(quota: QuotaKeeper, now: () => Date): AllowanceKeeper {
  return new AllowanceKeeper({
    store: new FakeMemberUsageStorage(),
    quota,
    now,
    reserve: TEST_QUOTA_RESERVE,
    syncShare: TEST_SYNC_SHARE,
  });
}

/** An in-memory Daily Quota row; the keeper reads its limit and counts into it. */
export class FakeQuotaStore implements DailyQuotaStorage {
  current: DailyQuota | undefined = undefined;

  load(): DailyQuota | undefined {
    return this.current;
  }

  save(q: DailyQuota): void {
    this.current = q;
  }
}

/** An in-memory Member usage store: counts per UTC day, and keeps the records of the days that rolled over. */
export class FakeMemberUsageStorage implements MemberUsageStorage {
  private readonly usage = new Map<UtcDay, Map<MemberId, number>>();
  private readonly recorded: LookupMemberRecord[] = [];

  countRequest(memberId: MemberId, day: UtcDay): void {
    const counts = this.usage.get(day) ?? new Map<MemberId, number>();
    counts.set(memberId, (counts.get(memberId) ?? 0) + 1);
    this.usage.set(day, counts);
  }

  requestsOf(memberId: MemberId, day: UtcDay): number {
    return this.usage.get(day)?.get(memberId) ?? 0;
  }

  usageOn(day: UtcDay): readonly MemberUsage[] {
    const counts = this.usage.get(day) ?? new Map<MemberId, number>();
    return [...counts.entries()]
      .map(([memberId, requests]) => ({ memberId, requests }))
      .sort(
        (a, b) =>
          b.requests - a.requests ||
          (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
      );
  }

  records(): readonly LookupMemberRecord[] {
    return [...this.recorded];
  }

  firstUsageDay(): UtcDay | undefined {
    return [...this.usage.keys()].sort()[0];
  }

  rollover(days: readonly UtcDay[], today: UtcDay): void {
    for (const day of days) {
      this.recorded.push({
        day,
        lookupMembers: this.usage.get(day)?.size ?? 0,
      });
    }
    for (const day of [...this.usage.keys()]) {
      if (day !== today) this.usage.delete(day);
    }
  }
}

/**
 * A fake fetch that records every request URL and answers it with what `respond` returns for that URL. Each call of
 * `respond` should return a fresh Response, as a Response body can be read once.
 */
export function fakeFetch(respond: (url: string) => Response): {
  fetch: FetchLike;
  sent: string[];
} {
  const sent: string[] = [];
  const fetch: FetchLike = (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    sent.push(url);
    return Promise.resolve(respond(url));
  };
  return { fetch, sent };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function textResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain" },
  });
}

/**
 * A clock the tests move by hand. Its sleep records each pause and advances the clock by it, as a real pause
 * would, so a retry sees the time its pause used up.
 */
export class FakeClock {
  readonly pauses: number[] = [];
  private current: Date;

  constructor(start: Date) {
    this.current = start;
  }

  now = (): Date => new Date(this.current.getTime());

  /** Moves the clock on as if the Game API took `ms` to answer. */
  took = (ms: number): void => {
    this.current = new Date(this.current.getTime() + ms);
  };

  sleep = (ms: number): Promise<void> => {
    this.pauses.push(ms);
    this.took(ms);
    return Promise.resolve();
  };
}
