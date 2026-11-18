# Tasks: See whose turn it is

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 Dictionary: Royal City siege, City Rotation, Holding Alliance, Turn, Handover.
- [x] T002 [P] Settings `ROYAL_CITY_SIEGE_TIME`, `CITY_ROTATION_MODE` in `src/config.ts` (+ test), `env.example`.
- [x] T003 [P] `src/domain/city-rotation.ts` (+ test): siege clock across the UTC date line, order rules, next holder,
  editor rule.
- [x] T004 Migration 18 and `CityRotationStore` (+ tests): upgrade from 17, reopen, corrupt rows.
- [x] T005 [P] `leader_id` → `Alliance.leaderUid` (+ tests).

## Phase 2: User Stories

- [x] T006 `src/discord/city-rotation.ts` and texts (+ test): show, set, holder, confirm, after-siege step, card.
- [x] T007 `src/discord/city-rotation-server.ts` (+ test): channels by name, edit of a gone message, log without mentions.
- [x] T008 `/rotation` in `commands.ts` (+ test), routing and wiring in `client.ts` (+ test), `startup.ts`, `main.ts`.
- [x] T009 Setup: `PinMessages`; Neil on `nap-announcements` and `nap-leaders` (+ tests).

## Phase 3: Polish

- [x] T010 ADR 18, STATUS, ROADMAP row 035, SERVER-SETUP, DISCORD-PLATFORM.
- [ ] T011 Manual check on test Neil: set `ROYAL_CITY_SIEGE_TIME`, rerun the setup script, `npm run commands:register`;
  the pinned card and `/rotation show` read clearly and the siege time shows in the reader's own clock; a set, a holder
  and a confirmation each update the card and write one `#neil-log` line.
  Partial (2026-11-18, test Neil, Police and the user): the pinned City Rotation card in `#nap-announcements` and `/rotation show` name the next siege as Friday 2026-11-20 14:00 UTC (12:00 Server Time). Open: `/rotation set`, `/rotation holder` and the after-siege confirmation, because the test server has no Linked R5.
