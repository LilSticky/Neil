# Implementation Plan: Look up a player

**Branch**: `002-look-up-a-player` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-look-up-a-player/spec.md`

## Summary

Any Member runs `/player uid` or `/alliance kingdom alliance` on the test server and gets a public card,
or a private message when the input is invalid or the Game API cannot answer. Input is validated in the
domain before any request; one `GameApiClient` (key, User-Agent, 15 s timeout, zod validation, status
mapping to a typed `LookupResult`) is the only code that calls the tracker. Tests replay recorded
fixtures. Cache and quota budgeting follow in slice 003, inside the same client. Details:
[research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/).

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node.js 24 LTS

**Primary Dependencies**: discord.js 14, zod 4; global `fetch` (no new dependency)

**Storage**: none new (the start record from slice 001 stays)

**Testing**: Vitest; fake `fetch` replaying fixtures for the client; fake interactions for the command
handlers; pure tests for the domain parsers, the rank rule and the card rendering

**Target Platform**: Wispbyte (Linux container); Windows for development

**Project Type**: single-process Discord bot

**Performance Goals**: card or error within 20 s (SC-001): 15 s request timeout plus Discord round trips

**Constraints**: no request for invalid input; no retries; key never logged; Game API text escaped

**Scale/Scope**: one guild, two new commands, two endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Domain-driven slicing | Capability slice; Kingdom, Alliance, Alliance Rank confirmed in DICTIONARY (2026-10-29) before use | Pass |
| II. TDD | Every `src/` change test-first; fixtures replace the network; Discord via fakes | Pass |
| III. Framework-free domain | Parsers, `Player`/`Alliance` types, rank rule in `src/domain/`, no I/O; zod only in the adapter | Pass |
| IV. Respect the Game API | One client is the only caller, verified endpoints only, bounded timeout, no retry loop. **Caching and quota counting are not in this slice** | Deviation, see Complexity Tracking |
| V. Least privilege | No new intents or permissions; key from env, redacted; no Member-affecting actions; nothing stored | Pass |
| VI. Context never gets lost | STATUS/ROADMAP per change; API findings in GAME-API.md | Pass |
| VII. Small vertical slices | Usable on the test server; three stories | Pass |
| Constraints | IDs and key in config; deployed from `main` | Pass |

Post-design re-check (after Phase 1): unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/002-look-up-a-player/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── lookup-commands.md
│   └── game-api-client.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── lookup-input.ts          # Uid, KingdomNumber, AllianceKey and their parse functions
│   ├── player.ts                # Player, Alliance, AllianceRank, LookupResult types
│   └── alliance-rank.ts         # rankFromRoster()
├── game-api/
│   ├── schemas.ts               # zod schemas for player and alliance bodies
│   ├── client.ts                # GameApiClient: requests, timeout, status mapping, validation → domain
│   └── __fixtures__/            # recorded bodies (+ README for hand-written ones)
├── discord/
│   ├── commands.ts              # + player, alliance definitions
│   ├── lookup-cards.ts          # renderPlayerCard, renderAllianceCard, lookup messages
│   ├── lookup.ts                # handlePlayer, handleAlliance (validate → defer → client → edit/follow up)
│   ├── client.ts                # routes commands by name
│   └── __fakes__/               # + fake lookup interaction
├── config.ts                    # + LAP_TRACKER_API_KEY (required)
├── startup.ts                   # + key in redacted secrets, client handed to connect
└── main.ts                      # builds the GameApiClient
scripts/
└── record-fixtures.ts           # records fixtures from the live Game API (manual)
```

**Structure Decision**: the layout from AGENTS.md; `src/game-api/` is created now.

## Manual steps for the user

1. Add `LAP_TRACKER_API_KEY` to the Wispbyte panel variables before deploying (Neil refuses to start
   without it).
2. Check the tracker's Patreon link: on 2026-10-29 the key still reported `limit 1000, patron false`.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| IV: the client neither caches nor counts quota in this slice | The roadmap puts cache and quota budget in slice 003 so each slice stays small (VII) | Building both now doubles the slice. Risk is bounded: Neil is only on the test server, every lookup is a deliberate command (no automatic calls), invalid input costs nothing, there are no retries, and a 429 is reported, not retried. Slice 003 must land before Neil joins the production server. |
