# Audit: 011 Correct a link

Auditor: `spec-auditor` (2026-11-02), `git diff 010-say-goodbye...HEAD` (41 files). Checks: typecheck, lint and 1751
tests pass.

## Criteria and covering tests

| Criterion | Status |
|-----------|--------|
| US1-1 Link ends, uid free, Managed Roles removed, nickname cleared (FR-001, FR-002, SC-001) | covered (unlink.test, corrections.test) |
| US1-2 one log line naming the Officer (FR-003, SC-002); one private message, refusal harmless (FR-004) | covered |
| US1-3 waiting approvals handed on; own pending approval cancelled with a thread message | covered |
| US1-4/5 not Linked, not an Officer: private refusals (FR-009) | covered |
| US1-6 hand-changed nickname left alone | covered |
| US2-1/2 self Unlink, log says "themselves", reply carries the result; not Linked | covered |
| US2-3 `/interview` afterwards starts a new Interview | partial (FR-005 side tested) |
| US3-1…6 rank by an Officer: stored, replaced, re-applied, logged, pending settled, game-rank note, refusals | covered |
| US4-1…6 Officer Link: stored with the Officer, Interview ended, name and roles, log, refusals, Rank Approval | covered |
| FR-010 Unlinks use no Game API | covered (by construction) |
| FR-010 `/link` one lookup, Quota Reserve | covered |
| FR-010 `/rank` at most one lookup from the lookup share | partial (not asserted) |
| FR-011 005 FR-008 narrowed | covered (doc) |
| SC-001…SC-004 | covered |
| Edge: Member not on the server; role Neil cannot remove; two Officers at once | covered |
| Edge: log channel fails for `/rank` and `/link` | partial |
| Edge: Interview thread gone when an Officer Link ends it | missing |
| Routing and command definitions | covered (client.test, commands.test) |

## Tests without a criterion

None out of scope; minor guards (role removal before Link removal, non-digit uid, expired or foreign Confirm, same-rank
note) are sensible.

## Gaps

1. No test that `/interview` starts a new Interview after an Unlink (US2-3, last edge case).
2. No test for "Interview thread is gone when an Officer Link ends it: the Link still happens".
3. No test that `/rank` and `/link` survive a failing log channel.
4. FR-010 lookup count for `/rank` not asserted.
5. ~~commands.test has no assertion for the three commands~~ (wrong: commands.test.ts:122–205 covers them).
6. T009 and T010 open; the test-server check (TEST-RUN.md §6g) is collected, not run.
