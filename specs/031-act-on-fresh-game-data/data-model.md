# Data Model: Act on fresh game data

No stored data changes; no migration.

## Freshness (domain type)

`"live" | "copy"`: whether a lookup needs data the game sends now (`live`, Neil acts on it) or takes the tracker's copy
(`copy`, Neil only shows it).

## LookupResult found

`{ kind: "found", value, asOf: Date }`. `asOf` (was `fetchedAt`): when the game sent the data = the moment Neil received
the answer − `age_seconds`. For a live answer, `asOf` equals the receive moment.

## Cache entry

`{ value, storedAt: Date, asOf: Date }`.

| Lookup | Uses the entry when |
|--------|---------------------|
| `copy` | `now − storedAt < ttl` |
| `live` | `now − asOf < ttl` |
| quota spent / reserve kept / allowance spent | any entry (stale fallback) |

## Body fields read

`age_seconds`: optional number on player and alliance bodies. Missing, negative or not finite → 0.
