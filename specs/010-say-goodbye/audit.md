# Audit: 010 Say goodbye (T001-T004 done; T005-T007 open as expected)

Compared with `git diff 009-keep-roles-in-sync...HEAD`. Test files: `src/discord/unlink.test.ts`, `unlink-texts.test.ts`,
`connect.test.ts`, `daily-sync.test.ts`, `interview.test.ts`, `name-and-roles.test.ts`, `rank-approval.test.ts`,
`src/domain/rank-approval.test.ts`, `src/storage/link-store.test.ts`.

## Criteria and covering tests

| Criterion | Tests | Status |
|-----------|-------|--------|
| US1-1 Link ends, uid free (FR-001, SC-001) | unlink.test "ends the Link and forgets applied state", "frees the uid"; link-store.test unlink x4 | covered |
| US1-2 one log line (FR-002) | unlink.test log line with/without nickname; unlink-texts.test | covered |
| US1-3 private message, refusal harmless (FR-003) | unlink.test "sends one private message", "keeps the Unlink ... refuses"; name-and-roles.test (leave path) | covered |
| US1-4 returning Member gets new Interview | name-and-roles.test "joins again and starts a new Onboarding Interview" | covered |
| US1-5 no Link, no Unlink (FR-006) | unlink.test "does nothing for a Member without a Link"; name-and-roles.test "Unlinks a Member with no Link as left too" (routes to Unlink, no-op) | covered |
| US2-1 Rank Approvals go to Officers, thread message | domain handToOfficers; link-store pendingApprovedBy/save; unlink.test hands on, posts per thread | covered |
| US2-2 approved/cancelled unchanged | handToOfficers refuse test; pendingApprovedBy excludes ended; unlink.test "leaves approved and cancelled" | covered |
| US2-3 departed approver's old press refused | rank-approval.test "refuses the departed approver's old press" | covered |
| US2 independent test: an Officer's press then approves | not found in the diff (only existing Officer approval tests, pre-010) | partial |
| US3-1 startup sweep | connect.test sweep tests (missing, apply complete, others untouched) | covered |
| US3-2 Daily Sync, no Game API request | daily-sync.test "Unlinks ... as missing, with no request", "counts as skipped" | covered |
| US3-3 other fetch failure -> no Unlink (FR-005, SC-003) | connect.test (fetch fails, Discord unreachable); daily-sync.test fetch failure | covered |
| FR-007 Unlink uses no Game API | asserted only via "no request for them" in startup and Daily Sync; the leave path has no Game API dependency by construction | covered (indirect) |
| SC-002 | connect.test + daily-sync.test | covered |
| Edge: leave + sweep see same Member (idempotent) | link-store "second unlink returns undefined"; unlink.test no-Link no-op. No end-to-end double-trigger test | partial |
| Edge: log channel fails | unlink.test | covered |
| Edge: thread gone | unlink.test | covered |
| Edge: kicked/banned | same event as leave, no distinct test (acceptable) | covered by design |

## Tests without a criterion

None clearly out of scope. Minor:
- unlink-texts.test "pings nobody" and "allows those roles to be pinged": wording/safety detail, not in the spec.
- unlink.test "still hands on a pending Rank Approval the Member without a Link was the approver of": sensible extension of US2 (approver need not be Linked); not stated in the spec. Consider adding it to US2.

## Gaps

1. No test that an Officer's press approves after a hand-on (US2 independent test).
2. No test of the double trigger (leave event followed by sweep or Daily Sync).
3. Spec FR-004/US2 do not say a Rank Approval is handed on for an approver without a Link; the code and a test do it. Align the spec.
4. Tasks T005-T007 open (expected). T006 should record the test-server check (Definition of Done 2) through TEST-RUN.md §6f.
5. I did not run typecheck, test or lint (the request was a spec-versus-test comparison only).
