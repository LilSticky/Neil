# Data Model: Find a player by name or alliance

Domain types live in `src/domain/` (pure); adapter types in `src/game-api/` and `src/discord/`. Names follow
[DICTIONARY.md](../../documentation/DICTIONARY.md). Nothing new is persisted.

## Domain

### PlayerName (`lookup-input.ts`)

- Brand `string & { __brand: "PlayerName" }`, only `parsePlayerName(input)` makes one.
- Rules: trimmed; 1–32 characters; not only dots. Otherwise `{ ok: false }`.

### RosterEntry, Alliance (`player.ts`)

- `RosterEntry { uid: Uid; name: string; allianceRank: AllianceRank }`; `name` is "Unknown" when the Game
  gave none (set in the adapter).
- `Alliance` gains `roster: readonly RosterEntry[]` (may be empty).

### sortRoster, rankFromLabel (`alliance-rank.ts`)

- `rankFromLabel(label: string | null): AllianceRank` — "R1"–"R5", else unknown; `rankFromRoster` uses it.
- `sortRoster(entries)`: R5, R4, R3, R2, R1, unknown; then name compared case-insensitively; then uid.
  Returns a new array.

### Match (`player.ts`)

- Unchanged (`tag?`, `name?`, `kingdom?`, `uid?`). New pure helpers:
  - `pickablePlayerMatch(match)`: has `uid` and `kingdom`.
  - `pickableAllianceMatch(match)`: has `tag` and `kingdom`.
  - `orderMatches(matches)`: by Kingdom, then name; at most 25 kept, plus the count left out.

### RequestPurpose and the Quota Reserve (`daily-quota.ts`)

- `type RequestPurpose = "lookup" | "onboarding-interview"`.
- `canSendFor(q, purpose, reserve)`: `canSend(q)` and, for `"lookup"`, `remaining(q) > reserve`.
- `leftForLookups(q, reserve) = max(0, remaining(q) − reserve)`.
- `reserve` is a whole number ≥ 0 (from config; the domain takes it as a parameter).

### LookupResult (`player.ts`)

- New kind `{ kind: "reserve-kept"; resetsAt: Date }`: a lookup refused because only the Quota Reserve is
  left. Served from a stale cache entry when there is one, like `quota-spent`.

## Game API client (`src/game-api/`)

| Method | Endpoint | Cache key | Answers |
|--------|----------|-----------|---------|
| `getPlayer(uid, purpose)` | `/players/{uid}` | `player:{uid}` | unchanged + `reserve-kept` |
| `findPlayer(name, kingdom \| undefined, purpose)` | `/players/name/{name}` or `/players/{kingdom}/{name}` | `player-name:{kingdom\|*}:{lower name}` | `found` Player, `ambiguous` matches, failures |
| `getAlliance(kingdom, tag, purpose)` | `/alliances/{kingdom}/{tag}` | unchanged | Alliance with roster |
| `findAlliance(name, purpose)` | `/alliances/name/{name}` | `alliance-name:{lower name}` | `found` Alliance, `ambiguous` matches, failures |

- `QuotaKeeper` takes `reserve` in its options; `tryCount(purpose)` uses `canSendFor`. A refused lookup
  returns `undefined` plus the reason (`"spent"` or `"reserve"`), so the client answers `quota-spent` or
  `reserve-kept`.
- Name caches store a found value or a match list; failures are not cached (slice 003).

## Discord adapter (`src/discord/`)

### PickSession (`pick-sessions.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | random, short (≤ 16 chars) |
| `ownerId` | string | the Member who ran the command |
| `createdAt` | Date | injected clock |
| `choice` | `players` (matches with uid) · `alliances` (matches with Kingdom and tag) · `roster` (sorted entries) | |
| `page` | number | roster only; 0-based |

- Lifetime 15 minutes; at most 500 sessions, oldest dropped. Memory only.
- `PickSessions.open(…) → id`, `get(id, now) → session | "expired"`, `turnPage(id, page)`.
- Pure helpers: `isOwner(session, userId)`, `pageOf(entries, page)` (25 per page, page clamped),
  `pageCount(entries)`.

### Custom ids

`pick:{sessionId}:select` for select menus, `pick:{sessionId}:page:{n}` for page buttons. Anything else that
starts with `pick:` but does not parse answers "run the command again".

## Configuration (`config.ts`)

| Variable | Rule | Default |
|----------|------|---------|
| `GAME_API_QUOTA_RESERVE` | whole number ≥ 0 | 100 |
