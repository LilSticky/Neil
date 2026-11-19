# Tasks: Report a NaP breach

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `src/domain/nap-report.ts` (+ test): who may report, text checks, the waiting and the decided proposal,
  who may propose which outcome.
- [x] T002 [P] Migration 29 and `NapReportStore` (+ tests): upgrade from version 28, CHECKs, round trips, deciding once,
  rows kept after an Unlink.
- [x] T003 `openPrivateThread` and posts into threads in `src/discord/city-rotation-server.ts` (+ test).
- [x] T004 `expel` in `src/discord/nap.ts` and its texts (+ test).

## Phase 2: User Stories 1 to 3

- [x] T005 `src/discord/nap-reports.ts` and `nap-report-texts.ts` (+ test): filing, refusals, a missing channel or failed
  thread, proposing, refusals, a failed motion, rejection, approval once, expulsion, Exile, announcement.
- [x] T006 `/nap report` and `/nap report-outcome` in `commands.ts`, routing and the tick in `client.ts`, the store through
  `startup.ts` and `main.ts` (+ tests).
- [x] T007 `server-layout.json`: Neil may create private threads and post in threads in `#nap-leaders` (+ test).

## Phase 3: Polish

- [x] T008 ADR 28, DICTIONARY (NaP Report, Report Outcome, proposed).
- [x] T009 ROADMAP row 046, STATUS, SERVER-SETUP, TEST-RUN.md §6af, DISCORD-PLATFORM (private threads).
- [ ] T010 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a, TEST-RUN.md §6af), after the setup
  script and `npm run commands:register`, with two Linked R5s of Alliances in the NaP: a second R5 files a report; the
  thread is visible to the council and the accused R5 but not to other Members; an approved outcome is carried out and
  its announcement reads well; record each result here.
