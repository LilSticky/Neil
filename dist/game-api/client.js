import { rankFromRoster } from "../domain/alliance-rank.js";
import { parseKingdom } from "../domain/lookup-input.js";
import { allianceBodySchema, ambiguousBodySchema, playerBodySchema } from "./schemas.js";
/** The tracker takes about 10 s to answer 502 for an unknown uid (research R11). */
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BASE_URL = "https://api.lastasylumtracker.com/v1";
/** The only code that talks to the Game API. Never throws for an API failure; the key is never logged. */
export class GameApiClient {
    apiKey;
    version;
    fetchFn;
    logError;
    timeoutMs;
    baseUrl;
    constructor(options) {
        this.apiKey = options.apiKey;
        this.version = options.version;
        this.fetchFn = options.fetch;
        this.logError = options.logError;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    }
    async getPlayer(uid) {
        const endpoint = "/players/{uid}";
        const response = await this.request(endpoint, `/players/${uid}`);
        if (!(response instanceof Response))
            return response;
        const read = await this.readBody(endpoint, response, playerBodySchema);
        if (!read.ok)
            return read.failure;
        const body = read.body;
        if (body.uid !== uid)
            return this.unexpected(endpoint, "status 200, answer is for another uid");
        const kingdom = parseKingdom(body.kid);
        if (!kingdom.ok)
            return this.unexpected(endpoint, "status 200, kid is not a Kingdom number");
        const profile = {
            uid,
            name: body.nick,
            kingdom: kingdom.value,
            power: body.power,
            sanctuaryLevel: body.lv,
        };
        if (body.aid === null || body.aid === 0) {
            return { kind: "found", value: { ...profile, alliance: undefined, allianceRank: undefined } };
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
                allianceRank: rankFromRoster(uid, roster),
            },
        };
    }
    async getAlliance(kingdom, key) {
        const endpoint = "/alliances/{kingdom}/{key}";
        const response = await this.request(endpoint, `/alliances/${kingdom.toString()}/${encodeURIComponent(key)}`, true);
        if (!(response instanceof Response))
            return response;
        if (response.status === 409) {
            const read = await this.readBody(endpoint, response, ambiguousBodySchema);
            if (!read.ok)
                return read.failure;
            return { kind: "ambiguous", matches: read.body.matches.map(toMatch) };
        }
        const read = await this.readBody(endpoint, response, allianceBodySchema);
        if (!read.ok)
            return read.failure;
        const body = read.body;
        if (body.sid !== kingdom)
            return this.unexpected(endpoint, "status 200, answer is for another Kingdom");
        return {
            kind: "found",
            value: {
                tag: body.abbr,
                name: body.name,
                kingdom,
                power: body.power,
                memberCount: body.member_count,
                capacity: body.capacity,
                leaderName: body.leader_name ?? undefined,
            },
        };
    }
    /**
     * A 200 response, or the failure every endpoint shares. Only the status is read, as error bodies may be plain text.
     * A 409 comes back as a response only when the endpoint can answer with one (`conflictIsAnswer`).
     */
    async request(endpoint, path, conflictIsAnswer = false) {
        let response;
        try {
            response = await this.send(path);
        }
        catch (error) {
            const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
            return this.fail(endpoint, timedOut ? "timeout" : "network", { kind: "try-again" });
        }
        const status = response.status;
        if (status === 200)
            return response;
        if (status === 409 && conflictIsAnswer)
            return response;
        await this.discardBody(response);
        if (status === 404)
            return { kind: "not-found" };
        const detail = `status ${String(status)}`;
        if (status === 429)
            return this.fail(endpoint, detail, { kind: "quota-spent" });
        if (status === 502)
            return this.fail(endpoint, detail, { kind: "not-prepared" });
        if (status === 503 || status === 504)
            return this.fail(endpoint, detail, { kind: "try-again" });
        if (status === 401 || status === 403)
            return this.fail(endpoint, detail, { kind: "unavailable", reason: "auth" });
        return this.unexpected(endpoint, detail);
    }
    /** Parses the body as JSON and checks it against the schema; a failure is logged with the reason. */
    async readBody(endpoint, response, schema) {
        const status = `status ${response.status.toString()}`;
        let raw;
        try {
            raw = JSON.parse(await response.text());
        }
        catch {
            return { ok: false, failure: this.unexpected(endpoint, `${status}, body is not JSON`) };
        }
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
    fail(endpoint, detail, failure) {
        this.logError(`Game API ${endpoint}: ${failure.kind}, ${detail}`);
        return failure;
    }
    send(path) {
        return this.fetchFn(`${this.baseUrl}${path}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "User-Agent": `Neil/${this.version} (+https://github.com/LilSticky/Neil)`,
                Accept: "application/json",
            },
            signal: AbortSignal.timeout(this.timeoutMs),
        });
    }
    unexpected(endpoint, detail) {
        this.logError(`Game API ${endpoint}: unavailable (unexpected), ${detail}`);
        return { kind: "unavailable", reason: "unexpected" };
    }
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