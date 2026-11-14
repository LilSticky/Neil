# Review: slice 031 Game API client (src/game-api/)

## Must fix
- client.ts:748 (`asOfFrom`) and schemas.ts:20: a missing or unreadable `age_seconds` counts as 0, so asOf = receive time. On a
  copy lookup (no `?fresh=1`, charged lookups) this stamps a possibly old tracker copy as "just now"; a later live lookup
  then takes it from the cache (lookup-cache.ts:60, asOf test) and an acting caller acts on old data. Fix: fail closed. Keep
  age as `number | undefined`; for a copy answer with no age use asOf = receive time minus the TTL (or the epoch) so a live
  lookup never reuses it; trust "age 0" only when `?fresh=1` was sent. Add a test: copy answer without age, then live lookup refetches.

## Should fix
- client.ts:318-321: an ambiguous match list is stored with asOf = receivedAt even when it came from a copy lookup, so a live
  lookup reuses an old match list. Store it with asOf = receivedAt only if freshness === "live", else an old asOf.
- client.ts:707 (`orStale`) hands the cached copy, however old, to acting (live) callers when the quota is spent or reserved.
  The spec (l.100) allows this if the age is shown; confirm every acting caller (pick, reaper, daily-sync) checks `asOf` and
  does not act on it. The type does not stop it. Consider a distinct `stale` flag on the found result.
- The `?fresh=1` query is on live lookups only (pathWithFreshness) and chargedTo is fixed to "copy": correct. Quota cost
  unchanged (request path unchanged otherwise). In-flight key includes freshness (flightKey): correct, no sharing across freshness.

## Nit
- client.ts:185,199,212,336: `...[freshness = "live"]: [Freshness?]` is needless. A plain `freshness: Freshness = "live"` is
  equivalent for callers and reads normally; the rest tuple only helps if a later parameter must follow, which none does.
  Prefer the plain default parameter. Better still for the "acting caller cannot get a copy by accident" goal: make freshness
  required on the uncharged methods, so each caller states it.
- client.ts:299 byName: the cache `store` of a found answer uses storedAt = this.now() after the fetch; fine, but the
  name-lookup found path does not seed the `players` cache by uid; fine, only a missed saving.

## Resolution (2026-11-14)

- Must fix (copy without an age stamped "now" served live lookups): fixed. Cache entries carry `liveUsable`
  (data-model.md), tested in `client.test.ts` "live lookup after a copy answer without a usable age".
- Should fix (ambiguous match lists): fixed by the same rule; a 409 list serves live lookups only from a live request.
- Should fix (`orStale` for acting callers): kept. The spec's edge cases allow the stale fallback when the quota is
  spent or reserved, as before the slice; the answer carries its real `asOf`.
- Nit (rest-tuple default): kept. A plain default parameter types as `Freshness | undefined` under
  `exactOptionalPropertyTypes`; the tuple keeps the signature exact. Making it required would touch every fake for no
  behaviour gain.
