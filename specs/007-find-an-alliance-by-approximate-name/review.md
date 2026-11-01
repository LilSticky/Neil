# Bot review: slice 007 (T008, 2026-11-02)

Diff `b7d2aa9..HEAD -- src/`. No must; 2 should, 4 could.

| Level | Where | Finding | Fix |
|-------|-------|---------|-----|
| should | `lookup-cards.ts` close-match pick list | labels markdown-escaped; select labels are plain text → backslashes | `optionLabel` without escaping; escape only the message text |
| should | `lookup.ts`, `player.ts` `listedAllianceMatches` | ranking from `matchAlliances` re-sorted alphabetically | keep the ranked order for close matches |
| could | `alliance-autocomplete.ts` | name values > 40 exceed the option's max length | leave them out |
| could | `alliance-autocomplete.ts` | cut to 100 can split surrogate pairs | cut by code points |
| could | `alliance-match.ts` | distance work on every candidate | early exit on length difference |
| could | `startup.ts` hook | blank tag or name stored | skip them |
