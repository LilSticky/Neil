# Audit: Keep Preferences within the Home Kingdom

`spec-auditor`, 2026-11-06. Every FR has a test or, for FR-012, a checked edit. No test lacks a criterion, and no task was
ticked without its work.

| Partial gap | Outcome |
|-------------|---------|
| FR-011, SC-004: nothing asserts there is no startup pass, or that Game API calls don't rise | Accepted: the slice adds no startup code and no Game API call |
| US3 scenario 3: no `/channels` test after a return | Accepted: the test of a Member holding the Home Kingdom role covers the same path |
| US3 scenario 4: no new test for a Guest's Unlink | Accepted: `forget` is unchanged, and `src/discord/unlink.test.ts` covers it for every reason |

Open: the manual check (T017), which needs the deploy, so Definition of Done 2 is open.
