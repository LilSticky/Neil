# Data model: Find the closest Exile

## Exile (domain, `src/domain/exile.ts`)

| Field | Type | Rule |
|-------|------|------|
| `uid` | `Uid` | identity; at most one Exile per Player |
| `name` | string | latest Player Name read; follows renames |
| `kingdom` | `KingdomNumber` | latest Kingdom read; a lookup counts only Exiles of its Kingdom |
| `position` | `{ x, y } \| undefined` | latest position read; undefined if never read with one |
| `positionAt` | `Date \| undefined` | when `position` was read; present exactly when `position` is |
| `reason` | `ExileReason` | trimmed, 1–200 characters |
| `addedAt` | `Date` | when it was added; tie-break and list order |
| `addedBy` | `MemberId` | the R5 who added it; never shown to Members (log channel only) |

No states: an Exile exists or not. Removing deletes the row.

## Storage (migration 11, `src/storage/database.ts`)

```sql
CREATE TABLE reaper (
  uid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kingdom INTEGER NOT NULL,
  x REAL,
  y REAL,
  position_at TEXT,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
  added_at TEXT NOT NULL,
  added_by TEXT NOT NULL,
  CHECK ((x IS NULL) = (y IS NULL) AND (x IS NULL) = (position_at IS NULL))
);
CREATE INDEX reaper_kingdom ON reaper (kingdom);
```

## Editor (read only, from existing tables)

`link.alliance_rank` (with `rank_source` `game-api` or `rank-approval`) and `applied.alliance_kingdom` of the caller's
Link. `mayChangeReaper` is true only for `R5` in the Home Kingdom.

## Ranking (memory only)

`RankedExile = { exile, player?: Player, position, distance, stale: boolean }`; `ReaperPages` keeps the ranking (or
the list) per reply for 15 minutes so paging needs no new read.

## Player (changed)

`PlayerDetails.shielded: boolean | undefined` from the Game API's `shielding` (non-zero → true).
