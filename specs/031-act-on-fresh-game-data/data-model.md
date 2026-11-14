# Data Model: Act on fresh game data

No stored data changes; no migration.

## Freshness (domain type)

`"live" | "copy"`: whether a lookup needs data the game sends now (`live`, Neil acts on it) or takes the tracker's copy
(`copy`, Neil only shows it).

## LookupResult found

`{ kind: "found", value, asOf: Date }`. `asOf` (was `fetchedAt`): when the game sent the data = the moment Neil received
the answer − `age_seconds`. For a live answer, `asOf` equals the receive moment.

## Cache entry

`{ value, storedAt: Date, asOf: Date, liveUsable: boolean }`. `liveUsable` is set when the entry is stored and says whether a
live lookup may take it:

- an answer to a live request (`?fresh=1`) is `liveUsable`;
- a copy answer is `liveUsable` only when the tracker gave a usable `age_seconds`;
- a copy answer without a usable `age_seconds` is not: its `asOf` is the receive moment (shown as such), which says nothing
  about how old the data is, so a live lookup must ask again;
- a 409 match list is `liveUsable` only from a live request.

| Lookup | Uses the entry when |
|--------|---------------------|
| `copy` | `now − storedAt < ttl` |
| `live` | `liveUsable` and `now − asOf < ttl` |
| quota spent / reserve kept / allowance spent | any entry (stale fallback) |

## Body fields read

`age_seconds`: optional number on player and alliance bodies. Missing or not a number, or negative or not finite, reads as
no usable age: the answer's `asOf` is the receive moment, and a copy answer without one is not `liveUsable`.
