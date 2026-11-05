# Audit: Look up within a Daily Allowance

`spec-auditor` against `spec.md` and `tasks.md`, 2026-11-05. Every scenario, FR and SC it traced has a test that can
fail. No scope creep. T017 and T019 were open, as expected.

| # | Gap | Outcome |
|---|-----|---------|
| 1 | Edge: limit unknown at startup | Test added in `allowance-keeper.test.ts`; passes |
| 2 | Edge: a request sent after midnight UTC | Test added in `client-charged.test.ts`; passes |
| 3 | Edge: a lookup of two requests with one left | Test added in `client-charged.test.ts`; passes |
| 4 | US1 scenario 9: the Daily Sync charges nobody | Test added in `daily-sync.test.ts`; passes (it also holds by type) |
| 5 | US3: no usage line on `/reaper` replies | Negative tests added in `reaper.test.ts` and `reaper-closest.test.ts`; pass |

All five passed on the existing code, so none revealed a bug. A keeper test for "only the latest four" was removed
because the 28-day retention keeps a fifth same-weekday record out of the store; `daily-allowance.test.ts` covers the
rule.

Definition of Done 2 stays open until T019, the manual check on the test server.
