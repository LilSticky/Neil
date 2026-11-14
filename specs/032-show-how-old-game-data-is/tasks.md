# Tasks: Show how old game data is

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/discord-texts.md](contracts/discord-texts.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test
(`test-first`), then `implementer` makes it green.

## Phase 1: Setup

None (no new dependency, no migration).

## Phase 2: Foundational

- [x] T001 [P] Domain rule in `src/domain/data-age.ts` (+ `data-age.test.ts`): `MAP_TIME_FRESH_MS = 5 * 60_000`;
  `isOld(asOf: Date | undefined, now: Date): boolean` — `true` when `asOf` is undefined or `now − asOf > 5 minutes`;
  a future `asOf` is not old; exactly 5 minutes is not old. `mapPageOf(kingdom: KingdomNumber | undefined): string` —
  `https://lastasylumtracker.com/map?kid=<kingdom>`, or `https://lastasylumtracker.com/map` when undefined.
- [x] T002 Player body schema reads `map_updated_at` leniently in `src/game-api/schemas.ts` (+ `schemas.test.ts`):
  missing, null, not a finite number, or ≤ 0 → undefined; otherwise Unix seconds (fractional) kept. Add
  `map_updated_at` to the fixtures `src/game-api/__fixtures__/player*.json` where missing.
- [x] T003 `LookupResult` found `asOf` becomes `Date | undefined` in `src/domain/player.ts`; update the `Freshness` doc
  comment: `copy` (default) may be answered from Neil's cache; `live` skips Neil's cache and asks the tracker with
  `?fresh=1` (only the Look again button). Fix compile errors in callers by passing `asOf` through unchanged (typecheck
  green, behaviour unchanged except where later tasks say).

## Phase 3: User Story 1 — A Player card says when the game data last changed (P1)

**Independent test**: a Player with map time 12:59 UTC and an 8-second-old answer copy shows "as of 12:59 UTC".

- [x] T004 [US1] Client takes a Player's `asOf` from `map_updated_at` (seconds → Date) and no longer from
  `age_seconds`, in `src/game-api/client.ts` (+ `client.test.ts`): `playerFrom`, and by-name lookups; an Alliance's
  `asOf` is `undefined` (`fetchAlliance`, `fetchAllianceByName`). Remove `asOfFrom`.
- [x] T005 [US1] `footerFor(asOf: Date | undefined, now)` in `src/discord/lookup-cards.ts` (+ `lookup-cards.test.ts`):
  undefined → `Data from Last Asylum Tracker` without "· as of"; otherwise as today. `renderPlayerCard`,
  `renderAllianceCard` and `renderOverview` (`src/discord/overview-texts.ts`) accept `Date | undefined`.
- [x] T006 [US1] Roster pick sessions keep `asOf: Date | undefined` in `src/discord/pick-sessions.ts`; adjust
  `src/discord/pick.ts` and `src/domain/alliance-overview.ts` (+ tests) so an Alliance Overview shows no "as of".
- [x] T007 [US1] REAPER reads store `readAt` = the Player's map time, else the moment the answer arrived (`now()`), in
  `src/discord/reaper.ts` (`refreshOf`, `exileOf`, `FreshRead`) (+ `reaper.test.ts`).

## Phase 4: User Story 2 — An old card tells the Member how to get current data (P1)

**Independent test**: a card with a 44-minute-old map time carries the "Newer data" field with the Kingdom link and the
🔄 Look again button; a 2-minute-old one carries neither; a press makes one live request and updates the card.

- [ ] T008 [US2] Card pieces in `src/discord/lookup-cards.ts` (+ test): `newerDataField(kingdom | undefined)` →
  `{ name: "Newer data", value: "Use **Update Map** on the [Kingdom 330 map](https://lastasylumtracker.com/map?kid=330), wait until it has finished, then press 🔄 Look again." }`
  (without a Kingdom: `[tracker map](https://lastasylumtracker.com/map)`); `lookAgainRow(customId)` → one action row
  with a secondary button, label `Look again`, emoji 🔄. Custom ids per data-model.md: `again:<ownerId>:p:<uid>`,
  `again:<ownerId>:a:<kingdom>:<tag>`, `again:<ownerId>:o:<kingdom>:<tag>`, `again:<ownerId>:r` or
  `again:<ownerId>:r:<x>:<y>`; `lookAgainCustomId(...)` and `parseLookAgainCustomId(id)` (malformed → undefined) in
  `src/discord/look-again.ts` (+ test). Custom ids ≤ 100 characters.
- [ ] T009 [US2] Player cards carry the field (Player's Kingdom) and the button when `isOld(asOf, now)`
  (`playerCardMessage` in `src/discord/lookup.ts`, used by `/player` and picks in `src/discord/pick.ts`) (+ tests:
  44 min old → both; 2 min old → neither; unknown → both). The owner id is the caller's.
- [ ] T010 [US2] Alliance cards and the Alliance Overview always carry the field (the Alliance's Kingdom) and the button
  (`allianceCardMessage` in `src/discord/lookup.ts`, `renderAllianceComponents`, `renderOverview` and their callers in
  `src/discord/pick.ts`) (+ tests). The button row goes below the existing rows.
- [ ] T011 [US2] Game API client: `live` skips Neil's cache and asks with `?fresh=1`; `copy` reads the cache within the
  window counted from `storedAt`; every found answer is stored. Remove `liveUsable` from `src/game-api/lookup-cache.ts`
  and `liveUsableFrom` from `src/game-api/client.ts` (+ `lookup-cache.test.ts`, `client.test.ts`): a live lookup after
  a cached copy makes a request; a copy lookup after a live one is answered from the cache.
- [ ] T012 [US2] Look again handler `handleLookAgain` in `src/discord/look-again.ts` (+ `look-again.test.ts` with a
  fake interaction): not the owner → private `Only the Member who ran this command can use this button. Run it yourself.`;
  malformed id → private unavailable; else `deferUpdate`, run the target's lookup with `live` charged to the caller
  (`chargedTo(caller)`; Player → `getPlayer`, Alliance card → `getAlliance` first roster page with a new roster pick
  session, Overview → `getAlliance` rendered as the Overview), then `editReply` the same message with the new card
  (its own field and button when still old) and the usage line; a refusal or failure → private follow-up with the
  original lookup's text, the old card stays.
- [ ] T013 [US2] `/reaper closest` carries the field (the measured Kingdom) and the button `again:<ownerId>:r[:x:y]`
  when any ranked position on the answer is old (`src/discord/reaper.ts`, `src/discord/reaper-texts.ts`) (+ tests);
  the press re-runs the ranking with `live`, uncharged reads, and updates the answer (in `look-again.ts`).
- [ ] T014 [US2] Route custom ids starting with `again:` to `handleLookAgain` in `src/discord/client.ts` and wire its
  context in the composition root (`src/main.ts`) (+ `client.test.ts`).

## Phase 5: User Story 3 — Neil stops paying for live requests that bring nothing new (P2)

**Independent test**: none of the acting flows asks with `?fresh=1`.

- [ ] T015 [US3] Default `freshness` becomes `"copy"` for `getPlayer`, `findPlayer`, `getAlliance`, `findAlliance` in
  `src/game-api/client.ts`; drop explicit `"live"` arguments elsewhere in `src/` (+ tests: the Interview, corrections,
  Daily Sync, Booty Call, nickname-and-roles reads and the Recommended Player ask without `?fresh=1`; update the
  fakes in `src/discord/__fakes__/` and tests that expected `live`).

## Phase 6: Polish

- [ ] T016 [P] `documentation/GAME-API.md` Freshness: how Neil uses `map_updated_at` and `?fresh=1` after this slice
  (FR-012); `documentation/ROADMAP.md` and `documentation/STATUS.md`.
- [ ] T017 Review (`bot-reviewer`) and fixes; spec audit (`spec-auditor`) into `review.md` and `audit.md`.
- [ ] T018 Manual check on the test server per [quickstart.md](quickstart.md) after the deploy.

## Dependencies

- T001–T003 first (T001 parallel to T002). US1 (T004–T007) before US2 (T009, T010 use the footer; T012 uses T011).
  T015 after T011. T016–T018 last.

## Parallel examples

- T001 ∥ T002. T008's two files ∥ T011.

## Implementation strategy

MVP: Phase 2 + US1 (honest "as of"). Then US2 (hint, button), US3 (no needless live requests), polish.
