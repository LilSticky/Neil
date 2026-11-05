import { daysToRecord, dailyAllowance, expectedLookupMembers, mayUse, } from "../domain/daily-allowance.js";
import { utcDayOf } from "../domain/daily-quota.js";
/**
 * Keeps each Member within the Daily Allowance: counts the requests a Member's lookups cause, and rolls the usage
 * over at 00:00 UTC. The database is the truth; the rollover guard is kept in memory only.
 */
export class AllowanceKeeper {
    store;
    quota;
    now;
    reserve;
    syncShare;
    rolledOverFor;
    constructor(options) {
        this.store = options.store;
        this.quota = options.quota;
        this.now = options.now;
        this.reserve = options.reserve;
        this.syncShare = options.syncShare;
    }
    /** The Expected Lookup Members of today. */
    expected() {
        const today = this.rollOver();
        return expectedLookupMembers(this.store.records(), today);
    }
    /** The Daily Allowance of today: how many requests one Member's lookups may cause. */
    allowance() {
        const today = this.rollOver();
        return this.allowanceOn(today);
    }
    /** How many requests the Member's lookups caused today. */
    usageOf(memberId) {
        const today = this.rollOver();
        return this.store.requestsOf(memberId, today);
    }
    /** Whether the caller's next lookup may cause a request: an Officer always may, a Member below the allowance. */
    mayCharge(caller) {
        const today = this.rollOver();
        const used = this.store.requestsOf(caller.memberId, today);
        return mayUse(used, this.allowanceOn(today), caller.officer);
    }
    /** Counts one request against the caller's usage today. Call only when mayCharge is true. */
    charge(caller) {
        const today = this.rollOver();
        this.store.countRequest(caller.memberId, today);
    }
    /** The n Members with the most requests today, most first, ties by Member id. */
    top(n) {
        const today = this.rollOver();
        return this.store.usageOn(today).slice(0, n);
    }
    allowanceOn(today) {
        return dailyAllowance({
            limit: this.quota.today().limit,
            reserve: this.reserve,
            syncShare: this.syncShare,
            expected: expectedLookupMembers(this.store.records(), today),
        });
    }
    /** Records the finished days and drops old usage, once per UTC day; returns today. */
    rollOver() {
        const today = utcDayOf(this.now());
        if (this.rolledOverFor === today)
            return today;
        const records = this.store.records();
        const lastRecorded = records[records.length - 1]?.day;
        const days = daysToRecord(lastRecorded, this.store.firstUsageDay(), today);
        this.store.rollover(days, today);
        this.rolledOverFor = today;
        return today;
    }
}
//# sourceMappingURL=allowance-keeper.js.map