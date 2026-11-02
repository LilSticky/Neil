# Bot review: slice 012 "See a fuller card"

Reviewer: `bot-reviewer` (2026-11-02), diff `011-correct-a-link...012-see-a-fuller-card` in `src/`.

## Must

- [x] M1 Language has no length limit: `textSchema` in `src/game-api/schemas.ts` accepts any non-empty string, and
  `languageName` (`src/discord/lookup-cards.ts`) shows an unnamed code in capitals at full length. A 1,100-character
  `language` breaks the field limit and pushes the Alliance card past 6,000. Fix: a language-tag schema
  (`^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$`), with tests for an oversized and a non-tag value.

## Should

- [x] S1 `src/storage/interview-store.ts` stores `JSON.stringify(player)`, which now includes `details` (Location, last
  online, picture paths) that are never read back; more than ADR 7 lists. Fix: store only the `playerRecord` fields,
  with a store test that `details` is not stored.

## Could

- [x] C1 The picture-path regex is written twice (`schemas.ts`, `lookup-cards.ts`). Fix: one exported constant.
- [ ] C2 `details?` is optional although the client always sets it; `RosterEntry.power?` differs from its siblings'
  `| undefined`. **Kept**: optional means Players built elsewhere (Daily Sync, Interview store, fixtures) need no change.
- [x] C3 `last_online_at: 0` shows "Last online 20,000+ days ago". Fix: read 0 as unknown.

## Checked and clean

Pictures only from `https://lastasylumtracker.com` + a `/static/` path (no dots before the extension, so no `..`,
host or query); every Game API text escaped; `embedCharacters` counts author name and description; each new field
fails alone; domain types only, no new Game API calls, nothing logged.
