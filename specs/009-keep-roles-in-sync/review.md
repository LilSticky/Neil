# Bot review: slice 009 (T009, 2026-11-02)

Diff `f7d8368..HEAD -- src/`. 3 must, 6 should, 2 could.

| Level | Where | Finding | Fix |
|-------|-------|---------|-----|
| must | `discord/daily-sync.ts` share count | counts calls, not attempts (retries ×3) | measure `quotaToday().used` deltas |
| must | `discord/daily-sync.ts` run record | saved only after a complete run → reruns with fresh share | save the day before the first request |
| must | `domain/daily-sync.ts` `rankAfterSync`, migration 7 | legacy rows (no Alliance recorded) drop approved ranks | tell "unknown" from "no Alliance"; keep the approved rank when unknown |
| should | `discord/daily-sync.ts` | stale Link snapshot during the run | re-read the Link before applying |
| should | `discord/daily-sync.ts` | outage burns share on uid fallbacks, wrong log text | stop on unavailable/try-again; log only not-found |
| should | `domain/daily-sync.ts` planSync | left-over uid Members never first | one ordered list of steps, left-over first |
| should | `member-roles.ts`, `name-and-roles.ts` | nickname PATCH daily; owner skip logged daily | skip equal nickname; don't log owner skip |
| should | `client.ts` | startup apply and first sync overlap | start the sync after the startup apply |
| should | `client.ts`, `daily-sync.ts` | run continues after disconnect | abort flag, await run on disconnect |
| could | `connect.test.ts` | real clock | inject `now` |
| could | `discord/daily-sync.ts` | repeated member fetches | fetch once |
