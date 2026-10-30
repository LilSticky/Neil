# Data model: Look up players within the daily quota

## Daily Quota (domain, `src/domain/daily-quota.ts`)

| Field | Type | Rules |
|-------|------|-------|
| `day` | `UtcDay` (`"YYYY-MM-DD"`, branded) | the UTC day the figures belong to; only `utcDayOf(date)` makes one |
| `used` | whole number ≥ 0 | requests counted today, Neil's own count or the Game API's adopted figure |
| `limit` | whole number ≥ 1 | the last limit the Game API reported; 1,000 before any report |
| `limitReached` | boolean | true after a 429 on this day |
| `confirmedAt` | `Date \| undefined` | when the Game API last reported figures on this day |

Derived: `remaining = max(0, limit − used)`; `canSend = !limitReached && used < limit`;
`resetsAt = next 00:00 UTC after day`.

Transitions (all pure, `now: Date` passed in):

- `todaysQuota(stored | undefined, now)`: the stored quota if `stored.day` is today; otherwise a fresh one
  for today (`used 0`, `limitReached false`, `confirmedAt undefined`, limit carried over or 1,000).
- `countRequest(q)`: `used + 1` (only called when `canSend`).
- `adoptReported(q, { used, limit }, inFlight, now)`: `used = reported used + inFlight`, `limit = reported
  limit`, `confirmedAt = now`.
- `markLimitReached(q, now)`: `limitReached = true`, `confirmedAt = now`.

## Officer (domain, `src/domain/officer.ts`)

`isOfficer(memberRoleIds, officerRoleIds): boolean`: true when the Member has at least one of the
configured Moderator or King role IDs.

## Retry (domain, `src/domain/retry.ts`)

`retryDelay(attempt, random)`: milliseconds before attempt `attempt + 1`; `1000 × 2^(attempt − 1) ×
(0.5 + random)`, `random` in [0, 1). `MAX_ATTEMPTS = 3`.

## LookupResult (domain, `src/domain/player.ts`, changed)

- `found` gains `fetchedAt: Date` (when the Game API answered, kept by the cache).
- `quota-spent` gains `resetsAt: Date`.

## Cached answer (adapter, `src/game-api/lookup-cache.ts`)

`{ value: Player | Alliance, fetchedAt: Date }` by key `player:<uid>` / `alliance:<kingdom>:<tag lower
case>`. In memory, at most 2,000 entries, oldest dropped first. Not persisted.

## Storage (`neil.db`, migration 2)

```sql
CREATE TABLE daily_quota (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  day TEXT NOT NULL,
  used INTEGER NOT NULL CHECK (used >= 0),
  quota_limit INTEGER NOT NULL CHECK (quota_limit >= 1),
  limit_reached INTEGER NOT NULL CHECK (limit_reached IN (0, 1)),
  confirmed_at TEXT
)
```

No personal data: only counts and times.

## Configuration (`src/config.ts`, new)

| Variable | Rule | Default |
|----------|------|---------|
| `DISCORD_MODERATOR_ROLE_ID` | Discord ID (17–20 digits), required | – |
| `DISCORD_KING_ROLE_ID` | Discord ID (17–20 digits), required | – |
| `GAME_API_CACHE_MINUTES` | whole number ≥ 10 | 10 |
