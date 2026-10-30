# Implementation Plan: Look up players within the daily quota

**Branch**: `003-look-up-players-within-the-daily-quota` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-look-up-players-within-the-daily-quota/spec.md`

## Summary

The one `GameApiClient` gains an in-memory cache (≥10 min, in-flight sharing, stale answers when the Daily
Quota is spent), a persisted Daily Quota count that adopts the Game API's own figures and stops at the
limit or after a 429 until 00:00 UTC, and bounded retries on 503/504. Cards show "as of HH:MM UTC";
`/quota` shows Officers (Moderator or King) today's figures without a request. The Daily Quota rules,
the retry pause and the Officer check are pure domain functions. Details: [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/).

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node.js 24 LTS

**Primary Dependencies**: discord.js 14, zod 4; no new dependency

**Storage**: SQLite `neil.db` (ADR 5), migration 2 adds the one-row `daily_quota` table

**Testing**: Vitest; fake `fetch`, fake clock (`now`, `sleep`, `random` injected), in-memory SQLite
(`:memory:` or a temp folder) for the store, fake interactions for `/quota` and the lookups

**Target Platform**: Wispbyte (Linux container); Windows for development

**Project Type**: single-process Discord bot

**Performance Goals**: cached lookup in under 2 s (SC-001); any lookup ends within 20 s, retries included

**Constraints**: never a request when the Daily Quota is spent; at most 3 requests per lookup; count
persisted before each request; key never logged

**Scale/Scope**: one guild, one new command, ≤2,000 requests/day, ≤2,000 cache entries

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Domain-driven slicing | Capability slice; Officer, Daily Quota, Quota Reserve approved in DICTIONARY (2026-10-30) | Pass |
| II. TDD | Every `src/` change test-first; fake clock, fake fetch, fake interactions | Pass |
| III. Framework-free domain | Daily Quota rules, retry pause, Officer check in `src/domain/`, time as a parameter | Pass |
| IV. Respect the Game API | Closes slice 002's deviation: one client caches, counts, persists, stops at the limit and after 429, retries bounded with backoff and jitter | Pass |
| V. Least privilege | No new intent or permission; role IDs in config; `/quota` gated to Officers; nothing personal stored | Pass |
| VI. Context never gets lost | STATUS/ROADMAP per change; GAME-API.md if figures behave unexpectedly | Pass |
| VII. Small vertical slices | Usable on the test server; four stories | Pass |
| Constraints | Role IDs and cache minutes in validated config; deployed from `main` | Pass |

ADR 4 point 3 (per-purpose shares, reserve) is deferred, not contradicted: there is one purpose until
slice 004 (research R10). Post-design re-check (after Phase 1): unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/003-look-up-players-within-the-daily-quota/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── quota-command.md
│   └── lookup-changes.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── daily-quota.ts           # UtcDay, DailyQuota, todaysQuota, canSend, countRequest, adoptReported, …
│   ├── retry.ts                 # retryDelay, MAX_ATTEMPTS
│   ├── officer.ts               # isOfficer
│   └── player.ts                # LookupResult: found.fetchedAt, quota-spent.resetsAt
├── game-api/
│   ├── quota-keeper.ts          # QuotaKeeper: today's DailyQuota, in-flight count, persists via a store port
│   ├── lookup-cache.ts          # LookupCache: entries, freshness, stale reads, in-flight sharing, size cap
│   ├── schemas.ts               # + quota figures (body and headers)
│   └── client.ts                # cache → quota gate → request with retries → adopt figures
├── storage/
│   ├── database.ts              # + migration 2 (daily_quota)
│   └── daily-quota-store.ts     # DailyQuotaStore load/save, zod-checked row
├── discord/
│   ├── commands.ts              # + quota definition
│   ├── quota.ts                 # handleQuota (Officer check → ephemeral figures)
│   ├── lookup-cards.ts          # footer "as of", spent message with time left, time-left formatting
│   ├── lookup.ts                # passes now to the spent message
│   └── client.ts                # routes /quota; member role IDs from the interaction
├── config.ts                    # + DISCORD_MODERATOR_ROLE_ID, DISCORD_KING_ROLE_ID, GAME_API_CACHE_MINUTES
├── startup.ts                   # opens the quota store, hands the QuotaKeeper to the client
└── main.ts                      # wires now/sleep/random and the store
```

**Structure Decision**: the layout from AGENTS.md; no new folders.

## Manual steps for the user

1. Create (or find) the `Moderator` and `King` roles on the test server and put their IDs in `.env`
   as `DISCORD_MODERATOR_ROLE_ID` and `DISCORD_KING_ROLE_ID`.
2. Before the deploy, add both to the Wispbyte panel variables, with the IDs of the server Wispbyte's Neil
   runs against (the test server for now). Neil refuses to start without them.
3. Run `npm run commands:register` once so `/quota` appears.

## Complexity Tracking

No violations.
