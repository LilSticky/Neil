# Audit: 009 Keep roles in sync (f7d8368..HEAD)

Typecheck: pass. Test: 55 files, 1559 passed. Lint (--quiet): pass.
Tests: D = src/discord/daily-sync.test.ts, M = src/domain/daily-sync.test.ts.

| Criterion | Covering test(s) | Status |
|---|---|---|
| US1.1 one roster per Alliance | D "reads one roster per Alliance..."; M planSync grouping | covered |
| US1.2 uid lookup for leavers / no Alliance | D "looks up by uid ... no longer in the roster", "... in no Alliance" | covered |
| US1.3 changes applied and logged | D promoted rank, Player Name, sanctuary level, moved Kingdom | covered (Alliance move to another tag only via Kingdom/rank-drop tests) |
| US1.4 no change, no log | D "logs nothing for a Member..." | covered |
| US1.5 hand nickname restored | D "restores a nickname..." | covered |
| US1.6 approved rank stays / Game API rank wins | D keeps / uses; M rankAfterSync | covered |
| US1.7 moved, rank unknown: drop, log for Officers | D "drops an approved rank..."; M | covered |
| US2.1 share stop, left-over first next day | D "stops at the Sync Share..."; M left-over first | covered |
| US2.2 Quota Reserve stop | D "sends no request when ... Quota Reserve"; quota-keeper/daily-quota tests | covered |
| US2.3 restart rules | D startDailySync (once/day, missed hour, restart); M isDue | covered |
| Edge: not on server | D "skips a Linked Member who is not on the server" | covered |
| Edge: roster fails, uid fallback | D "looks up by uid each Member of an Alliance whose roster..." | covered |
| Edge: not found by uid, once, Link kept | D "logs a Player the Game API does not find..." | covered |
| Edge: Discord permission/hierarchy | none in daily-sync tests (relies on slice 006 name-and-roles tests) | partial |
| Edge: summary counts | D "ends with a summary..." | covered |
| FR-001 hour, day recorded | config.test.ts, D schedule + "records the UTC day", daily-sync-store.test.ts | covered |
| FR-002 | see US1.1, US1.2 | covered |
| FR-003 | D nickname/role tests | covered |
| FR-004 | M rankAfterSync, D rank tests | covered |
| FR-005 | D share/reserve tests, config.test.ts | covered |
| FR-006 | D log + summary tests | covered |
| FR-007 no approvals/unlink/Link removal | no test | missing (no code path found either; negative test absent) |
| SC-001 | follows from US1.3 + schedule | covered (indirect) |
| SC-002 | D share and reserve tests | covered |
| SC-003 (100 Members, 10 Alliances, <= 10 + movers) | M grouping only; no 100/10 cost test | partial |

## Tasks
T001-T007 ticked and present in the diff. T008 is ticked but ROADMAP.md and the ADR 4 note are NOT in the diff (HOSTING, STATUS, TEST-RUN, env.example are). T009, T010 open (expected).

## Scope creep
None found. Extras (schema-v6 fixture, test fake files) support the tasks.

## Test-server check recorded
No. tasks.md has no test-server check line (T010 defers the manual check to TEST-RUN.md §6e, run later by the user). Definition of Done 2 not yet satisfied.
