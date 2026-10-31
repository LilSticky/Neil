import type { z } from "zod";
import { rankFromLabel, rankFromRoster } from "../domain/alliance-rank.js";
import { nextReset, type DailyQuota, type RequestPurpose, type UtcDay } from "../domain/daily-quota.js";
import {
  parseKingdom,
  parseUid,
  type AllianceKey,
  type KingdomNumber,
  type PlayerName,
  type Uid,
} from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player, RosterEntry } from "../domain/player.js";
import { MAX_ATTEMPTS, retryDelay } from "../domain/retry.js";
import type { QuotaKeeper } from "./quota-keeper.js";
import { InFlight, LookupCache, type CacheEntry } from "./lookup-cache.js";
import {
  allianceBodySchema,
  ambiguousBodySchema,
  playerBodySchema,
  quotaFiguresFrom,
  type AllianceBody,
  type AmbiguousBody,
  type PlayerBody,
  type RosterMemberBody,
} from "./schemas.js";

/** The part of the global fetch the client uses; tests pass a fake. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GameApiClientOptions {
  readonly apiKey: string;
  readonly version: string;
  readonly fetch: FetchLike;
  readonly now: () => Date;
  /** Counts every request against the Daily Quota and answers quota-spent when it is used up. */
  readonly quota: QuotaKeeper;
  /** Waits between attempts; tests pass a fake that does not wait. */
  readonly sleep: (ms: number) => Promise<void>;
  /** A random number in [0, 1) for the jitter of a retry pause. */
  readonly random: () => number;
  readonly logError: (line: string) => void;
  /** How long a found answer stays fresh; from GAME_API_CACHE_MINUTES. */
  readonly cacheTtlMs: number;
  readonly timeoutMs?: number;
  readonly baseUrl?: string;
}

/** The tracker takes about 10 s to answer 502 for an unknown uid (research R11). */
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_BASE_URL = "https://api.lastasylumtracker.com/v1";
/** All attempts of one lookup, retries included, end by this deadline (research R6). */
const LOOKUP_DEADLINE_MS = 20_000;
/** A retry is only made when at least this much of the deadline is left after its pause (research R6). */
const MIN_TIME_FOR_RETRY_MS = 2_000;

interface Unexpected {
  readonly kind: "unavailable";
  readonly reason: "unexpected";
}

/** Every lookup result except a found value. */
type Failure = Exclude<LookupResult<never>, { readonly kind: "found" }>;

/** A 503 or 504: retried while the lookup allows; if the lookup ends on it, `detail` goes into the one log line. */
interface Transient {
  readonly kind: "transient";
  readonly detail: string;
}

/** A response to read, and the UTC day its request was counted on, which settles that count. */
interface Reply {
  readonly kind: "reply";
  readonly response: Response;
  readonly day: UtcDay;
}

/** One Game API call of a lookup: where it goes, what it is for, and whether a 409 is an answer to read. */
interface Call {
  readonly endpoint: string;
  readonly path: string;
  readonly purpose: RequestPurpose;
  readonly conflictIsAnswer: boolean;
}

/** A name answer as cached (Player or Alliance): the found value, or the matches when the name is ambiguous. */
type NameAnswer<T> = { readonly kind: "found"; readonly value: T } | { readonly kind: "ambiguous"; readonly matches: readonly Match[] };

/** A body that passed its schema, or the unexpected failure that was already logged. */
type ReadBody<T> = { readonly ok: true; readonly body: T } | { readonly ok: false; readonly failure: Unexpected };

/** The only code that talks to the Game API. Never throws for an API failure; the key is never logged. */
export class GameApiClient {
  private readonly apiKey: string;
  private readonly version: string;
  private readonly fetchFn: FetchLike;
  private readonly now: () => Date;
  private readonly quota: QuotaKeeper;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;
  private readonly logError: (line: string) => void;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly players: LookupCache<Player>;
  private readonly alliances: LookupCache<Alliance>;
  private readonly playerNames: LookupCache<NameAnswer<Player>>;
  private readonly allianceNames: LookupCache<NameAnswer<Alliance>>;
  private readonly playerLookups = new InFlight<LookupResult<Player>>();
  private readonly playerNameLookups = new InFlight<LookupResult<Player>>();
  private readonly allianceLookups = new InFlight<LookupResult<Alliance>>();
  private readonly allianceNameLookups = new InFlight<LookupResult<Alliance>>();

  constructor(options: GameApiClientOptions) {
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
    this.players = new LookupCache<Player>({ ttlMs: options.cacheTtlMs });
    this.playerNames = new LookupCache<NameAnswer<Player>>({ ttlMs: options.cacheTtlMs });
    this.alliances = new LookupCache<Alliance>({ ttlMs: options.cacheTtlMs });
    this.allianceNames = new LookupCache<NameAnswer<Alliance>>({ ttlMs: options.cacheTtlMs });
  }

