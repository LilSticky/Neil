# Tasks: Act on fresh game data

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/game-api-client.md](contracts/game-api-client.md), [quickstart.md](quickstart.md)

**Tests**: required (constitution II). Every implementation task follows a red task: `test-first` writes the failing test,
`implementer` makes it green.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Foundational

- [x] T001 Refactor (green stays green): rename the found answer's `fetchedAt` to `asOf` across `src/` (domain
  `LookupResult`, client, cache, Discord adapters, fakes, tests). Doc comments say "when the game sent the data". No
  behaviour change; typecheck, lint and tests green.
- [ ] T002 Red: in `src/game-api/schemas.test.ts`, player and alliance bodies read an optional `age_seconds`; a missing,
  negative, non-numeric or non-finite value reads as undefined and does not fail the body.
- [ ] T003 Green: `src/game-api/schemas.ts`.

## Phase 2: User Story 1 - Neil acts only on current game data (P1)

- [ ] T004 [US1] Red: in `src/game-api/client.test.ts`, the uncharged `getPlayer`, `findPlayer`, `getAlliance` and
  `findAlliance` send `?fresh=1` by default and with `"live"`, and no query with `"copy"`; charged lookups
  (`chargedTo`) never send it (`client-charged.test.ts`).
- [ ] T005 [US1] Green: `Freshness` type in `src/domain/player.ts`; optional last parameter in `src/game-api/client.ts`.
- [ ] T006 [US1] Red: in `src/game-api/client.test.ts`, a found answer's `asOf` is the receive moment minus
  `age_seconds` (player and alliance, by uid/tag and by name); without a usable age it is the receive moment.
- [ ] T007 [US1] Green: `src/game-api/client.ts`.
- [ ] T008 [US1] Red: cache rules (data-model.md): a copy lookup is answered from an entry stored within the TTL even
  when its `asOf` is old; a live lookup with an entry whose `asOf` is older than the TTL sends a live request; a live
  lookup within the TTL of a live answer sends nothing; a live and a copy lookup at once send two requests; on a spent
  quota a live lookup still gets the stale entry with its `asOf`. Tests in `src/game-api/lookup-cache.test.ts` and
  `src/game-api/client.test.ts`.
- [ ] T009 [US1] Green: `src/game-api/lookup-cache.ts`, `src/game-api/client.ts`.

## Phase 3: User Story 2 - Members see how old the data on a card is (P2)

- [ ] T010 [P] [US2] Red: REAPER's reads (`src/discord/reaper.test.ts`, `src/discord/pick.test.ts` for `/reaper add`)
  ask with `"copy"`; the other uncharged callers (Interview, corrections, nickname and roles, Daily Sync, Booty Call)
  ask without a freshness or with `"live"` (their fakes record it).
- [ ] T011 [US2] Green: `src/discord/reaper.ts`, `src/discord/pick.ts`, fakes in `src/discord/__fakes__/`.
- [ ] T012 [P] [US2] Red: `src/discord/lookup-cards.test.ts`: a Player found with `asOf` 2 hours before `now` shows
  "as of" that time (proves the footer uses the answer's time; expected to pass after T001, kept as a guard).

## Phase 4: User Story 3 - The project knows the new API (P3)

- [ ] T013 [P] [US3] `documentation/GAME-API.md`: Freshness rewritten (research R1), quota 2,000 with patron, `?fresh=1`,
  `x-cache` values, gzip, top-level fields; check one alliance answer for `age_seconds` at top level (one request) and
  record it.

## Phase 5: Polish

- [ ] T014 `bot-reviewer` on the slice diff; fixes via `implementer`.
- [ ] T015 `spec-auditor` against spec.md; STATUS.md and ROADMAP.md by `housekeeper`.
- [ ] T016 Manual check: [quickstart.md](quickstart.md) Manual, after the deploy (needs the user).
