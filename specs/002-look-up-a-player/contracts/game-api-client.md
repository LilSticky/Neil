# Contract: Game API client

The only code that talks to the Game API (constitution IV). `src/game-api/client.ts`.

```text
new GameApiClient({ apiKey, version, fetch, logError, timeoutMs = 8000, baseUrl = "https://api.lastasylumtracker.com/v1" })
getPlayer(uid: Uid): Promise<LookupResult<Player>>
getAlliance(kingdom: KingdomNumber, key: AllianceKey): Promise<LookupResult<Alliance>>
```

## Requests

| Call | Request |
|------|---------|
| `getPlayer` | `GET {baseUrl}/players/{uid}` |
| `getAlliance` | `GET {baseUrl}/alliances/{kingdom}/{encodeURIComponent(key)}` |

Headers: `Authorization: Bearer {apiKey}`, `User-Agent: Neil/{version} (+https://github.com/LilSticky/Neil)`,
`Accept: application/json`. Signal: `AbortSignal.timeout(timeoutMs)`.

## Status mapping

| Response | Result |
|----------|--------|
| 200, body valid, matches the request | `found` |
| 200, body invalid or for another uid / Kingdom | `unavailable` / `unexpected` |
| 404 | `not-found` |
| 409 with readable `matches` | `ambiguous` (else `unavailable` / `unexpected`) |
| 429 | `quota-spent` |
| 401, 403 | `unavailable` / `auth` |
| 502, 503, 504, timeout, network error | `try-again` |
| anything else | `unavailable` / `unexpected` |

Error bodies may be plain text (research R1); the mapping uses the status only.

## Logging

`logError` gets one line per non-`found`, non-`not-found` result: endpoint path, status (or
`timeout` / `network`), and for validation failures the zod issue paths. Never the key, never the
`Authorization` header.

## Fixtures

`src/game-api/__fixtures__/`: recorded bodies (`player-in-alliance.json`, `alliance.json`,
`alliance-not-found.json`, …) written by `scripts/record-fixtures.ts`, which strips nothing but needs no
secrets in the output (bodies carry no key). Hand-written fixtures say so in a sibling `README.md`.
