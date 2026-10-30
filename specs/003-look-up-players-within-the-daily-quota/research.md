# Research: Look up players within the daily quota

Decisions for slice 003. Inputs: [spec.md](spec.md), ADR 4 (quota budget), ADR 5 (SQLite),
[GAME-API.md](../../documentation/GAME-API.md), slice 002's client (`src/game-api/client.ts`).

## R1: Where the cache, the count and the retries live

- **Decision**: all three inside `GameApiClient`, the only caller of the Game API. The client gets two
  collaborators: a `LookupCache` (in memory, also shares in-flight lookups) and a `QuotaKeeper` (holds
  today's Daily Quota, persists every change through a `DailyQuotaStore`). Retries live in the client's
  private `request()`, so every HTTP attempt passes the Daily Quota check and is counted.
- **Rationale**: constitution IV ("one client that enforces its rate limit and caches"); callers
  (`src/discord/lookup.ts`) keep calling `getPlayer` / `getAlliance` unchanged. Slice 002 research R3
  planned exactly this.
- **Alternatives**: a decorator around the client (counting would miss retries made inside it); a
  separate scheduler/queue (no burst problem yet, every lookup is a deliberate command).

## R2: Daily Quota rules are domain

- **Decision**: `src/domain/daily-quota.ts`: `UtcDay`, `DailyQuota` and pure functions
  (`todaysQuota`, `canSend`, `countRequest`, `adoptReported`, `markLimitReached`, `remaining`,
  `nextReset`). Time comes in as a `Date` parameter. `src/domain/retry.ts`: `retryDelay(attempt, random)`.
  Cache freshness is one comparison in the adapter.
- **Rationale**: ADR 4 consequence ("pure budget rules in `src/domain/`, testable with a fake clock");
  constitution III.

## R3: Counting and adopting the Game API's figures

- **Decision**: Neil counts a request **before** sending it and saves the count at once (a crash
  mid-request cannot lose it). When an answer carries figures, Neil adopts them: from the body's `quota`
  object (`limit`, `used`, `remaining`), else the `x-ratelimit-limit` / `x-ratelimit-remaining` headers
  (`used = limit − remaining`). Requests Neil has sent but not yet heard back from are added on top, so
  two parallel lookups cannot undercount. Figures that are not whole, non-negative numbers are ignored
  (and logged), never adopted.
- **Rationale**: ADR 4 point 2; GAME-API.md says `quota` is in player and alliance bodies and headers are
  verified on `/quota`; failed calls count too.
- **Alternatives**: count after the answer (loses requests on crash or timeout); trust only our count
  (drifts with the tracker's own counting).

## R4: Spent and 429

- **Decision**: `canSend` is false when `used ≥ limit` or the day is marked `limitReached` (after a 429).
  Both are persisted, so a restart keeps them. A new UTC day starts with `used 0`, `limitReached false`,
  the last known limit, and `confirmedAt` empty. Before the Game API ever reported a limit, the limit is
  **1,000** (free tier, the safe side).
- **Rationale**: FR-007, SC-002; GAME-API.md ("budget with `x-ratelimit-limit`, not a constant").

## R5: Cache

- **Decision**: a `Map` from key to `{ value, fetchedAt }`; keys `player:<uid>` and
  `alliance:<kingdom>:<tag in lower case>` (the tag is already trimmed by `parseAllianceKey`). Only
  `found` results are stored. Fresh means `now − fetchedAt < ttl`; ttl from `GAME_API_CACHE_MINUTES`
  (default 10, minimum 10). When the Daily Quota is spent, any stored entry is served, however old. At
  most 2,000 entries; the oldest stored is dropped first. In-flight sharing: a second map from key to the
  pending promise, removed when it settles.
- **Rationale**: FR-001–FR-003, FR-008; the tracker's own `cache_seconds: 600`. 2,000 entries bound
  memory to about a day's worth of requests.
- **Alternatives**: persist the cache in SQLite (more code; losing it costs one request per key);
  reuse roster rows for other Players (spec Assumptions: not now).

## R6: Retries

- **Decision**: only on 503 and 504. At most 3 attempts per lookup. Pause before attempt *n+1*:
  `1,000 ms × 2^(n−1)`, multiplied by a random factor in [0.5, 1.5) (jitter). The whole lookup has a
  20-second deadline: each attempt's timeout is `min(15 s, time left)`, and a retry is made only if at
  least 2 seconds remain after its pause. Every attempt checks the Daily Quota first. `sleep`, `now` and
  `random` are injected, so tests run on a fake clock.
- **Rationale**: FR-009, ADR 4 point 4, slice 002 SC-001 (20 s). Timeouts and network errors are not
  retried (FR-009: "all other failures MUST NOT be retried"); a timeout already used 15 s.

## R7: `quota-spent` carries the reset time; cards carry `fetchedAt`

- **Decision**: `LookupResult`'s `found` gains `fetchedAt: Date`; `quota-spent` gains `resetsAt: Date`.
  The Discord adapter formats them: the card footer reads `Data from Last Asylum Tracker · as of 14:05 UTC`
  (with the date, `29 Oct 23:50 UTC`, when it is not from today); the spent message names 00:00 UTC and
  the time left (`in 3 h 12 min`, computed with an injected `now`).
- **Rationale**: FR-004, FR-008, SC-004; formatting stays in the adapter.

## R8: Who is an Officer

- **Decision**: config `DISCORD_MODERATOR_ROLE_ID` and `DISCORD_KING_ROLE_ID`, both required snowflakes.
  The `/quota` handler reads the caller's role IDs from the interaction (`interaction.member.roles`, a
  `GuildMemberRoleManager` or a plain `string[]` for an uncached member) through a small port
  `memberRoleIds(): readonly string[]`, and a pure domain function `isOfficer(roleIds, officerRoleIds)`.
  The command is registered for everyone; the check is Neil's (spec Assumptions). No new intent is needed:
  the interaction carries the member's roles.
- **Rationale**: FR-011, FR-012, dictionary (Officer = Moderator or King, 2026-10-30); constitution V.
- **Alternatives**: `setDefaultMemberPermissions` (server admins could change it; not testable in Neil).

## R9: Storage

- **Decision**: migration 2 adds `daily_quota` (one row, `id = 1`): `day TEXT`, `used INTEGER ≥ 0`,
  `quota_limit INTEGER ≥ 1`, `limit_reached INTEGER 0/1`, `confirmed_at TEXT NULL`. `DailyQuotaStore`
  (`load` / `save`) validates the row with zod; a corrupt row stops Neil at startup, like the start record.
- **Rationale**: ADR 5 names quota as one of SQLite's uses; spec edge case (no count, no start).
  Synchronous `node:sqlite` writes are fast enough for at most a few thousand writes per day.

## R10: No shares, no reserve

- **Decision**: one budget; no per-purpose shares and no Quota Reserve (spec Clarifications). ADR 4
  point 3 is not contradicted, only not yet needed: there is one purpose. The `QuotaKeeper` API takes no
  purpose argument; slice 004 adds one with the Quota Reserve.
