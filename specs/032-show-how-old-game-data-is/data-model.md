# Data model: Show how old game data is

No stored data changes. In-memory types:

## Map time (domain)

- `asOf: Date | undefined` on a found `LookupResult<T>`: a Player's `map_updated_at`; `undefined` for an Alliance and
  for a Player body whose `map_updated_at` is missing, not a finite number, or ≤ 0.
- `isOld(asOf, now)`: `true` when `asOf` is `undefined` or `now − asOf > 5 minutes`; a future `asOf` is not old.
- `mapPageOf(kingdom | undefined)`: `https://lastasylumtracker.com/map?kid=<kingdom>`, or without `?kid=` when unknown.

## Freshness (domain)

- `"copy"` (default): may come from Neil's cache within `GAME_API_CACHE_MINUTES` (counted from `storedAt`); asks without
  `?fresh=1`.
- `"live"`: never read from Neil's cache; asks with `?fresh=1`; its answer is stored like any other.

## Cache entry (adapter)

- `{ value, asOf: Date | undefined, storedAt: Date }`; `liveUsable` is removed.

## Look again target (Discord adapter)

| Kind | Custom id | Repeats |
|------|-----------|---------|
| Player card | `again:<ownerId>:p:<uid>` | `getPlayer(uid)` live, charged |
| Alliance card | `again:<ownerId>:a:<kingdom>:<tag>` | `getAlliance(kingdom, tag)` live, charged; first roster page |
| Alliance Overview | `again:<ownerId>:o:<kingdom>:<tag>` | same, rendered as the Overview |
| `/reaper closest` | `again:<ownerId>:r[:<x>:<y>]` | the closest ranking with live, uncharged reads |

## REAPER read

- `readAt` = the Player's map time, else the moment the answer arrived.
