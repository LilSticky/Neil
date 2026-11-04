# Audit: slice 014 (T013), against spec.md, contracts/reaper-command.md and tasks.md

Typecheck: green. Tests: 2257 passed (70 files). Lint (--quiet): green. List page size 8 accepted as deliberate (embed limit; contract and TEST-RUN 6j.8 already say 8).

## Criteria -> tests

| Criterion | Test(s) | Status |
|---|---|---|
| US1.1 / FR-001-003 add by Home R5 | reaper.test "stores a found Player..."; "confirms privately..."; reaper-store.test add/survives reopening | covered |
| US1.2 pick list | reaper.test "opens a private pick list... carrying the reason"; "looks the picked Player up by uid..." | covered |
| US1.3 already an Exile | reaper.test "says an Exile already on REAPER..."; store "second add... already" | covered |
| US1.4 / FR-003 refused, no request | reaper.test "refuses a Member who may not change REAPER, before any Game API request"; exile.test mayChangeReaper (8); reaper-editor.test (7) | covered |
| US1.5 no reason / unknown name | reaper.test "refuses a blank reason", "says no Player has that name"; exile.test reason 1-200 | covered (a 201-character reason is tested in the domain only, not through the handler) |
| US1.6 / FR-006 log line on add | reaper.test "posts one log line..." | covered |
| US2.1 / FR-007-009 3 closest with card, coords, distance, reason, date | reaper-closest.test (Linked position, "each of the 3 closest", "player card as /player shows it", "never shows the Member who added") | covered |
| US2.2 x/y | reaper-closest.test "measures from x and y"; "x only / y only" asks both | covered |
| US2.3 fewer than 3 / none | "fewer than 3"; "No Exiles in Kingdom N" | covered |
| US2.4 other Kingdoms only | exile.test other Kingdom; reaper-closest "Kingdom of the caller's Linked Player", "moved to" | covered |
| US2.5 / FR-010 shielded left out, else note | exile.test shielded/unknown; closest header and "all of them shielded" tests | covered (adapter test of the `shielded` mapping is in game-api schema tests, not re-checked here) |
| US2.6 / SC-004 cache 10 min, no new request | none in reaper tests; relies on the caching client (game-api client.test) | partial: no reaper-level test that a repeat lookup costs no extra request |
| US2.7 all:true paged, no extra requests | closest "with all:true" block (page 1, buttons, owner redraw with no request, other Member refused, expiry) | covered |
| FR-011 / SC-005 lookup budget, never Quota Reserve | tests pass `lookup` kind implicitly; quota-spent tests (ranks by stored positions, usual text) | partial: no assertion that closest/add request with priority `lookup` |
| FR-011 unreadable Exile ranked by last position with date | exile.test fallback stale; closest "marks an Exile that could not be read" | covered |
| US3.1-3 remove, not an Exile, refusal | reaper-remove.test (refusal, removes+log, others kept, unknown uid, non-uid) | covered |
| US3.4 / FR-005 autocomplete, no request | reaper-remove.test autocomplete (4 tests) | covered (no-request not asserted explicitly) |
| US4 / FR-012 list | reaper-list.test (no request, newest first, fields, empty, 8 per page, embed fits, buttons, owner only, unavailable) | covered |
| Edge: not Linked | closest "asks for x and y", "Home Kingdom" | covered |
| Edge: moved Kingdom / renamed / refresh | closest "stores the Kingdom an Exile moved to", "stores the name, Kingdom and position"; store refresh | covered |
| Edge: cannot be read, none ever positioned | exile.test; closest "none of them could be read" | covered |
| Edge: caller's own Player unreadable; caller is an Exile; ties | closest "cannot be read"; exile.test "caller's own Exile", "equal distance" | covered |
| Edge: R5 loses rank | reaper-editor.test (rank taken at ask time from Link and Applied State) | covered |
| FR-013 dictionary terms | reaper-texts.ts reviewed by eye; no test | partial |
| SC-001 one command + one pick | add + pick tests | covered |
| SC-002 under 10 s | not testable; manual 6j.5 | manual |
| SC-003 only Home R5 | domain + editor + handler refusal tests (add and remove) | covered |
| SC-006 adder never named | closest, list, add confirmation tests | covered |
| Contract: routing, custom ids | client.test (4 subcommands, autocomplete); reaper-pages.test (ids, 15 min, 500) | covered |

## Tasks

- T001-T011 ticked and their code exists (exile.ts, reaper-store.ts, reaper-editor.ts, reaper*.ts, client routing, docs). None ticked but missing.
- T012 (bot-reviewer, review.md), T013 (this audit) and T014 unticked. No review.md in the folder yet.

## Tests covering nothing in the spec

None found. Page-id and session-capacity tests (reaper-pages.test) support the contract's custom ids and the 15 min / 500 design (plan D6), not a spec criterion directly; acceptable.

## Manual check

TEST-RUN.md 6j exists (9 rows 6j.1-6j.9) and matches the contract (8 per page). It covers 6j.2 pick, 6j.4 refusal, 6j.6 cache. Not yet run (T014, by the user). Not covered by a row: a Member without a Link (x and y required) and the shield note on a non-zero `shielding`.

## Test-server check recorded in tasks.md

NO. tasks.md has no Definition of Done 2 entry; only T014 points to the TEST-RUN.md section. Add one before merge.

## Gaps to close

1. Reaper-level test that a second `closest` within 10 minutes makes no further request (US2.6, SC-004), or note it as covered by the client cache test.
2. Assert the `lookup` priority (never the Quota Reserve) for add and closest (FR-011, SC-005).
3. Optional: handler test for a 201-character reason on `add`.
4. Record the test-server check in tasks.md; tick T012-T014 as they finish.
