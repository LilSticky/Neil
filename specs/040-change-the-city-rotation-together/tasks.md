# Tasks: Change the City Rotation together

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `mayChangeCityRotation`, `upcomingAlliance`, `moveAlliance`, `skipTurn`, `leaveRotation` in
  `src/domain/city-rotation.ts` (+ test).
- [x] T002 [P] Migration 23 and `CityRotationStore` `paused` and `next` (+ tests): an upgraded version 22 database.

## Phase 2: User Stories 1 to 3

- [x] T003 `move`, `skip`, `leave`, `pause`, `resume` and `allianceChoices` in `src/discord/city-rotation.ts`, texts in
  `city-rotation-texts.ts` (+ test): every refusal, an open Turn handed on with a fresh R5 read, a leaving holder, the
  paused after-siege step, an open Turn staying open past sieges, one log line, one post and the card per change.
- [x] T004 `#home-kingdom-announcements` in `city-rotation-server.ts` (+ test).
- [x] T005 Subcommands in `commands.ts`, routing and autocomplete in `client.ts` (+ tests).

## Phase 3: Polish

- [x] T006 ROADMAP row 040, STATUS, TEST-RUN.md §6aa.
- [ ] T007 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a, TEST-RUN.md §6aa), after
  `npm run commands:register`.
