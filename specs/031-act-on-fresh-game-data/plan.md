# Implementation Plan: Act on fresh game data

**Branch**: `031-act-on-fresh-game-data` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/031-act-on-fresh-game-data/spec.md`

## Summary

The tracker now answers from its own copy, possibly days old, unless asked for live data with `?fresh=1`. The Game API
client learns a **Freshness** per uncharged lookup: `live` (the default, for every lookup Neil acts on) or `copy`
(REAPER). Charged lookups (`/player`, `/alliance`, picks, the Alliance Overview) are always `copy`. Every found answer
carries `asOf`, the moment the game sent its data (received − `age_seconds`); today's `fetchedAt` is renamed to it, so
cards, the Overview and REAPER show the real age without further change. Neil's cache stores both moments: a `copy`
lookup reuses an entry stored within the cache window, a `live` lookup only one whose `asOf` is within it. GAME-API.md
records the verified update.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22

**Primary Dependencies**: discord.js, zod (unchanged)

**Storage**: none touched (no migration)

**Testing**: Vitest with the fake fetch and fakes in `src/game-api/__fakes__` and `src/discord/__fakes__`

**Target Platform**: Wispbyte (Linux), developed on Windows

**Project Type**: Discord bot

**Performance Goals**: showing lookups as fast as the tracker's copy; live lookups within the existing 15 s timeout

**Constraints**: constitution IV: one client, quota unchanged (a live request costs one request)

**Scale/Scope**: the Game API client, its schemas and cache, six callers, one rename across `src/`

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what Members get: Neil acts on fresh data. Pass |
| II. TDD | Every behaviour change starts with a failing test (tasks). The rename is a refactor under green tests. Pass |
| III. Framework-Free Domain | `Freshness` and `asOf` live in `src/domain/` as plain types; the age is computed in the adapter. Pass |
| IV. Respect the Game API | Still one client; no extra requests; the cache now also refuses entries too old for an acting lookup. Pass |
| V. Least Privilege | Nothing changes on permissions; acting on current data reduces wrong roles. Pass |
| VI. Context Never Gets Lost | GAME-API.md, STATUS, ROADMAP updated. Pass |
| VII. Small Vertical Slices | One capability, no migration, no command. Pass |

Re-checked after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/031-act-on-fresh-game-data/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/game-api-client.md
└── tasks.md
```

### Source Code (repository root)

```text
src/domain/player.ts            # LookupResult: fetchedAt → asOf; Freshness type
src/game-api/schemas.ts         # optional, lenient age_seconds on player and alliance bodies
src/game-api/lookup-cache.ts    # entries keep storedAt and asOf; get(key, now, freshness)
src/game-api/client.ts          # freshness on uncharged lookups; ?fresh=1; asOf from age; flight key holds freshness
src/discord/reaper.ts, pick.ts  # REAPER passes "copy"
src/discord/*                   # rename only (cards, overview, reaper rows already use the answer's time)
documentation/GAME-API.md       # the update
```

**Structure Decision**: single project, existing layout.

## Complexity Tracking

None.
