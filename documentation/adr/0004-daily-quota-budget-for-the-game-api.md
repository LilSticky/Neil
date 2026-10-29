# 4. Daily quota budget for the Game API

Date: 2026-10-29

## Status

Proposed

## Context

The Last Asylum Tracker API allows 1,000 requests per UTC day (2,000 for patrons); every call counts,
including cache hits on its side and `/v1/quota`. It refreshes a profile or roster only every 10 minutes.
A 429 means the day is spent. There is no documented per-second limit. Neil serves a whole kingdom, so a
full sync costs about one roster request per alliance, and a burst of joins can cause many lookups
(see [GAME-API.md](../GAME-API.md) and [discovery](../discovery/initial.md)).

## Decision

We will route every Game API call through one client that:

1. **Caches** players and rosters for at least 10 minutes (configurable, longer for bulk sync), keyed by
   uid and by normalised lookup key; an in-flight request for the same key is shared, not repeated.
2. **Counts** usage per UTC day in persistent storage and trusts the `X-RateLimit-Remaining` header over
   its own count whenever one arrives, so restarts cannot overspend.
3. **Budgets** by purpose: interactive lookups (interviews, `/player`) and background sync get separate
   shares of the daily limit, with a reserve that only interactive work may use. Shares are configuration.
4. **Fails gracefully**: with the share spent or after a 429 it serves cached data where it can, otherwise
   returns a typed `QuotaExhausted` result until the next 00:00 UTC; 503/504 retry with capped exponential
   backoff and jitter (at most a few attempts); a small concurrency limit smooths bursts.

## Consequences

- The quota is a domain concept (pure budget rules in `src/domain/`), testable with a fake clock.
- Needs persistent storage for the counter (ADR 5).
- Background sync runs only on what the budget leaves; its frequency is derived, not fixed.
