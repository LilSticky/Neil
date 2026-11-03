# Bot review: slice 008 (T006, 2026-11-02)

Diff `4fd7e26..HEAD -- src/`. 1 must, 4 should, 3 could.

| Level | Where | Finding | Fix |
|-------|-------|---------|-----|
| must | `pick.ts` overview reply/update | a rejected reply leaves the press unacknowledged | try/catch, private `unavailable` answer |
| should | `overview-texts.ts` title | tag unescaped, `escapeMarkdown` not `escapeText`, no `fitTitle` | reuse `escapeText`/`fitTitle` |
| should | `overview-texts.ts` | no size guard (4096 description, 6000 per message) | count like `embedCharacters`, cut rows |
| should | `schemas.ts`, `client.ts` `last_online_at` | no upper bound → `<t:NaN:R>` | bound and check finite |
| should | `pick.ts` `overviewFor` | a session per press can evict others (500 cap) | reuse per asker and card session |
| could | `schemas.ts` | numeric strings read as no data | coerce if seen |
| could | `pick.ts` re-lookup ambiguous | pick posts a public card | answer try-again instead |
| could | `overview-texts.ts` | no "as of" footer | `footerFor(fetchedAt, now)` |
