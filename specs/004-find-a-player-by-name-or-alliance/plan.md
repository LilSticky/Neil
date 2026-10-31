# Implementation Plan: Find a player by name or alliance

**Branch**: `004-find-a-player-by-name-or-alliance` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-find-a-player-by-name-or-alliance/spec.md`

## Summary

`/player` gains `name` (and `kingdom`) beside `uid`; `/alliance` gains `name` beside Kingdom and tag. The one
`GameApiClient` gets `findPlayer` and `findAlliance` on the verified name endpoints, cached like uid lookups, and
reads the Alliance Roster from alliance bodies. "Several matches" answers become a private pick list; the
Alliance card lists the roster by rank with uids and carries a paged select menu that opens a member's card.
Pick lists live in an in-memory session store with an owner check and a 15-minute life. Every request now
carries a purpose; lookups stop when only the Quota Reserve (100, configurable) is left, and `/quota` shows it.
Details: [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/).

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node.js 24 LTS

**Primary Dependencies**: discord.js 14 (select menus, buttons), zod 4; no new dependency

**Storage**: no change (SQLite `neil.db` keeps the Daily Quota row); pick sessions are memory only

**Testing**: Vitest; fake `fetch` with recorded bodies (name answers, 409 match list, alliance with
`members`), fake clock, fake chat-input and component interactions

**Target Platform**: Wispbyte (Linux container); Windows for development

**Project Type**: single-process Discord bot

**Performance Goals**: name lookup to card within 20 s (one request, or two with a pick); page turns
instant and free

**Constraints**: lookups never below the Quota Reserve; no request from a component used by a non-owner;
custom ids ≤ 100 chars; embed ≤ 6,000 chars, field ≤ 1,024, select menu ≤ 25 options

**Scale/Scope**: one guild, rosters ≤ 100 Players, ≤ 500 open pick sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Domain-driven slicing | Capability slice; Player Name and Alliance Roster approved in DICTIONARY (2026-10-30); Quota Reserve already approved | Pass |
| II. TDD | Every `src/` change test-first; recorded bodies, fake interactions and clock | Pass |
| III. Framework-free domain | PlayerName, roster order, reserve rule, match helpers in `src/domain/`; sessions and custom ids in the Discord adapter | Pass |
| IV. Respect the Game API | All new endpoints through the one client: cached, counted, reserve-aware; page turns and non-owner clicks cost nothing | Pass |
| V. Least privilege | No new intent or permission (component interactions arrive with `Guilds`); nothing personal stored; sessions hold uids and names from public game data for 15 min | Pass |
| VI. Context never gets lost | STATUS/ROADMAP per change; GAME-API.md gains the alliance-name 409 shape when seen | Pass |
| VII. Small vertical slices | Three stories, each usable on the test server | Pass |
| Constraints | `GAME_API_QUOTA_RESERVE` in validated config | Pass |

ADR 4 point 3 (a reserve for interactive work) is implemented as written; no new ADR (research R11).
Post-design re-check (after Phase 1): unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/004-find-a-player-by-name-or-alliance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── commands.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── lookup-input.ts          # + PlayerName, parsePlayerName
│   ├── alliance-rank.ts         # + rankFromLabel, sortRoster
│   ├── player.ts                # + RosterEntry, Alliance.roster, reserve-kept, match helpers
│   └── daily-quota.ts           # + RequestPurpose, canSendFor, leftForLookups
├── game-api/
│   ├── schemas.ts               # + alliance members[]
│   ├── quota-keeper.ts          # reserve option; tryCount(purpose) with the refusal reason
│   └── client.ts                # + findPlayer, findAlliance, purpose on every method, roster mapping
├── discord/
│   ├── commands.ts              # new options on /player and /alliance
│   ├── pick-sessions.ts         # PickSessions, isOwner, pageOf, custom ids
│   ├── lookup-cards.ts          # roster fields, pick-list and roster components, new texts
│   ├── lookup.ts                # option combinations, name flows, private pick lists
│   ├── pick.ts                  # component handler: owner, expiry, page turn, pick → card
│   ├── quota.ts                 # reserve line
│   └── client.ts                # routes select menus and buttons with the pick: prefix
├── config.ts                    # + GAME_API_QUOTA_RESERVE
├── startup.ts                   # reserve into QuotaKeeper; warning when reserve ≥ limit
└── main.ts                      # wires the session store
```

**Structure Decision**: the layout from AGENTS.md; no new folders.

## Manual steps for the user

1. After the merge, run `npm run commands:register` once so the new options appear.
2. Optional: set `GAME_API_QUOTA_RESERVE` in `.env` and the Wispbyte panel; without it the reserve is 100.

## Complexity Tracking

No violations.
