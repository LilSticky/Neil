import { rankFromLabel, rankFromRoster } from "../domain/alliance-rank.js";
import { nextReset } from "../domain/daily-quota.js";
import { parseKingdom, parseUid, } from "../domain/lookup-input.js";
import { MAX_ATTEMPTS, retryDelay } from "../domain/retry.js";
import { InFlight, LookupCache } from "./lookup-cache.js";
import { allianceBodySchema, ambiguousBodySchema, playerBodySchema, quotaFiguresFrom, } from "./schemas.js";
/** The tracker takes about 10 s to answer 502 for an unknown uid (research R11). */
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BASE_URL = "https://api.lastasylumtracker.com/v1";
/** All attempts of one lookup, retries included, end by this deadline (research R6). */
const LOOKUP_DEADLINE_MS = 20_000;
/** A retry is only made when at least this much of the deadline is left after its pause (research R6). */
const MIN_TIME_FOR_RETRY_MS = 2_000;
/** The only code that talks to the Game API. Never throws for an API failure; the key is never logged. */
export class GameApiClient {
    apiKey;
    version;
    fetchFn;
    now;
    quota;
    sleep;
    random;
    logError;
    timeoutMs;
    baseUrl;
    players;
    alliances;
    playerNames;
    allianceNames;
    playerLookups = new InFlight();
    playerNameLookups = new InFlight();
    allianceLookups = new InFlight();
    allianceNameLookups = new InFlight();
    constructor(options) {
        this.apiKey = options.apiKey;
        this.version = options.version;
        this.fetchFn = options.fetch;
        this.now = options.now;
        this.quota = options.quota;
        this.sleep = options.sleep;
        this.random = options.random;
        this.logError = options.logError;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
        this.players = new LookupCache({ ttlMs: options.cacheTtlMs });
        this.playerNames = new LookupCache({ ttlMs: options.cacheTtlMs });
        this.alliances = new LookupCache({ ttlMs: options.cacheTtlMs });
        this.allianceNames = new LookupCache({ ttlMs: options.cacheTtlMs });
    }
    /** Today's Daily Quota as counted so far. Makes no request. */
    quotaToday() {
        return this.quota.today();
    }
    /**
     * A fresh cached answer, else one shared request; only a found answer is cached. The purpose decides whether the
     * request may use the Quota Reserve.
     */
    async getPlayer(uid, purpose) {
        const key = `player:${uid}`;
        const fresh = this.players.get(key, this.now());
        if (fresh !== undefined)
            return { kind: "found", value: fresh.value, fetchedAt: fresh.fetchedAt };
        return this.playerLookups.share(flightKey(purpose, key), async () => {
            const result = await this.fetchPlayer(uid, purpose);
            if (result.kind === "found")
                this.players.store(key, result.value, result.fetchedAt);
            return orStale(result, foundBy(this.players.getStale(key)));
        });
    }
    /**
     * A fresh cached answer, else one shared request; a found Player and a match list are cached, a failure is not.
     * The name is compared in lower case, and the Kingdom (or all Kingdoms) is part of the key. The purpose decides
     * whether the request may use the Quota Reserve.
     */
    async findPlayer(name, kingdom, purpose) {
        const key = `player-name:${kingdom === undefined ? "*" : kingdom.toString()}:${name.toLowerCase()}`;
        return this.byName(this.playerNames, this.playerNameLookups, key, purpose, () => this.fetchPlayerByName(name, kingdom, purpose));
    }
    /**
     * A fresh cached answer, else one shared request; a found Alliance and a match list are cached, a failure is not.
     * The full name is compared in lower case. The purpose decides whether the request may use the Quota Reserve.
     */
    async findAlliance(name, purpose) {
        return this.byName(this.allianceNames, this.allianceNameLookups, `alliance-name:${name.toLowerCase()}`, purpose, () => this.fetchAllianceByName(name, purpose));
    }
    /**
     * The name lookups' cache flow: a fresh answer from the cache, else one request shared by concurrent callers with
     * the same purpose. A found answer and a match list are cached; a failure is not. A spent or reserved quota answers
     * with a stale entry.
     */
    async byName(cache, inFlight, key, purpose, fetch) {
        const fresh = cache.get(key, this.now());
        if (fresh !== undefined)
            return answerOf(fresh);
        return inFlight.share(flightKey(purpose, key), async () => {
            const result = await fetch();
            if (result.kind === "found") {
                cache.store(key, { kind: "found", value: result.value }, result.fetchedAt);
            }
            else if (result.kind === "ambiguous") {
                cache.store(key, { kind: "ambiguous", matches: result.matches }, this.now());
            }
            const stale = cache.getStale(key);
            return orStale(result, stale === undefined ? undefined : answerOf(stale));
        });
    }
    /**
     * A fresh cached answer, else one shared request; only a found answer is cached. Tags are compared in lower case.
     * The purpose decides whether the request may use the Quota Reserve.
     */
    async getAlliance(kingdom, key, purpose) {
        const cacheKey = `alliance:${kingdom.toString()}:${key.toLowerCase()}`;
        const fresh = this.alliances.get(cacheKey, this.now());
        if (fresh !== undefined)
            return { kind: "found", value: fresh.value, fetchedAt: fresh.fetchedAt };
        return this.allianceLookups.share(flightKey(purpose, cacheKey), async () => {
            const result = await this.fetchAlliance(kingdom, key, purpose);
            if (result.kind === "found")
                this.alliances.store(cacheKey, result.value, result.fetchedAt);
            return orStale(result, foundBy(this.alliances.getStale(cacheKey)));
        });
    }
    async fetchPlayer(uid, purpose) {
        const endpoint = "/players/{uid}";
        const reply = await this.request({ endpoint, path: `/players/${uid}`, purpose, conflictIsAnswer: false });
        if (reply.kind !== "reply")
            return reply;
        const read = await this.readBody(endpoint, reply, playerBodySchema);
        if (!read.ok)
            return read.failure;
        const fetchedAt = this.now();
        if (read.body.uid !== uid)
            return this.unexpected(endpoint, "status 200, answer is for another uid");
        return this.playerFrom(endpoint, read.body, fetchedAt);
    }
    /**
     * GET /players/name/{name}, or /players/{kingdom}/{name} with a Kingdom. A 409 is the matches; a 200 is a Player.
     * The name is percent-encoded into the path.
     */
    async fetchPlayerByName(name, kingdom, purpose) {
        const endpoint = kingdom === undefined ? "/players/name/{name}" : "/players/{kingdom}/{name}";
        const segments = kingdom === undefined ? "name" : kingdom.toString();
        const reply = await this.request({
            endpoint,
            path: `/players/${segments}/${encodeURIComponent(name)}`,
            purpose,
            conflictIsAnswer: true,
        });
        if (reply.kind !== "reply")
            return reply;
        if (reply.response.status === 409) {
            const read = await this.readBody(endpoint, reply, ambiguousBodySchema);
            if (!read.ok)
                return read.failure;
            return { kind: "ambiguous", matches: read.body.matches.map(toMatch) };
        }
        const read = await this.readBody(endpoint, reply, playerBodySchema);
        if (!read.ok)
            return read.failure;
        return this.playerFrom(endpoint, read.body, this.now());
    }
    /** The Player a 200 body describes, or the unexpected failure when the body does not describe one. */
    playerFrom(endpoint, body, fetchedAt) {
        const uid = parseUid(body.uid);
        if (!uid.ok)
            return this.unexpected(endpoint, "status 200, uid is not a uid");
        const kingdom = parseKingdom(body.kid);
        if (!kingdom.ok)
            return this.unexpected(endpoint, "status 200, kid is not a Kingdom number");
        const profile = {
            uid: uid.value,
            name: body.nick,
            kingdom: kingdom.value,
            power: body.power,
            sanctuaryLevel: body.lv,
        };
        if (body.aid === null || body.aid === 0) {
            return { kind: "found", value: { ...profile, alliance: undefined, allianceRank: undefined }, fetchedAt };
        }
        if (typeof body.alliance_abbr !== "string" || typeof body.alliance_name !== "string") {
            return this.unexpected(endpoint, "status 200, Alliance without tag or name");
        }
        const roster = (body.alliance_members ?? []).map((row) => ({ uid: row.uid, rankLabel: row.rank_label }));
        return {
            kind: "found",
            value: {
                ...profile,
                alliance: { tag: body.alliance_abbr, name: body.alliance_name },
                allianceRank: rankFromRoster(uid.value, roster),
            },
            fetchedAt,
        };
    }
    /** GET /alliances/{kingdom}/{key}: the Alliance of a Kingdom and tag. */
    async fetchAlliance(kingdom, key, purpose) {
        return this.requestAlliance("/alliances/{kingdom}/{key}", `/alliances/${kingdom.toString()}/${encodeURIComponent(key)}`, purpose, kingdom);
    }
    /** GET /alliances/name/{name}: the Alliance with a full name, in whichever Kingdom it is. */
    async fetchAllianceByName(name, purpose) {
        return this.requestAlliance("/alliances/name/{name}", `/alliances/name/${encodeURIComponent(name)}`, purpose, undefined);
    }
    /**
     * One Alliance request. A 409 is the matches; a 200 is an Alliance, which must be in the `expected` Kingdom when one
     * is given (a Kingdom and tag lookup); otherwise the Kingdom is the one the body names.
     */
    async requestAlliance(endpoint, path, purpose, expected) {
        const reply = await this.request({ endpoint, path, purpose, conflictIsAnswer: true });
        if (reply.kind !== "reply")
            return reply;
        if (reply.response.status === 409) {
            const read = await this.readBody(endpoint, reply, ambiguousBodySchema);
            if (!read.ok)
                return read.failure;
            return { kind: "ambiguous", matches: read.body.matches.map(toMatch) };
        }
        const read = await this.readBody(endpoint, reply, allianceBodySchema);
        if (!read.ok)
            return read.failure;
        const fetchedAt = this.now();
        const kingdom = parseKingdom(read.body.sid);
        if (!kingdom.ok)
            return this.unexpected(endpoint, "status 200, sid is not a Kingdom number");
        if (expected !== undefined && kingdom.value !== expected) {
            return this.unexpected(endpoint, "status 200, answer is for another Kingdom");
        }
        return { kind: "found", value: allianceFrom(read.body, kingdom.value), fetchedAt };
    }
    /**
     * A 200 response, or the failure every endpoint shares. Only the status is read, as error bodies may be plain text.
     * A 409 comes back as a response only when the endpoint can answer with one (`conflictIsAnswer`).
     * A 503 or 504 is retried with a pause while the Daily Quota, MAX_ATTEMPTS and the lookup deadline allow.
     * Only the outcome of the whole lookup is logged.
     */
    async request(call) {
        const deadline = this.now().getTime() + LOOKUP_DEADLINE_MS;
        for (let attempt = 1;; attempt += 1) {
            const outcome = await this.attempt(call, deadline);
            if (outcome.kind !== "transient")
                return outcome;
            const pause = retryDelay(attempt, this.random());
            if (!this.mayRetry(attempt, pause, deadline, call.purpose)) {
                return this.fail(call.endpoint, outcome.detail, { kind: "try-again" });
            }
            await this.sleep(pause);
        }
    }
    /**
     * Whether another attempt may follow the pause: attempts left, a request for the purpose may still be sent today,
     * and enough of the deadline.
     */
    mayRetry(attempt, pause, deadline, purpose) {
        const leftAfterPause = deadline - (this.now().getTime() + pause);
        return attempt < MAX_ATTEMPTS && this.quota.mayCount(purpose) && leftAfterPause >= MIN_TIME_FOR_RETRY_MS;
    }
    /** One attempt, counted against the Daily Quota and settled once. A transient failure is returned unlogged. */
    async attempt(call, deadline) {
        const { endpoint, path, purpose, conflictIsAnswer } = call;
        // A pause may have used up the deadline; then the lookup ends here, before anything is counted or sent.
        if (this.now().getTime() >= deadline) {
            return this.fail(endpoint, "lookup deadline passed", { kind: "try-again" });
        }
        const counted = this.quota.tryCount(purpose);
        if (!counted.ok) {
            const resetsAt = nextReset(this.now());
            return counted.reason === "spent" ? { kind: "quota-spent", resetsAt } : { kind: "reserve-kept", resetsAt };
        }
        const day = counted.day;
        // A pause that ran long can leave no time; a timeout of 0 then gives up at once rather than throwing.
        const timeoutMs = Math.max(0, Math.min(this.timeoutMs, deadline - this.now().getTime()));
        let response;
        try {
            response = await this.send(path, timeoutMs);
        }
        catch (error) {
            this.quota.settle(day, undefined);
            const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
            return this.fail(endpoint, timedOut ? "timeout" : "network", { kind: "try-again" });
        }
        const status = response.status;
        // An answer's body may carry the Daily Quota figures, so readBody settles it after reading the body.
        if (status === 200)
            return { kind: "reply", response, day };
        if (status === 409 && conflictIsAnswer)
            return { kind: "reply", response, day };
        await this.discardBody(response);
        const detail = `status ${String(status)}`;
        if (status === 429) {
            this.quota.limitReached(day);
            return this.fail(endpoint, detail, { kind: "quota-spent", resetsAt: nextReset(this.now()) });
        }
        this.settleFigures(endpoint, day, undefined, response.headers);
        if (status === 404)
            return { kind: "not-found" };
        if (status === 502)
            return this.fail(endpoint, detail, { kind: "not-prepared" });
        if (status === 503 || status === 504)
            return { kind: "transient", detail };
        if (status === 401 || status === 403)
            return this.fail(endpoint, detail, { kind: "unavailable", reason: "auth" });
        return this.unexpected(endpoint, detail);
    }
    /** Parses the body as JSON and checks it against the schema; a failure is logged with the reason. Settles the request. */
    async readBody(endpoint, reply, schema) {
        const { response, day } = reply;
        const status = `status ${response.status.toString()}`;
        let raw;
        try {
            raw = JSON.parse(await response.text());
        }
        catch {
            this.settleFigures(endpoint, day, undefined, response.headers);
            return { ok: false, failure: this.unexpected(endpoint, `${status}, body is not JSON`) };
        }
        this.settleFigures(endpoint, day, raw, response.headers);
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
            const paths = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
            return { ok: false, failure: this.unexpected(endpoint, `${status}, invalid body at ${paths}`) };
        }
        return { ok: true, body: parsed.data };
    }
    /** Cancels a body that will not be read, so its connection is released. Never throws. */
    async discardBody(response) {
        try {
            await response.body?.cancel();
        }
        catch {
            // The connection is released or closed either way; nothing to report.
        }
    }
    /** Ends the request in flight, adopting the Daily Quota figures from the body or headers when they can be read. */
    settleFigures(endpoint, day, body, headers) {
        const figures = quotaFiguresFrom(body, headers);
        if (figures === "malformed") {
            this.logError(`Game API ${endpoint}: quota figures unreadable`);
            this.quota.settle(day, undefined);
            return;
        }
        this.quota.settle(day, figures);
    }
    fail(endpoint, detail, failure) {
        this.logError(`Game API ${endpoint}: ${failure.kind}, ${detail}`);
        return failure;
    }
    send(path, timeoutMs) {
        return this.fetchFn(`${this.baseUrl}${path}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "User-Agent": `Neil/${this.version} (+https://github.com/LilSticky/Neil)`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
    }
    unexpected(endpoint, detail) {
        this.logError(`Game API ${endpoint}: unavailable (unexpected), ${detail}`);
        return { kind: "unavailable", reason: "unexpected" };
    }
}
/**
 * A spent Daily Quota, or one kept back by the Quota Reserve, answers with the cached answer, however old, when
 * there is one.
 */
function orStale(result, stale) {
    if ((result.kind !== "quota-spent" && result.kind !== "reserve-kept") || stale === undefined)
        return result;
    return stale;
}
/**
 * The key one request is shared under while it is in flight. The purpose is part of it: an Onboarding Interview never
 * joins a lookup's request, which may have been refused at the Quota Reserve. The cache is shared by every purpose.
 */
function flightKey(purpose, key) {
    return `${purpose}:${key}`;
}
/** A cached Player as a found answer. */
function foundBy(entry) {
    return entry === undefined ? undefined : { kind: "found", value: entry.value, fetchedAt: entry.fetchedAt };
}
/** A cached Player Name answer as the lookup result it stood for. */
function answerOf(entry) {
    const { value, fetchedAt } = entry;
    return value.kind === "found" ? { kind: "found", value: value.value, fetchedAt } : value;
}
/** An Alliance from a 200 body, in the Kingdom the body names. */
function allianceFrom(body, kingdom) {
    return {
        tag: body.abbr,
        name: body.name,
        kingdom,
        power: body.power,
        memberCount: body.member_count,
        capacity: body.capacity,
        leaderName: body.leader_name ?? undefined,
        roster: body.members.flatMap(rosterEntryFrom),
    };
}
/** One roster row as an entry: a row without a readable uid is left out; a missing name reads Unknown. */
function rosterEntryFrom(member) {
    const uid = parseUid(member.uid);
    if (!uid.ok)
        return [];
    const name = member.nick_name ?? "";
    return [
        { uid: uid.value, name: name === "" ? "Unknown" : name, allianceRank: rankFromLabel(member.rank_label ?? null) },
    ];
}
/** Maps one candidate of a 409, leaving out the fields the Game did not give (exactOptionalPropertyTypes). */
function toMatch(raw) {
    return {
        ...(raw.tag === undefined ? {} : { tag: raw.tag }),
        ...(raw.name === undefined ? {} : { name: raw.name }),
        ...(raw.server === undefined ? {} : { kingdom: raw.server }),
        ...(raw.uid === undefined ? {} : { uid: raw.uid }),
    };
}
//# sourceMappingURL=client.js.map