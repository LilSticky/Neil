# Review: No Rank Approval for Guests

`bot-reviewer`, 2026-11-06, over `git diff origin/main...HEAD -- src`. No must-fix or should-fix findings.

- `pendingApprovalFor` is the only place that builds a pending Rank Approval. Both callers pass the Player and the Home Kingdom.
- With no draft, both Links skip the announcement and reach `deleteThread`.
- Nit, fixed: a doc comment in `corrections.ts` was badly wrapped.
- Nit, left: the Interview test reaches "no Preferences" through the fake's `declineAll()`; the real Guest branch is tested in
  `preferences-after-link.test.ts`.
