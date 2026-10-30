# Review: slice 004 (bot-reviewer, 2026-10-30)

| # | Severity | Where | Finding | Outcome |
|---|----------|-------|---------|---------|
| 1 | must fix | `src/discord/lookup-cards.ts` roster components | The disabled `Page p/n` button shared its custom id with Previous or Next on the first and last page; Discord rejects the message | fixed: indicator `pick:{id}:info`, uniqueness tested on every page |
| 2 | must fix | `src/discord/lookup-cards.ts` menus | Select option labels from Game text had no 100-character cap | fixed: one `optionLabel` helper, cut to 99 + `…` |
| 3 | should fix | `src/discord/pick.ts` | A failed public card follow-up left the Member with "Showing …" and nothing else | fixed: logged and told privately as unavailable |
| 4 | nit | `src/discord/pick.ts` | A roster pick used the session's page, not the page on screen | fixed: `pick:{id}:select:{page}` |
| 5 | nit | `src/game-api/client.ts` | In-flight keys ignored the purpose; an interview call could join a lookup refused for the reserve | fixed: purpose in the in-flight key; cache stays shared |
| 6 | nit | `src/discord/pick-sessions.ts` | Expired sessions only leave through the 500 cap | kept: memory is bounded |
| 7 | nit | `src/config.ts` | `GAME_API_QUOTA_RESERVE` had no upper bound | fixed: above `Number.MAX_SAFE_INTEGER` is refused |

Passed: components acknowledged before any Game API call, owner and expiry checked first; names URL-encoded; the
Quota Reserve enforced on first attempts, retries and picks; page turns make no request; no mentions, escaped text,
zod at the boundaries, no `any` or `!`.
