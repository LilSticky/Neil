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

    let response: Response;
    try {
      response = await this.send(`/players/${uid}`);
    } catch {
      return this.unexpected(endpoint, "network error");
    }

    if (response.status === 404) return { kind: "not-found" };
    if (response.status !== 200) return this.unexpected(endpoint, `status ${String(response.status)}`);

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
