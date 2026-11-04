# Audit: slice 013 (T011), against spec.md and tasks.md

Typecheck: green. Tests: 2084 passed (61 files). Lint (--quiet): green. T009 and T012 ignored as instructed.

## Criteria -> tests

| Criterion | Test(s) | Status |
|---|---|---|
| US1.1 create role without permissions, give it | member-roles.test "creates the named role once, with no permissions..."; onboarding-role.test give "gives ... creating it once" | covered |
| US1.2 existing role given, Interview starts | member-roles.test "gives the existing permission-free role"; interview.test "gives the Onboarding Role ... before the thread opens" | covered |
| US1.3 role with permissions refused, logged, Interview still starts | member-roles.test "refuses an existing role that grants permissions"; onboarding-role.test "logs a skip once..." | partial: no interview.test where the role service skips/fails and the thread still opens |
| US1.4 bot gets nothing | interview.test "gives nothing to a bot account" | covered |
| US2.1 Interview Link takes role off | interview.test "takes the Onboarding Role off the Member once the Link is stored" | covered |
| US2.2 Officer Link takes role off | corrections.test "Confirm takes the Onboarding Role off the Member it Links" | covered |
| US2.3 pending Rank Approval, role still removed | interview.test "...with a pending Rank Approval too"; corrections.test "...too when a Rank Approval is pending" | covered |
| US2.4 hand-off keeps role | interview.test "a hand-off does not take the Onboarding Role off the Member" | covered |
| US3.1 / US3.2 Unlink by Officer / by Member gives role | unlink.test test.each "gives the Onboarding Role back ... when %s Unlinks" (+ ordering test) | covered |
| US3.3 left gives nothing | unlink.test "does not give the Onboarding Role back when the reason is %s" | covered |
| US4.1 / 4.2 / 4.3 startup give / take off / no change | onboarding-role.test atStartup (3 tests); connect.test (2 tests) | covered |
| US4.4 one failure does not stop others, logged | onboarding-role.test "a failure for one Member is logged..." | covered |
| US4 bots skipped; failed listing logged once | onboarding-role.test "leaves a bot alone...", "a failed listing..." | covered |
| US5.1 Link without pending RA deletes thread | interview.test "deletes the thread with no last message...", corrections.test "Confirm deletes the Interview thread..." | covered |
| US5.2 pending RA keeps thread until it ends, then deleted | interview.test "a Player with an unknown rank does not delete the thread until the rank is approved"; rank-approval.test "deletes the thread..." ; interview.test cancelled RA deletes thread | covered |
| US5.3 handed-off Officer Link deletes thread | corrections.test "settles the pending Rank Approval... deletes its thread", "posts in no thread and deletes none when ..." | covered (no explicit hand-off+delete name, behaviour matches) |
| US5.4 abandoned (left, timed out) deletes thread | interview.test "deletes the thread with no message in it" / "still logs ... as left"; interview-sweeper.test timed out (2 tests) | covered |
| US5.5 thread already gone is not an error | none: onboarding-channels.ts `deleteThread` returns on null, but onboarding-channels.test has only the happy-path delete | missing |
| FR-001 | see US1.1, US1.2, US1.4 | covered |
| FR-002 | see US1.1, US1.3 | covered |
| FR-003 | see US2 | covered |
| FR-004 | see US3 | covered |
| FR-005 | see US4 | covered |
| FR-006 failed role change logged, never stops Interview/Link/Unlink | service-level "never throws"/"logs a skip" tests; interview.test "a failing apply leaves the Link..." concerns name/roles, not the Onboarding Role | partial: no Interview/Link/Unlink-level test with a failing Onboarding Role service |
| FR-007 | see US5 | covered |
| FR-008 no channel permission changes; HOSTING.md describes setup | no code touches permissions; HOSTING.md is T009 | not auditable until T009 |
| FR-009 no Game API | onboarding-role.ts has no game-api import (checked by grep); no test | covered by construction |
| SC-001 | US4 tests | covered |
| SC-002 | manual (T012) | out of scope |
| SC-003 | US5 tests; manual part is T012 | covered (automated part) |

## Tasks

- T001-T008 ticked, and their changes exist in the diff (domain, member-roles, onboarding-role service and fakes, interview, corrections, unlink, thread deletion, client wiring). No task ticked but missing.
- T004 claims "a role failure still opens the Interview": no interview-level test (see FR-006 gap).
- T007 claims unused `archive` / `lockAndArchive` removed: diff shows removals in onboarding-channels, interview-texts, corrections-texts, unlink-texts, fakes.
- T009 (in progress), T010, T011 (this audit), T012 unticked, as expected.
- Test-server check recorded in tasks.md: NO (no mention; only the T012 manual check pointing to TEST-RUN.md 6i, which is T009). Add a Definition of Done 2 entry before merge.

## Tests covering nothing in the spec

None found. Removed tests (interview-texts, onboarding-channels archive tests) match the removed archive code.

## Gaps to close

1. Test for US5.5 (deleteThread on an already-gone thread resolves).
2. Interview/Link/Unlink-level test: Onboarding Role service skip or failure does not stop the Interview, the Link, the Unlink (FR-006, US1.3).
3. Record the test-server check in tasks.md.
