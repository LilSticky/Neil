# Contract: Game API client (changes only)

## Uncharged lookups

```ts
getPlayer(uid, purpose, freshness?: Freshness)                  // default "live"
findPlayer(name, kingdom, purpose, freshness?: Freshness)       // default "live"
getAlliance(kingdom, key, purpose, freshness?: Freshness)       // default "live"
findAlliance(name, purpose, freshness?: Freshness)              // default "live"
```

- `live`: the request path ends with `?fresh=1`.
- `copy`: no query.

## Charged lookups (`chargedTo(caller)`)

Unchanged signatures; always `copy`.

## Found answers

`fetchedAt` is renamed `asOf` and means when the game sent the data.

## Callers

| Caller | Freshness |
|--------|-----------|
| Interview (In-game Proof, Recommended Player), corrections, nickname and roles, Daily Sync, Booty Call | `live` (default) |
| `/reaper closest` (both reads), `/reaper add` pick | `copy` |
| `/player`, `/alliance`, picks, Alliance Overview (charged) | `copy` |
