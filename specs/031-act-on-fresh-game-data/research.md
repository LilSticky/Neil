# Research: Act on fresh game data

## R1. What the tracker sends now (verified 2026-11-14)

Two calls to `/players/145563254785`:

| Call | `x-cache` | `cached` | `age_seconds` | `refreshing` | `cache_seconds` | Time |
|------|-----------|----------|---------------|--------------|-----------------|------|
| plain | `stale` | true | 160263 (≈ 44.5 h) | true | 3600 | 0.16 s |
| `?fresh=1` | `live` | false | 0 | false | 3600 | 0.12 s |

All four fields are top level, next to `quota`. Both answers were `content-encoding: gzip`; Node's fetch decodes it.
The `quota` showed `limit: 2000, patron: true`; each call used one request. The docs list `fresh` on all six player and
alliance GETs and not on `/quota`; `x-cache` values `hit`, `stale`, `miss`, `live`.

- **Decision**: read `age_seconds` from player and alliance bodies; ignore `refreshing`, `cached` and `x-cache`.
- **Rationale**: the age is all Neil needs to place the data in time; the rest only explains it.
- **Alternatives**: reading `x-cache` (a header, no age); polling again while `refreshing` (costs requests).

## R2. How a caller says it needs live data

- **Decision**: a `Freshness` (`"live" | "copy"`) as an optional last parameter on the uncharged lookups, default
  `"live"`; charged lookups are always `"copy"`. REAPER's three uncharged reads pass `"copy"`.
- **Rationale**: every uncharged caller except REAPER acts on its answer (Link, corrections, Interview, nickname and
  roles, Daily Sync, Booty Call), so the safe default needs no change in five callers. Charged lookups are exactly the
  showing commands.
- **Alternatives**: a fourth `RequestPurpose` (purpose decides the Quota Reserve, a different concern; `lookup` is used
  by both acting and showing callers); a required parameter (churn in every fake and test with no gain).

## R3. The time on a found answer

- **Decision**: rename `fetchedAt` to `asOf` across `src/` and define it as the receive moment minus `age_seconds`. A
  missing, negative or non-finite age counts as 0.
- **Rationale**: every consumer (card footer "as of", Overview, REAPER `readAt`) already means "how old is this
  data"; renaming keeps the meaning honest and needs no consumer logic change.
- **Alternatives**: a second field next to `fetchedAt` (two times nobody needs to tell apart outside the client).

## R4. Neil's cache with two kinds of answers

- **Decision**: a cache entry keeps `storedAt` (when Neil got it) and `asOf`. A `copy` lookup takes an entry with
  `now − storedAt < ttl`, as today. A `live` lookup takes one with `now − asOf < ttl`, so a live answer is reused for the
  cache window and an old copy never is. A new answer replaces the entry whichever kind it is. The stale fallback on a
  spent quota is unchanged and returns the entry's `asOf`.
- **Rationale**: FR-005/FR-006 with one cache per lookup kind and no extra storage.
- **Alternatives**: separate caches per freshness (a live answer could not serve a showing lookup).

## R5. Sharing a request in flight

- **Decision**: the flight key gains the freshness, so a live lookup never waits on a copy request.
- **Alternatives**: let a copy lookup join a live request (saves rare requests, more logic).

## R6. Name lookups that end ambiguous

A cached match list (409) has no age from the tracker. **Decision**: its `asOf` is the moment Neil got it, as today, so
it serves live lookups within the cache window.
