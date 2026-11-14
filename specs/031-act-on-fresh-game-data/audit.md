# Audit: 031 Act on fresh game data

Branch 031-act-on-fresh-game-data vs spec.md and tasks.md (2026-11-14).

## Requirements and scenarios

| Item | Covering test(s) | Status |
|------|------------------|--------|
| US1-1 Interview proof live | interview.test.ts "looks the uid up live", corrections.test.ts (live), client.test.ts `?fresh=1` default | covered |
| US1-2 Daily Sync / nickname roles live | daily-sync.test.ts "reads the roster and the Player of the sync live"; name-and-roles.test.ts "reads the Player ... live" | covered |
| US1-3 Booty roster live | booty-call.test.ts "the roster's Player is read live" (checks the Player read; the roster read is assumed to share the path) | covered (verify roster read) |
| US1-4 Recommended Player live | interview.test.ts "looks the Recommended Player up live" | covered |
| US1-5 old copy not used for acting | lookup-cache.test.ts "get with a live lookup"; client.test.ts cache rules | covered |
| US1-6 live entry within TTL, no request | lookup-cache.test.ts, client.test.ts (same-asOf cache test) | covered |
| US2-1 footer "as of 12:00" | lookup-cards.test.ts footer tests (asOf), client.test.ts 7200 s age to asOf | covered (no single 7,200 s card test, covered in two parts) |
| US2-2 older-day footer | lookup-cards.test.ts earlier-day footer | covered |
| US2-3 REAPER records read time | reaper.test.ts, reaper-closest.test.ts (asOf) | covered |
| US2-4 showing lookups not live | reaper.test.ts "copy" (lines 189, 199, 398); pick.test.ts 1493 | covered for REAPER and /reaper add. `/player`, `/alliance`, picks and Overview have no explicit "copy" assertion | partial |
| US3-1 GAME-API.md | GAME-API.md lines 21-52 | covered |
| FR-001 | tests above plus corrections, Link, Rank | covered (Rank Approval and Officer Link: no explicit live assertion found) partial |
| FR-002 | REAPER, pick tests only | partial |
| FR-003 | client.test.ts 2113-2130 (age, unusable ages) | covered |
| FR-004 | lookup-cards, reaper tests | covered |
| FR-005, FR-006 | lookup-cache.test.ts, client.test.ts | covered |
| FR-007 | no dedicated test of "one request per call"; client tests assert single request incidentally | partial |
| FR-008 | documentation/GAME-API.md (60 min, 44 h, age_seconds, refreshing, cached, cache_seconds, fresh=1, x-cache, gzip, 2,000) | covered (doc) |
| Edge: no age / negative age | schemas.test.ts 542-570, client.test.ts 2113+ | covered |
| Edge: live and copy at once send two requests | client.test.ts (per T008) | covered |

## Tasks

- Unticked but done: T002 (schemas.test.ts age_seconds tests exist), T004 (client.test.ts fresh=1 default, live, copy tests exist), T006 (client.test.ts asOf from age tests exist).
- Ticked but not done: none found.
- T012 ticked; its own text says it is covered by existing footer tests, no new 2-hour card test.
- Open and expected: T014 (bot-reviewer), T015 (this audit, STATUS and ROADMAP), T016 (manual check after deploy).

## Scope creep

None found. The large fake and test churn is the asOf rename (T001).

## Test-server check recorded

No in tasks.md except T016 (open, needs the deploy). Definition of Done 2 still outstanding.

## Gates

- typecheck: pass.
- lint --quiet: pass.
- test: full run 3699 pass, 1 flaky timeout (interview.test.ts uid modal) plus event-store timeout, both pass on rerun (185/185). Load-related, not caused by the slice.

## Resolution (2026-11-14)

- `/player`, `/alliance`, picks and the Overview go only through `chargedTo`, which `client-charged.test.ts` proves
  never sends `?fresh=1`.
- Rank Approval and the Officer Link read through `corrections.ts` and nickname-and-roles, both guarded as live.
- The Booty Call's Player read is its roster read (the roster comes with the Player, slice 026).
- FR-007: every client test counts requests per call; a live call is one request like any other.
- T002, T004, T006 ticked; T014, T015 done; T016 (manual) open until the deploy.
