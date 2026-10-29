import { rankFromRoster } from "../domain/alliance-rank.js";
import { parseKingdom, type Uid } from "../domain/lookup-input.js";
import type { LookupResult, Player } from "../domain/player.js";
import { playerBodySchema } from "./schemas.js";

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

    let raw: unknown;
    try {
      raw = JSON.parse(await response.text());
    } catch {
      return this.unexpected(endpoint, "status 200, body is not JSON");
    }

    const parsed = playerBodySchema.safeParse(raw);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
      return this.unexpected(endpoint, `status 200, invalid body at ${paths}`);
    }

    const body = parsed.data;
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

  /** A 200 response, or the failure every endpoint shares; only the status is read, as error bodies may be plain text. */
  private async request(endpoint: string, path: string): Promise<Response | Failure> {
    let response: Response;
    try {
      response = await this.send(path);
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return this.fail(endpoint, timedOut ? "timeout" : "network", { kind: "try-again" });
    }
    const status = response.status;
    if (status === 200) return response;
    if (status === 404) return { kind: "not-found" };
    const detail = `status ${String(status)}`;
    if (status === 429) return this.fail(endpoint, detail, { kind: "quota-spent" });
    if (status === 502 || status === 503 || status === 504) return this.fail(endpoint, detail, { kind: "try-again" });
    if (status === 401 || status === 403) return this.fail(endpoint, detail, { kind: "unavailable", reason: "auth" });
    return this.unexpected(endpoint, detail);
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
