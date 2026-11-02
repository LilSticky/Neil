# Audit: slice 008 Alliance overview (T001-T004, diff 4fd7e26..HEAD)

Typecheck, test (1456 passed) and lint --quiet: all green.

| Criterion | Test | Status |
|-----------|------|--------|
| US1-1 / FR-001 / FR-002 Overview button, private reply to any Member | lookup-cards.test "Overview button ... for any Member"; pick.test "replies privately ... to any Member" | covered |
| US1-2 / FR-003 members without data excluded | alliance-overview.test (totals, topBy, leastActive, no data); overview-texts.test "leaves a member without data out" | covered |
| FR-002 totals, online now / 24 h, top 5 each, Least Active 5, no-data count | alliance-overview.test; overview-texts.test | covered |
| US1-3 / FR-005 / SC-002 no Game API call while session holds Alliance | pick.test "asking the Game API for nothing" | covered |
| US1-3 / FR-005 lookup again with lookup purpose | pick.test "looks the Alliance up again ... for the lookup" | covered |
| US1-4 try-again private | pick.test "tells the Member privately to try again" | covered |
| US2-1 table page 1 in overview | overview-texts.test "table page" | covered |
| US2-2 / FR-004 25 per page, sort, no data last, paging | alliance-overview.test tablePage; overview-texts.test; pick.test "turns the private overview" | covered |
| FR-004 buttons only for asker | pick.test "another Member ... not theirs" | covered |
| US2-3 "online" / "-" | overview-texts.test | covered |
| FR-006 no uid | overview-texts.test "no uid anywhere" | covered |
| Edge: no data at all | overview-texts "no activity data" (figures); empty-roster table in alliance-overview.test | partial (no test of "table still lists names" with zero data) |
| Edge: markdown escaped, long names cut, limits | overview-texts.test escaping, "cuts long names" | covered |
| Edge: Discord relative timestamps | only indirectly in overview-texts.test | partial |
| FR-005 Quota Reserve kept on lookup | relies on existing "lookup" purpose; no overview-specific test | partial |
| SC-001 two clicks | follows from button + reply | covered |
| T001 roster fields | schemas.test, client.test | covered |
| client routing `overview:` prefix | client.test | covered |

Tasks: T001-T004 ticked and present in code. T005-T007 unticked (expected, not yet done).
Scope creep: none found; changes to lookup.ts, pick-sessions.ts, player.ts are supporting the roster fields and button.
Test-server check: recorded as deferred (T007, TEST-RUN.md section 6d, run later by the user); not yet in tasks.md as done.
