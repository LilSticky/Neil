# Tasks: Hand the King role over

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 0: Decision

- [x] T000 ADR 21 (Neil moves the King role, only on an Officer's Apply) as the first commit; ADR 8 partly superseded.

## Phase 1: Foundational

- [x] T001 [P] `planKingMove`, `kingMoveSteps`, `checkApply` in `src/domain/king-move.ts` (+ test).
- [x] T002 [P] Migration 22 and `KingMoveStore` (+ tests): one row, a reopened database, a corrupt row.

## Phase 2: User Stories 1 and 2 (P1)

- [x] T003 `createKingMoves` in `src/discord/king-move.ts` and texts in `king-move-texts.ts` (+ test): one live read, the
  card and its button, every cannot-prepare case, superseding, Officer-only Apply, only the snapshot loses King, applied
  and superseded presses, 50013 and other refusals, a restart.
- [x] T004 `kingMoveServerOf` in `src/discord/king-move-server.ts` (+ test): only the King role, cards in `#neil-log`.
- [x] T005 `onHandover` in `src/discord/city-rotation.ts` (+ test): after a confirmation, and after `/rotation holder`
  in Contested only.
- [x] T006 Wire the service and the `king:` button in `src/discord/client.ts`, the store in `main.ts`/`startup.ts`
  (+ routing test).
- [x] T007 The role sync never moves King or Moderator (`member-roles.test.ts`).

## Phase 3: Polish

- [x] T008 Setup hint (`server-setup.ts`) and guides: Neil above King, below Moderator.
- [x] T009 Dictionary (King Move), ROADMAP row 039, STATUS, TEST-RUN.md §6z.
- [ ] T010 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a, TEST-RUN.md §6z): Police drags
  Neil's role above King and gives King to a test Member; after a confirmed Handover Police sees the card and the log
  line; the user presses Apply as an Officer; Police verifies King moved only as shown and the applied line.
