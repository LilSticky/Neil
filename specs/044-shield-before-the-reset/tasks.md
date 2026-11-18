# Tasks: Shield before the reset

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `src/domain/shield.ts` (+ test): Shield Deadline, weeks, lead times, standing.
- [x] T002 [P] Migration 27 and `ShieldStore` (+ tests): upgrade from version 26, CHECKs, round trips, forget.
- [x] T003 [P] Alliance Leaders Role in `managed-roles.ts` (+ tests in managed-roles, name-and-roles, daily-sync, unlink).
- [x] T004 [P] `alliance-leaders` in `server-layout.json`, its placeholder in `expandLayout` and `parseLayout`
  (+ tests in server-layout, setup-plan, server-setup).

## Phase 2: User Stories 1 to 5

- [x] T005 Built-in Shield line in `/event-kinds` (+ tests).
- [x] T006 `src/discord/shield.ts`, `shield-texts.ts`: `/kvk-week`, `/shield-reminders`, the Shielded button (+ test).
- [x] T007 `src/discord/shield-reminders.ts`: reminders, Shield Lists, deleting passed confirmations (+ test).
- [x] T008 Commands, routing and the tick in `client.ts`, the store through `startup.ts` and `main.ts`, Unlink (+ tests).

## Phase 3: Polish

- [x] T009 ADR 26, ADR 8 amendment, DICTIONARY (proposed terms, for the owner's approval).
- [x] T010 SERVER-SETUP, STARTUP-GUIDE, ROADMAP row 044, STATUS, TEST-RUN.md §6ad.
- [ ] T011 After the merge: run the setup script on both servers (each Alliance gets `alliance-leaders` and
  `[TAG] Leaders`), `npm run commands:register`, then the manual check on test Neil through Neil Police (TEST-RUN.md
  §6ad), which needs a Linked R4 or R5; record each result here.
