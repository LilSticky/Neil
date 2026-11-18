# Tasks: Decide by NaP Motion

**Input**: [spec.md](spec.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `src/domain/nap-motion.ts`: limits, `mayOpenMotion`, `motionEndsAt`, `motionReminderAt`, `motionResult`,
  `alliancesWithoutVote`, `votesByAlliance` (+ test).
- [x] T002 [P] Migration 26 and `NapMotionStore` (+ tests): upgrade from version 25, CHECKs, round trips.

## Phase 2: User Stories 1 to 4

- [x] T003 `src/discord/nap-motions.ts` and `nap-motion-texts.ts` (+ test): open, vote, reminder, closing and the
  decision log, refusals and failures.
- [x] T004 `/nap motion` in `commands.ts`, routing of the subcommand, the motion buttons and the tick in `client.ts`, the
  store through `startup.ts` and `main.ts` (+ tests).

## Phase 3: Polish

- [x] T005 ADR 25, DICTIONARY (NaP Motion, NaP Council).
- [x] T006 ROADMAP row 043, STATUS, TEST-RUN.md §6ac.
- [ ] T007 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a, TEST-RUN.md §6ac), after
  `npm run commands:register`: set up the NaP members and Links with Police, hand the user the `/nap motion` commands
  and button presses, verify the posts in `#nap-leaders`, `#nap-announcements` (and its translated copies) and
  `#neil-log` through Police, and record each result here.
