# Audit: 032 Show how old game data is

Date: 2026-11-15. Branch `032-show-how-old-game-data-is` vs `main`.

## Results
- `npm run typecheck`: clean. `npm run test`: 110 files, 3816 tests passed. `npm run lint -- --quiet`: clean.

## Coverage
| Requirement / scenario | Covering tests | Status |
|---|---|---|
| US1-1, FR-001 (as of = map time) | client.test.ts, lookup-cards.test.ts, schemas.test.ts | covered |
| US1-2 (earlier day shows day and month) | lookup-cards.test.ts (footer, unchanged behaviour) | covered |
| US1-3, FR-003 (REAPER stores map time) | reaper.test.ts, reaper-closest.test.ts | covered |
| US1-4 (unusable map time: no as of, old) | schemas.test.ts (null/neg/NaN), data-age.test.ts, lookup-cards.test.ts | covered |
| US2-1, FR-005 (hint and link) | data-age.test.ts (mapPageOf), lookup-cards.test.ts, lookup.test.ts | covered |
| US2-2 (2 min old: none) | data-age.test.ts, lookup.test.ts | covered |
| US2-3, FR-002 (Alliance: no as of, hint and button) | overview-texts.test.ts, lookup.test.ts, pick.test.ts | covered |
| US2-4, FR-006, FR-007 (live press, charged) | look-again.test.ts | covered |
| US2-5 (allowance spent, old card stays) | look-again.test.ts | covered |
| US2-6 (REAPER, picks) | reaper-closest.test.ts, pick.test.ts | covered |
| FR-004 (threshold, unknown age) | data-age.test.ts (exactly 5 min, +1 ms, future) | covered |
| FR-008 (owner only) | look-again.test.ts | covered |
| FR-009, FR-010, US3-1..4 (no live outside button; cache) | client.test.ts, lookup-cache.test.ts, interview/daily-sync/booty-call/corrections/name-and-roles tests | covered |
| FR-011 (no hint or button on Interview etc.) | no direct negative assertion | partial (implied by no code path) |
| FR-012 (GAME-API.md) | docs; GAME-API.md has the slice-032 paragraph | done in docs, task unticked |
| Edge: future/missing/zero/negative map time | data-age.test.ts, schemas.test.ts | covered |
| Edge: Player without Kingdom | data-age.test.ts (mapPageOf undefined) | covered (card-level not checked) |
| Edge: other Member presses | look-again.test.ts | covered |
| Edge: press long after / restart | stateless custom id; custom-id tests | covered by design |
| Edge: live request fails | look-again.test.ts (Player throw; Alliance not-found) | covered for Player, partial for Alliance/Overview throw |
| Edge: paged Alliance card -> first page | look-again.test.ts ("first page") | covered |
| Edge: name lookup 409 on press | none (button uses uid/kingdom+tag ids, so no name lookup) | n/a (not reachable) |

## Gaps
- No test asserts the absence of hint/button on Interview, corrections, Daily Sync and Booty Call replies (FR-011).
- Alliance and Overview buttons: thrown Game API error path not tested (only not-found and allowance).
- No card-level test for the Kingdom-less hint on a Player card.

## Tasks
- T001-T015 ticked and present in code.
- T016: unticked, but commit "docs: slice 032 in GAME-API, ROADMAP and STATUS (T016)" exists and GAME-API.md has the text; tick it.
- T017 (review.md, audit.md): open; this file is the audit part.
- T018 (manual test-server check per quickstart.md): open, so the test-server check is NOT recorded yet (Definition of Done 2).

## Possible scope creep
None found; all new tests map to spec items.
