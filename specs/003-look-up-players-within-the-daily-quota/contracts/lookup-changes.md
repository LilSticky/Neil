# Contract changes: `/player`, `/alliance` and the Game API client

Changes to slice 002's [lookup-commands](../../002-look-up-a-player/contracts/lookup-commands.md) and
[game-api-client](../../002-look-up-a-player/contracts/game-api-client.md). Everything not named here
stays.

## Cards

Footer: `Data from Last Asylum Tracker · as of {HH:MM} UTC`, from the result's `fetchedAt`. When
`fetchedAt` is not on today's UTC day: `as of {D Mon} {HH:MM} UTC` (e.g. `29 Oct 23:50 UTC`).

## Messages

| Case | Text |
|------|------|
| quota-spent | `Lookups are paused: Neil has used today's Daily Quota of Game API requests. They work again at 00:00 UTC ({time left}).` |

`{time left}` as in [quota-command.md](quota-command.md), computed from `resetsAt` and the handler's
injected `now`.

## Game API client

`new GameApiClient({ …slice 002 options, quota: QuotaKeeper, now, sleep, random, cacheTtlMs })`.

- `getPlayer(uid)` / `getAlliance(kingdom, key)`:
  1. Fresh cache entry for the key → `found` with its `fetchedAt`, no request.
  2. A lookup for the key in flight → the same promise.
  3. `quota.canSend()` false → any cache entry for the key (stale) as `found`, else
     `{ kind: "quota-spent", resetsAt }`.
  4. Otherwise request with retries (research R6); every attempt: `canSend` → `count` (persisted) →
     send → adopt figures from body or headers → on 429 `markLimitReached`.
  5. `found` is stored in the cache with `fetchedAt = now()` at the answer. Other results are not stored.
- `quotaToday(): DailyQuota`: today's quota, no request (for `/quota`).

Figures read from a response (zod, all optional, ignored when malformed):
- body `quota: { limit, used, remaining }` (whole numbers ≥ 0, limit ≥ 1);
- headers `x-ratelimit-limit`, `x-ratelimit-remaining` (decimal whole numbers).
Body wins over headers. Log line when figures are malformed: `Game API {endpoint}: quota figures
unreadable` (no values that could hold secrets).
