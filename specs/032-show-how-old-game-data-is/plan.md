# Implementation Plan: Show how old game data is

**Branch**: `032-show-how-old-game-data-is` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/032-show-how-old-game-data-is/spec.md`

## Summary

A Player's "as of" becomes their **map time** (`map_updated_at`, the last Map Refresh that changed them); an Alliance has
none. `LookupResult`'s found `asOf` turns into `Date | undefined`; the client reads it from the player body and no longer
from `age_seconds`. **Freshness** keeps its two values but changes meaning: `copy` (the default everywhere) may be
answered from Neil's cache within the cache window and asks the tracker without `?fresh=1`; `live` (only the
🔄 Look again button) skips Neil's cache and asks with `?fresh=1`. The cache loses `liveUsable`. A pure domain rule says
when data is old (unknown, or more than 5 minutes before now) and builds the tracker's map link of a Kingdom. Lookup cards
(`/player`, `/alliance`, picks, Alliance Overview, `/reaper closest`) render a "Newer data" field with the steps and the
link, plus a 🔄 Look again button whose custom id carries the owner and the target, so it works without a session. The
button repeats the lookup live, charged like the original (REAPER uncharged, as today), and updates the message in place.

## Technical Context

**Language/Version**: TypeScript (strict), Node 24 (ADR 2)

**Primary Dependencies**: discord.js, zod (unchanged)

**Storage**: none touched; REAPER's `readAt` keeps its column, its value becomes the map time (no migration)

**Testing**: Vitest with the fake fetch (`src/game-api/__fakes__`) and the Discord fakes (`src/discord/__fakes__`)

**Target Platform**: Wispbyte (Linux), developed on Windows

**Project Type**: Discord bot

**Performance Goals**: unchanged; a Look again press defers at once (3-second rule, DISCORD-PLATFORM.md)

**Constraints**: constitution IV: one client; a live request costs one request like a copy; Neil does not call the
tracker's website endpoints

**Scale/Scope**: client, schemas, cache, one new domain module, card renderers, one new button route, six callers lose
their implicit `live`

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what Members get: they see how old game data is and how to get newer. Pass |
| II. TDD | Every behaviour change starts with a failing test (tasks). Pass |
| III. Framework-Free Domain | `isOld` and `mapPageOf` live in `src/domain/data-age.ts`, pure; the body is parsed in the adapter. Pass |
| IV. Respect the Game API | Fewer live requests (only on a press); no new endpoint; the Look again press is charged and quota-checked like a lookup. Pass |
| V. Least Privilege | No new permission or intent; only the owner can press the button. Pass |
| VI. Context Never Gets Lost | DICTIONARY (Map Refresh, done), GAME-API.md, STATUS, ROADMAP updated. Pass |
| VII. Small Vertical Slices | One capability, no migration, no new command. Pass |

Re-checked after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/032-show-how-old-game-data-is/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/discord-texts.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/domain/data-age.ts             new: isOld, mapPageOf, MAP_TIME_FRESH_MS
src/domain/player.ts               Freshness doc; LookupResult found asOf: Date | undefined
src/game-api/schemas.ts            map_updated_at on the player body (lenient)
src/game-api/client.ts             asOf from map_updated_at; Alliance asOf undefined; default freshness "copy"; live skips the cache
src/game-api/lookup-cache.ts       no liveUsable; get(key, now)
src/discord/lookup-cards.ts        footerFor(asOf | undefined); newerDataField; lookAgainButton
src/discord/look-again.ts          new: custom id format, owner check, repeat the lookup live, update the message
src/discord/lookup.ts, pick.ts, pick-sessions.ts, overview-texts.ts, reaper.ts, reaper-texts.ts   cards carry field and button
src/discord/client.ts              route the `again:` prefix; wire the handler
documentation/GAME-API.md, STATUS.md, ROADMAP.md
```

**Structure Decision**: existing layout; one new domain module and one new Discord handler module.

## Complexity Tracking

None.
