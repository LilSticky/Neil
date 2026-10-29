# Data model: Look up a player

Domain types live in `src/domain/` (pure, constitution III). Names follow `DICTIONARY.md`. Nothing is
stored in this slice.

## Value types

| Type | Meaning | Rules |
|------|---------|-------|
| `Uid` | A Player's id from the game | branded string, 1–20 digits; made only by `parseUid(input)` |
| `KingdomNumber` | A Kingdom | branded integer 1–9999; made only by `parseKingdom(input)` |
| `AllianceKey` | An Alliance's tag or name, as typed | branded string, trimmed, 1–40 characters; made only by `parseAllianceKey(input)` |
| `AllianceRank` | R1–R5, or unknown | `"R1" \| "R2" \| "R3" \| "R4" \| "R5" \| "unknown"` |

Each `parse…` returns `{ ok: true, value } | { ok: false }`; the Discord adapter turns `ok: false` into
the help text (contracts).

## Player

| Field | Type | From the Game API |
|-------|------|-------------------|
| `uid` | `Uid` | `uid` |
| `name` | string | `nick` |
| `kingdom` | `KingdomNumber` | `kid` |
| `power` | non-negative integer | `power` |
| `sanctuaryLevel` | positive integer | `lv` |
| `alliance` | `PlayerAlliance \| undefined` | `aid`, `alliance_abbr`, `alliance_name` (undefined when `aid` is 0/null) |
| `allianceRank` | `AllianceRank \| undefined` | own row in `alliance_members[]` (R6); undefined exactly when `alliance` is |

`PlayerAlliance` = `{ tag: string; name: string }`. Invariant: a Player without an Alliance has no
Alliance Rank; the type is a union so the invalid combination cannot be built:
`{ alliance: undefined; allianceRank: undefined } | { alliance: PlayerAlliance; allianceRank: AllianceRank }`.

## Alliance

| Field | Type | From the Game API |
|-------|------|-------------------|
| `tag` | string | `abbr` |
| `name` | string | `name` |
| `kingdom` | `KingdomNumber` | `sid` |
| `power` | non-negative integer | `power` |
| `memberCount` | non-negative integer | `member_count` |
| `capacity` | positive integer | `capacity` |
| `leaderName` | `string \| undefined` | `leader_name` |

## LookupResult

What the Game API client returns for every lookup (never throws for an API failure):

```text
LookupResult<T> =
  | { kind: "found"; value: T }
  | { kind: "not-found" }                                   // 404
  | { kind: "ambiguous"; matches: readonly Match[] }        // 409
  | { kind: "quota-spent" }                                 // 429
  | { kind: "try-again" }                                   // 502, 503, 504, timeout, network error
  | { kind: "unavailable"; reason: "auth" | "unexpected" }  // 401/403, other status, body fails validation, wrong uid/kingdom
```

`Match` = `{ tag?: string; name?: string; kingdom?: number; uid?: string }` (R9).

## Validation at the boundary

- `src/game-api/schemas.ts`: zod schemas for the player and alliance bodies, lenient on unknown extra
  fields, strict on the fields above. `null` rank labels and missing rosters are allowed.
- After parsing, the client checks the answer is the one asked for: player `uid` equals the requested
  uid; alliance `sid` equals the requested Kingdom. Otherwise `unavailable/unexpected` (spec edge case).
