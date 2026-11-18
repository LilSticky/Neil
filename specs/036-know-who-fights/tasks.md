# Tasks: Know who fights

**Input**: [spec.md](spec.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 Configuration: the six `FIGHTER_` settings with their defaults and order rules (`src/config.ts` + test,
  `env.example`), passed to `connect` by `src/startup.ts`.
- [x] T002 The Availability domain `src/domain/availability.ts` (+ test): Fighter Class, the suggestion, the poll's opening
  (72 h before the start), its clock steps, the answer refusals and the totals; `isTroopBracket` and `tierOf` in
  `src/domain/troop-bracket.ts`.
- [x] T003 Migration 19 and `src/storage/availability-store.ts` (+ test); the reopen and Unlink tests.

## Phase 2: User Stories 1 and 2 (P1)

- [x] T004 Cards and texts `src/discord/availability-texts.ts` (+ test): poll card, summary, button ids, class buttons, replies.
- [x] T005 `src/discord/availability-poll.ts` (+ test): the buttons, the suggestion from the cached Player lookup, the answer
  refusals; card edits through `src/discord/availability-board.ts`.
- [x] T006 Routing of `avail:` buttons and wiring in `src/discord/client.ts`; `src/discord/unlink.ts` forgets the answers.

## Phase 3: User Story 3 (P2)

- [x] T007 The Availability clock `src/discord/availability-clock.ts` (+ test) on the one-minute tick after the Raid clock:
  opening, closing at the start or cancel, deleting the answers, the log lines.

## Phase 4: Polish

- [x] T008 Dictionary (Availability Poll, Availability Summary, Fighter Class), ADR 19, ROADMAP row 036, STATUS,
  MIGRATION-GUIDE.md, SERVER-SETUP.md and the `#kvk-leaders` description in `server-layout.json`.
- [ ] T009 Manual check on test Neil: with `DISCORD_WAR_COUNCIL_ROLE_ID` set (the poll opens on Wednesday at
  12:00 Server Time, 72 hours before the fixed Raid start, so run the check from then on), the poll appears in each `alliance-chat` and the
  summary in `#kvk-leaders`, nobody is pinged, Available shows the suggested class highlighted, the counts update after an
  answer, and the cards close at the start. Run `npm run server:setup -- --apply` for the new `#kvk-leaders` description.
  Verify each result through Neil Police.
