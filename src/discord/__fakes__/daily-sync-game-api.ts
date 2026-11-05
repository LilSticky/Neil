import { utcDayOf, type DailyQuota, type RequestPurpose } from "../../domain/daily-quota.js";
import type { LookupCaller } from "../../game-api/allowance-keeper.js";
import type { AllianceKey, KingdomNumber, Uid } from "../../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../../domain/player.js";
import type { DailySyncGameApi } from "../daily-sync.js";

/** One request the Daily Sync sent: a roster (an Alliance by Kingdom and tag) or a Player by uid. */
export type SyncRequest =
  | { readonly kind: "roster"; readonly kingdom: number; readonly tag: string; readonly purpose: RequestPurpose }
  | { readonly kind: "player"; readonly uid: string; readonly purpose: RequestPurpose };

/**
 * The Game API as the Daily Sync uses it: records every request it is asked for, counts it against the Daily Quota,
 * and answers with the prepared result (not-found for anything not prepared). A call counts `chargePerCall` requests
 * (retries included), and `onRequest` hooks run as each request is sent, before its answer.
 */
export class FakeDailySyncGameApi implements DailySyncGameApi {
  readonly requests: SyncRequest[] = [];
  private readonly rosters = new Map<string, LookupResult<Alliance>>();
  private readonly players = new Map<string, LookupResult<Player>>();
  private readonly hooks: (() => void)[] = [];
  private used = 0;
  private limit = 1000;
  private charge = 1;

  constructor(private readonly now: () => Date) {}

  answerRoster(kingdom: KingdomNumber, tag: string, result: LookupResult<Alliance>): void {
    this.rosters.set(`${kingdom.toString()}:${tag}`, result);
  }

  answerPlayer(uid: Uid, result: LookupResult<Player>): void {
    this.players.set(String(uid), result);
  }

  /** The Daily Quota as it stands: `used` requests counted of `limit`. */
  setQuota(used: number, limit: number): void {
    this.used = used;
    this.limit = limit;
  }

  /** Every call counts this many requests against the Daily Quota, as retries do on the real client. */
  chargePerCall(requests: number): void {
    this.charge = requests;
  }

  /** Runs the hook each time a request is sent, after it is recorded and before it is answered. */
  onRequest(hook: () => void): void {
    this.hooks.push(hook);
  }

  getAlliance(kingdom: KingdomNumber, key: AllianceKey, purpose: RequestPurpose): Promise<LookupResult<Alliance>> {
    this.requests.push({ kind: "roster", kingdom: Number(kingdom), tag: String(key), purpose });
    this.sent();
    return Promise.resolve(this.rosters.get(`${kingdom.toString()}:${String(key)}`) ?? { kind: "not-found" });
  }

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.requests.push({ kind: "player", uid: String(uid), purpose });
    this.sent();
    return Promise.resolve(this.players.get(String(uid)) ?? { kind: "not-found" });
  }

  /** Each charged view asked for; the Daily Sync never charges a Member, so the list must stay empty. */
  readonly charges: LookupCaller[] = [];

  chargedTo(caller: LookupCaller): never {
    this.charges.push(caller);
    throw new Error("the Daily Sync must not charge a Member");
  }

  quotaToday(): DailyQuota {
    return {
      day: utcDayOf(this.now()),
      used: this.used,
      limit: this.limit,
      limitReached: false,
      confirmedAt: undefined,
    };
  }

  private sent(): void {
    this.used += this.charge;
    for (const hook of this.hooks) hook();
  }
}
