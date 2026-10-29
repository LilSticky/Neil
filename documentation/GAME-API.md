# Game API

What we know about the Game API: the **Last Asylum Tracker** HTTP API, a third-party tracker for Last
Asylum: Plague. Only the Game API client in `src/game-api/` talks to it (constitution IV). Update this
file whenever something about the API is learned.

Summarised from the tracker's docs page on 2026-10-29. Field names below are the API's, not our
dictionary terms.

## Source

- Docs: the tracker's API page (Docs → API keys); key created there after a Patreon login.
- Base URL: `https://api.lastasylumtracker.com/v1`
- Authentication: `Authorization: Bearer lap_…` (or `X-API-Key: lap_…`) on every request. The key lives
  in the `GAME_API_KEY` environment variable, never in the repository or logs.
- Send a normal `User-Agent`: requests without one get a Cloudflare 403 before the key is checked.

## Quota (the "rate limit")

- **1,000 requests per UTC day** on a free account, 2,000 with a paid Patreon membership. Every `/v1`
  call counts, including `/v1/quota`.
- Resets at 00:00 UTC. No per-second limit is documented.
- Every response carries the quota, in the JSON body (`quota`) and in headers:
  `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset: 00:00 UTC`.
- Quota object: `{ "limit": 1000, "used": 3, "remaining": 997, "patron": false, "resets": "00:00 UTC" }`.
- `429` = daily limit reached (`quota.remaining` is 0). Retrying before the reset is pointless.

## Freshness

- The tracker keeps a profile or alliance roster for **10 minutes**; requests inside that window get the
  same data with `cached: true` (they still cost quota). There is no point caching for less than 10
  minutes on our side.

## Endpoints

| Endpoint | Gives us |
|----------|----------|
| `GET /players/{uid}` | one player profile by uid (also the id in the tracker's profile URL) |
| `GET /players/name/{name}` | a player by exact name; `409` with `matches` if several share it |
| `GET /players/{server}/{name}` | a player by name on one server (kingdom) |
| `GET /alliances/{server}/{tag}` | an alliance by kingdom number and tag, e.g. `/alliances/1/NML`; brackets optional; tags are case-sensitive when both spellings exist |
| `GET /alliances/name/{name}` | an alliance by name; several matches list servers and tags |
| `GET /alliances/{alliance_id}` | an alliance by id |
| `GET /quota` | only the quota object plus `ok`, `cached`, `cache_seconds`; costs one request |

**Player profile**: `nick`, `uid`, `power`, `kills`, sanctuary `lv` and `skin_name`, kingdom `kid`,
coordinates `x`/`y`, alliance name and abbreviation, plus `vip`, `likes`, `language`, `gender` and
`ranks` when on the profile; `cached`.

**Alliance**: name, abbreviation, level, member count, `declaration`, and `members[]`, each with `name`,
`uid`, `power`, sanctuary level, `x`/`y`, `online`, `last_online_at`, `joined_at`, `active` (weekly
activity), `daily_honor`, `daily_tech` (tech points donated today). A missing value means the roster did
not include it.

**Budget consequence**: one alliance roster call returns every member, so syncing a whole alliance costs
1 request, while per-player lookups cost 1 each. Prefer the roster for bulk work.

## Errors

| Status | Meaning |
|--------|---------|
| 401 | missing or unknown key |
| 404 | player or alliance not found |
| 409 | more than one match; `matches` lists uid, server, tag or name |
| 429 | daily limit reached |
| 502 | profile could not be prepared |
| 503 | API busy; try again shortly |
| 504 | request took too long |

Example: `curl -H "Authorization: Bearer lap_your_key" https://api.lastasylumtracker.com/v1/players/145563254785`

## Open questions

- Whether `ranks` contains the in-alliance rank (R1–R5) or something else: record a real response.
- Exact JSON shape (top-level wrapper, `ok` field on every response?): record fixtures in slice 2.
- Whether a player's alliance rank is visible in the alliance roster.