  /** Today's Daily Quota as counted so far. Makes no request. */
  quotaToday(): DailyQuota {
    return this.quota.today();
  }

  /**
   * A fresh cached answer, else one shared request; only a found answer is cached. The purpose decides whether the
   * request may use the Quota Reserve.
   */
  async getPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    const key = `player:${uid}`;
    const fresh = this.players.get(key, this.now());
    if (fresh !== undefined) return { kind: "found", value: fresh.value, fetchedAt: fresh.fetchedAt };

    return this.playerLookups.share(flightKey(purpose, key), async () => {
      const result = await this.fetchPlayer(uid, purpose);
      if (result.kind === "found") this.players.store(key, result.value, result.fetchedAt);
      return orStale(result, foundBy(this.players.getStale(key)));
    });
  }

  /**
   * A fresh cached answer, else one shared request; a found Player and a match list are cached, a failure is not.
   * The name is compared in lower case, and the Kingdom (or all Kingdoms) is part of the key. The purpose decides
   * whether the request may use the Quota Reserve.
   */
  async findPlayer(
    name: PlayerName,
    kingdom: KingdomNumber | undefined,
    purpose: RequestPurpose,
  ): Promise<LookupResult<Player>> {
    const key = `player-name:${kingdom === undefined ? "*" : kingdom.toString()}:${name.toLowerCase()}`;
    return this.byName(this.playerNames, this.playerNameLookups, key, purpose, () =>
      this.fetchPlayerByName(name, kingdom, purpose),
    );
  }

  /**
   * A fresh cached answer, else one shared request; a found Alliance and a match list are cached, a failure is not.
   * The full name is compared in lower case. The purpose decides whether the request may use the Quota Reserve.
   */
  async findAlliance(name: AllianceKey, purpose: RequestPurpose): Promise<LookupResult<Alliance>> {
    return this.byName(
      this.allianceNames,
      this.allianceNameLookups,
      `alliance-name:${name.toLowerCase()}`,
      purpose,
      () => this.fetchAllianceByName(name, purpose),
    );
  }

  /**
   * The name lookups' cache flow: a fresh answer from the cache, else one request shared by concurrent callers with
   * the same purpose. A found answer and a match list are cached; a failure is not. A spent or reserved quota answers
   * with a stale entry.
   */
  private async byName<T>(
    cache: LookupCache<NameAnswer<T>>,
    inFlight: InFlight<LookupResult<T>>,
    key: string,
    purpose: RequestPurpose,
    fetch: () => Promise<LookupResult<T>>,
  ): Promise<LookupResult<T>> {
    const fresh = cache.get(key, this.now());
    if (fresh !== undefined) return answerOf(fresh);

    return inFlight.share(flightKey(purpose, key), async () => {
      const result = await fetch();
      if (result.kind === "found") {
        cache.store(key, { kind: "found", value: result.value }, result.fetchedAt);
      } else if (result.kind === "ambiguous") {
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
  async getAlliance(kingdom: KingdomNumber, key: AllianceKey, purpose: RequestPurpose): Promise<LookupResult<Alliance>> {
    const cacheKey = `alliance:${kingdom.toString()}:${key.toLowerCase()}`;
    const fresh = this.alliances.get(cacheKey, this.now());
    if (fresh !== undefined) return { kind: "found", value: fresh.value, fetchedAt: fresh.fetchedAt };

    return this.allianceLookups.share(flightKey(purpose, cacheKey), async () => {
      const result = await this.fetchAlliance(kingdom, key, purpose);
      if (result.kind === "found") this.alliances.store(cacheKey, result.value, result.fetchedAt);
      return orStale(result, foundBy(this.alliances.getStale(cacheKey)));
    });
  }

  private async fetchPlayer(uid: Uid, purpose: RequestPurpose): Promise<LookupResult<Player>> {
    const endpoint = "/players/{uid}";

    const reply = await this.request({ endpoint, path: `/players/${uid}`, purpose, conflictIsAnswer: false });
    if (reply.kind !== "reply") return reply;

    const read = await this.readBody(endpoint, reply, playerBodySchema);
    if (!read.ok) return read.failure;
    const fetchedAt = this.now();

    if (read.body.uid !== uid) return this.unexpected(endpoint, "status 200, answer is for another uid");
    return this.playerFrom(endpoint, read.body, fetchedAt);
  }

  /**
   * GET /players/name/{name}, or /players/{kingdom}/{name} with a Kingdom. A 409 is the matches; a 200 is a Player.
   * The name is percent-encoded into the path.
   */
  private async fetchPlayerByName(
    name: PlayerName,
    kingdom: KingdomNumber | undefined,
    purpose: RequestPurpose,
  ): Promise<LookupResult<Player>> {
    const endpoint = kingdom === undefined ? "/players/name/{name}" : "/players/{kingdom}/{name}";
    const segments = kingdom === undefined ? "name" : kingdom.toString();

    const reply = await this.request({
      endpoint,
      path: `/players/${segments}/${encodeURIComponent(name)}`,
      purpose,
      conflictIsAnswer: true,
    });
    if (reply.kind !== "reply") return reply;

    if (reply.response.status === 409) {
      const read = await this.readBody(endpoint, reply, ambiguousBodySchema);
      if (!read.ok) return read.failure;
      return { kind: "ambiguous", matches: read.body.matches.map(toMatch) };
    }

    const read = await this.readBody(endpoint, reply, playerBodySchema);
    if (!read.ok) return read.failure;
    return this.playerFrom(endpoint, read.body, this.now());
  }

  /** The Player a 200 body describes, or the unexpected failure when the body does not describe one. */
  private playerFrom(endpoint: string, body: PlayerBody, fetchedAt: Date): LookupResult<Player> {
    const uid = parseUid(body.uid);
    if (!uid.ok) return this.unexpected(endpoint, "status 200, uid is not a uid");

    const kingdom = parseKingdom(body.kid);
    if (!kingdom.ok) return this.unexpected(endpoint, "status 200, kid is not a Kingdom number");

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
        alliance: { tag: body.alliance_abbr, name: body.alliance_name, leaderUid: leaderUidFrom(body.alliance) },
        allianceRank: rankFromRoster(uid.value, roster),
      },
      fetchedAt,
    };
  }

  /** GET /alliances/{kingdom}/{key}: the Alliance of a Kingdom and tag. */
  private async fetchAlliance(
    kingdom: KingdomNumber,
    key: AllianceKey,
    purpose: RequestPurpose,
  ): Promise<LookupResult<Alliance>> {
    return this.requestAlliance(
      "/alliances/{kingdom}/{key}",
      `/alliances/${kingdom.toString()}/${encodeURIComponent(key)}`,
      purpose,
      kingdom,
    );
  }

  /** GET /alliances/name/{name}: the Alliance with a full name, in whichever Kingdom it is. */
  private async fetchAllianceByName(name: AllianceKey, purpose: RequestPurpose): Promise<LookupResult<Alliance>> {
    return this.requestAlliance(
      "/alliances/name/{name}",
      `/alliances/name/${encodeURIComponent(name)}`,
      purpose,
      undefined,
    );
  }

  /**
   * One Alliance request. A 409 is the matches; a 200 is an Alliance, which must be in the `expected` Kingdom when one
   * is given (a Kingdom and tag lookup); otherwise the Kingdom is the one the body names.
   */
  private async requestAlliance(
    endpoint: string,
    path: string,
    purpose: RequestPurpose,
    expected: KingdomNumber | undefined,
  ): Promise<LookupResult<Alliance>> {
    const reply = await this.request({ endpoint, path, purpose, conflictIsAnswer: true });
    if (reply.kind !== "reply") return reply;

    if (reply.response.status === 409) {
      const read = await this.readBody(endpoint, reply, ambiguousBodySchema);
      if (!read.ok) return read.failure;
      return { kind: "ambiguous", matches: read.body.matches.map(toMatch) };
    }

    const read = await this.readBody(endpoint, reply, allianceBodySchema);
    if (!read.ok) return read.failure;
    const fetchedAt = this.now();

    const kingdom = parseKingdom(read.body.sid);
    if (!kingdom.ok) return this.unexpected(endpoint, "status 200, sid is not a Kingdom number");
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
  private async request(call: Call): Promise<Reply | Failure> {
    const deadline = this.now().getTime() + LOOKUP_DEADLINE_MS;
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.attempt(call, deadline);
      if (outcome.kind !== "transient") return outcome;

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
  private mayRetry(attempt: number, pause: number, deadline: number, purpose: RequestPurpose): boolean {
    const leftAfterPause = deadline - (this.now().getTime() + pause);
    return attempt < MAX_ATTEMPTS && this.quota.mayCount(purpose) && leftAfterPause >= MIN_TIME_FOR_RETRY_MS;
  }

  /** One attempt, counted against the Daily Quota and settled once. A transient failure is returned unlogged. */
  private async attempt(call: Call, deadline: number): Promise<Reply | Failure | Transient> {
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
    let response: Response;
    try {
      response = await this.send(path, timeoutMs);
    } catch (error) {
      this.quota.settle(day, undefined);
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return this.fail(endpoint, timedOut ? "timeout" : "network", { kind: "try-again" });
    }
    const status = response.status;
    // An answer's body may carry the Daily Quota figures, so readBody settles it after reading the body.
    if (status === 200) return { kind: "reply", response, day };
    if (status === 409 && conflictIsAnswer) return { kind: "reply", response, day };
    await this.discardBody(response);
    const detail = `status ${String(status)}`;
    if (status === 429) {
      this.quota.limitReached(day);
      return this.fail(endpoint, detail, { kind: "quota-spent", resetsAt: nextReset(this.now()) });
    }
    this.settleFigures(endpoint, day, undefined, response.headers);
    if (status === 404) return { kind: "not-found" };
    if (status === 502) return this.fail(endpoint, detail, { kind: "not-prepared" });
    if (status === 503 || status === 504) return { kind: "transient", detail };
    if (status === 401 || status === 403) return this.fail(endpoint, detail, { kind: "unavailable", reason: "auth" });
    return this.unexpected(endpoint, detail);
  }

  /** Parses the body as JSON and checks it against the schema; a failure is logged with the reason. Settles the request. */
  private async readBody<T>(endpoint: string, reply: Reply, schema: z.ZodType<T>): Promise<ReadBody<T>> {
    const { response, day } = reply;
    const status = `status ${response.status.toString()}`;

    let raw: unknown;
    try {
      raw = JSON.parse(await response.text());
    } catch {
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
  private async discardBody(response: Response): Promise<void> {
    try {
      await response.body?.cancel();
    } catch {
      // The connection is released or closed either way; nothing to report.
    }
  }

  /** Ends the request in flight, adopting the Daily Quota figures from the body or headers when they can be read. */
  private settleFigures(endpoint: string, day: UtcDay, body: unknown, headers: Headers): void {
    const figures = quotaFiguresFrom(body, headers);
    if (figures === "malformed") {
      this.logError(`Game API ${endpoint}: quota figures unreadable`);
      this.quota.settle(day, undefined);
      return;
    }
    this.quota.settle(day, figures);
  }

  private fail(endpoint: string, detail: string, failure: Failure): Failure {
    this.logError(`Game API ${endpoint}: ${failure.kind}, ${detail}`);
    return failure;
  }

  private send(path: string, timeoutMs: number): Promise<Response> {
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

  private unexpected(endpoint: string, detail: string): Unexpected {
    this.logError(`Game API ${endpoint}: unavailable (unexpected), ${detail}`);
    return { kind: "unavailable", reason: "unexpected" };
  }
}

/**
 * A spent Daily Quota, or one kept back by the Quota Reserve, answers with the cached answer, however old, when
 * there is one.
 */
function orStale<T>(result: LookupResult<T>, stale: LookupResult<T> | undefined): LookupResult<T> {
  if ((result.kind !== "quota-spent" && result.kind !== "reserve-kept") || stale === undefined) return result;
  return stale;
}

/**
 * The key one request is shared under while it is in flight. The purpose is part of it: an Onboarding Interview never
 * joins a lookup's request, which may have been refused at the Quota Reserve. The cache is shared by every purpose.
 */
function flightKey(purpose: RequestPurpose, key: string): string {
  return `${purpose}:${key}`;
}

/** A cached Player as a found answer. */
function foundBy<T>(entry: CacheEntry<T> | undefined): LookupResult<T> | undefined {
  return entry === undefined ? undefined : { kind: "found", value: entry.value, fetchedAt: entry.fetchedAt };
}

/** A cached Player Name answer as the lookup result it stood for. */
function answerOf<T>(entry: CacheEntry<NameAnswer<T>>): LookupResult<T> {
  const { value, fetchedAt } = entry;
  return value.kind === "found" ? { kind: "found", value: value.value, fetchedAt } : value;
}

/** The uid of an Alliance's leader; undefined when the body gives none or it is not a readable uid. */
function leaderUidFrom(alliance: PlayerBody["alliance"]): Uid | undefined {
  const leaderId = alliance?.leader_id;
  if (leaderId === undefined) return undefined;
  const uid = parseUid(leaderId);
  return uid.ok ? uid.value : undefined;
}

/** An Alliance from a 200 body, in the Kingdom the body names. */
function allianceFrom(body: AllianceBody, kingdom: KingdomNumber): Alliance {
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
function rosterEntryFrom(member: RosterMemberBody): RosterEntry[] {
  const uid = parseUid(member.uid);
  if (!uid.ok) return [];
  const name = member.nick_name ?? "";
  return [
    { uid: uid.value, name: name === "" ? "Unknown" : name, allianceRank: rankFromLabel(member.rank_label ?? null) },
  ];
}

/** Maps one candidate of a 409, leaving out the fields the Game did not give (exactOptionalPropertyTypes). */
function toMatch(raw: AmbiguousBody["matches"][number]): Match {
  return {
    ...(raw.tag === undefined ? {} : { tag: raw.tag }),
    ...(raw.name === undefined ? {} : { name: raw.name }),
    ...(raw.server === undefined ? {} : { kingdom: raw.server }),
    ...(raw.uid === undefined ? {} : { uid: raw.uid }),
  };
}
