# Audit: slice 005, Interview a new member (T023)

Read-only comparison of spec.md with src/, the tests and tasks.md. Abbreviations: int = discord/interview.test.ts, sweep = discord/interview-sweeper.test.ts, rank = discord/rank-approval.test.ts, dom = domain/onboarding-interview.test.ts. Suite, typecheck and lint were not re-run for this audit. The manual test-server check (T024) is deferred to documentation/TEST-RUN.md by the user's decision; it is not a gap.

## Acceptance scenarios

| Criterion | Test(s) | Status |
|---|---|---|
| US1-1 join opens private thread, asks uid with help | int "opens the Interview thread and asks for the uid"; onboarding-channels; interview-texts | covered |
| US1-2 one request, onboarding purpose, card with buttons | int "looks the uid up once for the onboarding interview and posts the found card" | covered |
| US1-3 That's me: Link, thread, end, log | int "That's me" group | covered |
| US1-4 leader's Member mentioned | int "pings the leader's Member" plus not-on-server and no-Link variants | covered |
| US1-5 malformed: ask again, no request, no attempt | int "asks again without a lookup"; lookup-input; dom malformed | covered |
| US1-6 other person's button: private note | int "tells someone else..." (uid button only) | partly |
| US1-7 no Alliance: Linked, no approval | int "links a Player in no Alliance"; link.test | covered |
| US1-8 restart continues | interview-store round-trip; sweep recovery (checking only); dom recoverAfterRestart | partly |
| US2-1 taken uid refused, nameless, counted, logged | int "refuses a uid Linked to another Member" | covered |
| US2-2 unknown / not-prepared counts | int "a uid that fails" | covered |
| US2-3 That's not me counts | int "That's not me" | covered |
| US2-4 simultaneous confirms | int "two Members confirming the same uid"; link-store already-linked | covered |
| US2-5 5th failure hands off | int hand-off tests (uid and reject) | covered |
| US2-6 API unavailable: try again, no attempt | int try-again / unavailable | covered |
| US3-1 leader's Member asked | int and rank "adds the leader's Member" | covered |
| US3-2 else Officers | int "asks the Officers when..."; rank "asks the Officers"; rank-approval domain | covered |
| US3-3 approver picks: stored, thread, log | rank "stores the rank", "posts the approved message", "logs the rank" | covered |
| US3-4 anyone else refused | rank "refuses ..." (3 tests) | covered |
| US3-5 Linked Member leaves cancels approval | int "cancels the pending Rank Approval", "says the Rank Approval is cancelled" | covered |
| US4-1 /interview opens, replies privately | int "/interview opens an Interview" | covered |
| US4-2 open Interview: no second | int "points to the open thread"; join "ignores open Interview" | covered |
| US4-3 Linked: private note | int "tells the Member privately that they are Linked"; "does not look up" | covered |
| US4-4 24 h silence abandons | sweep "abandoned as timed out"; dom timeOut, dueAt | covered |
| US4-5 leaving abandons | int "when a Member leaves" (4 tests) | covered |
| US4-6 new Interview after hand-off | int "opens a new Interview after ... handed off" (and abandoned) | covered |
| US5-1 spent quota: pause, message, no attempt | int "a uid check that finds the Daily Quota spent"; dom quota-spent | covered |
| US5-2 at reset mention and ask again | sweep "is resumed at or after its resume time" | covered |
| US5-3 long pause not abandoned, clock restarts | sweep "not abandoned", "runs the timeout from the resume time" | covered |

## Functional requirements

| FR | Test(s) | Status |
|---|---|---|
| FR-001 | int join tests | covered |
| FR-002 | int /interview group | covered |
| FR-003 | lookup-input, int modal, dom | covered |
| FR-004 | int "looks the uid up once"; slice 004 cache tests | partly (no Interview-level test of a fresh cached Player) |
| FR-005 | interview-texts; int found card | covered |
| FR-006 | int "links the Member"; link-store re-check | covered |
| FR-007 | int refusal test | covered |
| FR-008 | int fail and hand-off tests; dom | covered |
| FR-009 | int try-again / unavailable | covered |
| FR-010 | int quota pause; sweep resume | covered |
| FR-011 | sweep timeout; int leave | covered |
| FR-012 | int and rank tests | covered |
| FR-013 | rank press tests; link-store | covered |
| FR-014 | int leave cancels approval | covered |
| FR-015 | int and rank and sweep log assertions | covered |
| FR-016 | stores round-trip; sweep recovery and resume | partly |
| FR-017 | int uid button test; rank refusals | partly (confirm, reject, modal by someone else untested) |
| FR-018 | config.test; startup.test (invalid config exits 1) | partly (checkChannels failure at ready, exit 1, untested at wiring level) |
| FR-019 | ADR 0007 Accepted | covered |
| FR-020 | no setNickname or role call in src/ | covered by absence |

## Edge cases and success criteria

| Item | Status |
|---|---|
| Spaces and leading # trimmed | covered |
| Quick repeated answers get "one moment" | covered |
| Missing Player Name or Kingdom on the card | not verified |
| Missing channel or permission | partly (see FR-018) |
| Joins while offline, bot joins | covered (absence, int bot test) |
| Officer interviewed; R5 with unknown rank | covered |
| Cached uid, no request | partly (FR-004) |
| Others writing in the thread ignored | covered by design (no message listener) |
| Deleting or leaving the thread counts as silence | missing |
| SC-001 | manual, deferred (TEST-RUN.md) |
| SC-002 to SC-005 | covered |

## Tasks

T001 to T020 are ticked and each has its test and code. T021 (review.md), T022 (docs) and T023 are open. T024 is deferred. No task is done but unticked and no ticked task lacks its change. No test found that covers nothing in the spec.

## Gaps, ranked

1. FR-018: no test that a failing checkChannels at ready stops Neil with exit 1 (promised in T013).
2. FR-017/US1-6: only the uid button is tested for another person; confirm, reject and modal are not.
3. FR-016/US1-8: restart tested for checking and due rows only; awaiting-confirmation, paused and pending Rank Approval not exercised end to end.
4. Edge: deleting or leaving the thread as silence has no test.
5. FR-004: no Interview-level test using a fresh cached Player.
6. Process: T021 review.md and T022 docs still open.
