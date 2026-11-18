# Tasks: Agree on the NaP Rules

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `src/domain/nap-rules.ts` (+ test): numbering, current and replaced, deciding once, one open proposal,
  text checks.
- [x] T002 [P] Migration 27 and `NapRulesStore` (+ tests): upgrade from version 26, CHECKs, round trips, deciding once.
- [x] T003 `mayOpen` and `openFor` in `src/discord/nap-motions.ts` (+ test), `/nap motion` unchanged.

## Phase 2: User Stories 1 to 3

- [x] T004 `src/discord/nap-rules.ts` and `nap-rules-texts.ts` (+ test): proposing, refusals, failed motion, approval
  and announcement (split, mentions off), rejection, repeated outcome, `/nap rules`, `/nap rules-history`.
- [x] T005 `/nap rules`, `rules-history` and `rules-propose` in `commands.ts`, routing of the subcommands, the form and
  the tick in `client.ts`, the store through `startup.ts` and `main.ts` (+ tests).

## Phase 3: Polish

- [x] T006 ADR 26, DICTIONARY (NaP Rules, NaP Rules Version).
- [x] T007 ROADMAP row 044, STATUS, TEST-RUN.md §6ad.
- [ ] T008 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a, TEST-RUN.md §6ad), after
  `npm run commands:register`: a council member proposes, the NaP Motion approves, the announcement in
  `#nap-announcements` reads well and the Interaction Bot's translated copies show it; record each result here.
