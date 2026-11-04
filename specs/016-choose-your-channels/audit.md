# Audit: slice 016 (T014), against spec.md, plan.md and tasks.md

Typecheck: green. Tests: 2254 passed (68 files). Lint (--quiet): green.

## Criteria -> tests

| Criterion | Test(s) | Status |
|---|---|---|
| US1.1 / FR-002 game Language preselected | preferences-texts.test "preselects the Player's language, matching a regional code"; domain preselectedLanguage; preferences-after-link.test "stores the Player's game Language..." | covered |
| US1.2 two Languages -> exactly those roles | preferences-choices.test "saves the languages picked"; preferences.test "gives the Preference Roles..." | covered (no single end-to-end test) |
| US1.3 skip -> no role, move on | preferences.test "takes off..."; Done tests; no explicit "skip all gives none" | partial |
| US1.4 no Language -> nothing preselected | preferences-texts.test "outside the Game Languages preselects nothing"; domain "undefined" | covered |
| US2.1 / 2.2 Region, Interests roles | preferences-choices.test saves region/interests; preferences.test apply | covered |
| US2.3 / 2.4 / FR-006 Veteran invitation, New pointer | preferences-texts.test guidesLine (4 tests), "a Veteran's message..."; preferences-choices.test "shows the guides line when Veteran/New" | covered |
| US2.5 skipped question -> next, Interview ends | by design (one message, R1); Done and sweeper tests | covered |
| US3.1 R4 offered NaP | preferences-texts.test "R4 adds NaP"; domain interestOptions | covered |
| US3.2 R5 auto at Link, not listed | name-and-roles.test "R5 on the Link"; domain; preferences-texts "R5 same four" | covered |
| US3.3 R1-R3 / unknown / no Alliance not offered | preferences-texts.test "R1 to R3 and unknown ranks"; domain | partial: no Player without Alliance case |
| US3.4 / US3.5 / FR-005 / SC-003 rank change removes/gives NaP (Daily Sync, Rank Approval) | name-and-roles.test "Daily Sync finds R4 -> R3", "approved rank"; preferences.test "takes NaP off an R4 ... R3", "approved R5" | covered; "R5 becomes R4 keeps it" has no test |
| US4.1 / FR-007 /channels private, current answers | preferences-choices.test "/channels"; commands.test (3 tests); client.test | covered |
| US4.2 change Italian -> English swaps roles | preferences.test "takes off a Preference Role no longer wanted"; choices "applies the Preference Roles" | covered |
| US4.3 not Linked told to finish onboarding | preferences-choices.test "not Linked"; preferences-texts.test | covered |
| FR-001 asked after Link, same thread, four questions | interview.test (posted for the Member in the thread, with pending RA); preferences-texts.test components | covered |
| FR-003 give chosen, remove unchosen | preferences.test apply | covered |
| FR-004 create without permissions / refuse with permissions | preferences.test "creates ... without permissions", "logs a skipped ... " (Administrator role) | covered |
| FR-008 / Edge Unlink | preferences.test forget (3); unlink.test (forgets Link already ended, failure logged) | covered |
| FR-009 / Edge idle timeout | preferences-choices Done tests; interview-sweeper.test (4) | covered |
| FR-010 failure logged, never stops | preferences.test, preferences-choices "failures", name-and-roles, interview.test, unlink.test | covered |
| FR-011 no channel permissions; SERVER-SETUP.md | SERVER-SETUP.md/HOSTING.md changed in diff; no code touches permissions | covered by construction |
| Edge: Officer Link private message, failure ignored | corrections.test (2); preferences-texts.test | covered |
| Edge: hand-made role left alone | preferences.test "leaves the other roles alone" | covered |
| SC-001 | manual 6k.2-6k.3 | out of scope |
| SC-002 at most 4 interactions | components test (4 menus + Done) | partial: no test asserting one-click skip |

## Tasks

- T001-T012 ticked and their changes exist in the diff. No silently skipped task found.
- T013 done: see review.md.
- T014 is this audit. T015 unticked: manual check 6k.1-6k.11 is collected in TEST-RUN.md, to be run by the user.

## Tests covering nothing in the spec

None found. Storage/migration tests and `preferences-after-link` serve plan R-items (storage, preselection).

## Test-server check recorded in tasks.md: NOT RUN

Recorded at T015: merged without a test-server check, on the user's word; Definition of Done 2 is open.

## Gaps to close

1. Test: R5 who becomes R4 keeps NaP discussions (US3.4).
2. Test: Player without Alliance not offered NaP (US3.3); explicit skip-all gives no role (US1.3).
3. T013 review.md; record the test-server check in tasks.md.

## Second pass (2026-11-04, after the merge of `main`)

A1, A2 and A3 are closed by tests, A2 with a Linked Member with no Alliance in `preferences-after-link.test.ts` (the
`/channels` path has no such test). FR-008 and FR-009 hold, FR-009 on the buttons, `/rank`, Done and the sweeper. Tests:
2461 passed (76 files).
