import { utcDayOf, type DailyQuota, type RequestPurpose } from "../../domain/daily-quota.js";
import type { AllianceKey, KingdomNumber, Uid } from "../../domain/lookup-input.js";
import type { Alliance, LookupResult, Player } from "../../domain/player.js";
import type { DailySyncGameApi } from "../daily-sync.js";

/** One request the Daily Sync sent: a roster (an Alliance by Kingdom and tag) or a Player by uid. */
export type SyncRequest =
  | { readonly kind: "roster"; readonly kingdom: number; readonly tag: string; readonly purpose: RequestPurpose }
  | { readonly kind: "player"; readonly uid: string; readonly purpose: RequestPurpose };

/**
 * The Game API as the Daily Sync uses it: records every request it is asked for, counts it against the Daily Quota,
 * and answers with the prepared result (not-found for anything not prepared).
 */
export class FakeDailySyncGameApi implements DailySyncGameApi {
  readonly requests: SyncRequest[] = [];
  private readonly rosters = new Map<string, LookupResult<Alliance>>();
  private readonly players = new Map<string, LookupResult<Player>>();
  private used = 0;
  private limit = 1000;

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

  getAlliance(kingdom: KingdomNumber, key: AllianceKey, purpose: RequestPurpose): Promise<LookupResult<Alliance>> {
    this.requests.push({ kind: "roster", kingdom: Number(kingdom), tag: String(key), purpose });
    this.used += 1;
    return Promise.resolve(this.rosters.get(`${kingdom.toString()}:${String(key)}`) ?? { kind: "not-found" });
  }

  getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    this.requests.push({ kind: "player", uid: String(uid), purpose });
    this.used += 1;
    return Promise.resolve(this.players.get(String(uid)) ?? { kind: "not-found" });
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
}
