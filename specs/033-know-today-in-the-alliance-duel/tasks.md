# Tasks: Know today in the Alliance Duel

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] Server Time in `src/domain/server-time.ts` (+ test): 01:59 / 02:00 UTC, the turn of the year, 17:00 UTC is
  15:00 Server Time, the next reset strictly after now.
- [x] T002 [P] Duel days in `src/domain/duel-plan.ts` (+ test): Monday to Saturday, Sunday none, `nextDuelReset` skips
  Sunday; a plan with a missing day does not compile.
- [x] T003 The day plan `src/duel-plan.ts`, empty texts; a test keeps each text within 1024 characters.
- [x] T004 Migration 16 and `EventStore.duelPlanPostedOn` / `recordDuelPlanPosted` (+ tests).

## Phase 2: User Story 1 (P1)

- [x] T005 `duelPlanMessage` in `src/discord/event-texts.ts` and `createDuelPlanPoster` in `src/discord/duel-plan.ts`
  (+ test): the card, once per day across a reopened database, a late first tick, Sunday, a failed post, an empty text, no
  `#event-announcements`, a throwing store.
- [x] T006 Wire the poster in `src/discord/client.ts` after the Event Reminders on the one-minute tick.

## Phase 3: User Story 2 (P2)

- [x] T007 `/event-kinds list` in `src/discord/event-kinds.ts` (+ test): the kingdom's Alliance Duel line, also with no
  stored kinds, Monday's reset on Saturday after the reset, no line for an Alliance.

## Phase 4: Polish

- [x] T008 Dictionary (Server Time, Duel Plan, Alliance Duel), ROADMAP row 033, STATUS.
- [ ] T009 Manual check on test Neil: the card and the list read well, and the times match the game's clock in the
  reader's own time. Needs the deploy and the six day texts (owner or a leader, by pull request).
