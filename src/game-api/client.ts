import type { z } from "zod";
import { rankFromRoster } from "../domain/alliance-rank.js";
import { parseKingdom, type AllianceKey, type KingdomNumber, type Uid } from "../domain/lookup-input.js";
import type { Alliance, LookupResult, Match, Player } from "../domain/player.js";
import { allianceBodySchema, ambiguousBodySchema, playerBodySchema, type AmbiguousBody } from "./schemas.js";

/** The part of the global fetch the client uses; tests pass a fake. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GameApiClientOptions {
  readonly apiKey: string;
  readonly version: string;
  readonly fetch: FetchLike;
  readonly logError: (line: string) => void;
  readonly timeoutMs?: number;
  readonly baseUrl?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_BASE_URL = "https://api.lastasylumtracker.com/v1";

interface Unexpected {
  readonly kind: "unavailable";
  readonly reason: "unexpected";
}

/** Every lookup result except a found value. */
type Failure = Exclude<LookupResult<never>, { readonly kind: "found" }>;

/** A body that passed its schema, or the unexpected failure that was already logged. */
type ReadBody<T> = { readonly ok: true; readonly body: T } | { readonly ok: false; readonly failure: Unexpected };

/** The only code that talks to the Game API. Never throws for an API failure; the key is never logged. */
export class GameApiClient {
  private readonly apiKey: string;
  private readonly version: string;
  private readonly fetchFn: FetchLike;
  private readonly logError: (line: string) => void;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: GameApiClientOptions) {
    this.apiKey = options.apiKey;
    this.version = options.version;
    this.fetchFn = options.fetch;
    this.logError = options.logError;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async getPlayer(uid: Uid): Promise<LookupResult<Player>> {
    const endpoint = "/players/{uid}";

    const response = await this.request(endpoint, `/players/${uid}`);
    if (!(response instanceof Response)) return response;

    const read = await this.readBody(endpoint, response, playerBodySchema);
    if (!read.ok) return read.failure;

    const body = read.body;
    if (body.uid !== uid) return this.unexpected(endpoint, "status 200, answer is for another uid");

    const kingdom = parseKingdom(body.kid);
    if (!kingdom.ok) return this.unexpected(endpoint, "status 200, kid is not a Kingdom number");

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

  async getAlliance(kingdom: KingdomNumber, key: AllianceKey): Promise<LookupResult<Alliance>> {
    const endpoint = "/alliances/{kingdom}/{key}";

    const response = await this.request(
      endpoint,
      `/alliances/${kingdom.toString()}/${encodeURIComponent(key)}`,
      true,
    );
    if (!(response instanceof Response)) return response;

    if (response.status === 409) {
      const read = await this.readBody(endpoint, response, ambiguousBodySchema);
      if (!read.ok) return read.failure;
      return { kind: "ambiguous", matches: read.body.matches.map(toMatch) };
    }

    const read = await this.readBody(endpoint, response, allianceBodySchema);
    if (!read.ok) return read.failure;

    const body = read.body;
    if (body.sid !== kingdom) return this.unexpected(endpoint, "status 200, answer is for another Kingdom");

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
  private async request(endpoint: string, path: string, conflictIsAnswer = false): Promise<Response | Failure> {
    let response: Response;
    try {
      response = await this.send(path);
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return this.fail(endpoint, timedOut ? "timeout" : "network", { kind: "try-again" });
    }
    const status = response.status;
    if (status === 200) return response;
    if (status === 409 && conflictIsAnswer) return response;
    await this.discardBody(response);
    if (status === 404) return { kind: "not-found" };
    const detail = `status ${String(status)}`;
    if (status === 429) return this.fail(endpoint, detail, { kind: "quota-spent" });
    if (status === 502 || status === 503 || status === 504) return this.fail(endpoint, detail, { kind: "try-again" });
    if (status === 401 || status === 403) return this.fail(endpoint, detail, { kind: "unavailable", reason: "auth" });
    return this.unexpected(endpoint, detail);
  }

  /** Parses the body as JSON and checks it against the schema; a failure is logged with the reason. */
  private async readBody<T>(endpoint: string, response: Response, schema: z.ZodType<T>): Promise<ReadBody<T>> {
    const status = `status ${response.status.toString()}`;

    let raw: unknown;
    try {
      raw = JSON.parse(await response.text());
    } catch {
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
  private async discardBody(response: Response): Promise<void> {
    try {
      await response.body?.cancel();
    } catch {
      // The connection is released or closed either way; nothing to report.
    }
  }

  private fail(endpoint: string, detail: string, failure: Failure): Failure {
    this.logError(`Game API ${endpoint}: ${failure.kind}, ${detail}`);
    return failure;
  }

  private send(path: string): Promise<Response> {
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

  private unexpected(endpoint: string, detail: string): Unexpected {
    this.logError(`Game API ${endpoint}: unavailable (unexpected), ${detail}`);
    return { kind: "unavailable", reason: "unexpected" };
  }
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
