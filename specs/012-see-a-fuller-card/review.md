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

## Review: T007–T008 (bot-reviewer, 2026-11-03), diff `7dfb436..8537449`

### Must

None.

### Should

- [x] S2 FR-009 was decided twice (`isOnlineNow` in the domain, `onlineText` in the card adapter). Fixed: one domain
  function `lastSeen` in `src/domain/alliance-overview.ts`; both adapters only format its result.

### Could

- [x] C4 `seenText` re-checked `lastOnlineAt` only for type narrowing. Fixed with `lastSeen`'s union.
- [ ] C5 The inline Top lists (5 lines, names up to 32 characters) may wrap hard in thirds on desktop. Kept: check in
  TEST-RUN.md §6h.8; fallback is `inline: false` for the Top fields.

### Checked and clean

- Both embeds stay within 6,000 characters (the author name is counted); fields stay under 1,024.
- Names are escaped; pictures come only through `trackerPicture`; the domain stays pure.
- "Online now without a Last Online" does not leak: `leastActive`, the Daily Sync and the Interview store never read it.

## Review: Might rename and T010 (bot-reviewer, 2026-11-03), diff `a80725b..71b5597`

### Must

None.

### Should

- [ ] S3 Old `overview:{session}:{page}` ids open the Might sort, while the old table was sorted by Weekly Activity.
  Kept as specced (T010): pick lists live only in memory, so no old Overview survives the restart that ships this.
- [x] S4 Line breaks, invisible and direction characters in names could split or scramble table rows. Fixed: replaced
  with a space before the name is cut.

### Could

- [x] C6 Header "Last" vs FR-011 "Last Online": FR-011 now names the header "Last".
- [ ] C7 The active sort button stays enabled (pressing it returns to page 1). Kept: harmless.

### Checked and clean

- The rename keeps the wire key `power` (Game API) and the stored key `power` (Interview store); no migration.
- Custom ids are unique on every page and sort, at most 5 buttons per row, ids ~30 characters; sorting is owner-only
  and asks the Game API nothing; the table keeps to 4,096 / 6,000 characters.
