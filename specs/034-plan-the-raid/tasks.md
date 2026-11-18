# Tasks: Plan the Raid

**Input**: [spec.md](spec.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 Server Layout: the War Council role, `#kvk-leaders` (R5, R4, War Council, King) and Neil's post right in
  `#kvk-announcements` (`server-layout.json`, shipped-layout tests in `src/discord/server-setup.test.ts`).
- [x] T002 Configuration: `DISCORD_WAR_COUNCIL_ROLE_ID`, `RAID_START`, `RAID_PLAN_DEADLINE_HOURS`,
  `RAID_CONFIRMATION_DEADLINE_HOURS` (`src/config.ts` + test, `env.example`), passed to `connect` by `src/startup.ts`.
- [x] T003 The Raid domain `src/domain/raid.ts` (+ test): fixed and custom Objectives, Phases in Server Time, Assignments,
  notes, publish, cancel, Plan Confirmations and the due notices; `serverTimeInstant` in `src/domain/server-time.ts`.
- [x] T004 Migration 17 and `src/storage/raid-store.ts` (+ test).

## Phase 2: User Stories 1 and 2 (P1)

- [x] T005 Cards and texts `src/discord/raid-texts.ts` (+ test): plan card, confirmation card, button, refusals.
- [x] T006 `src/discord/raid-plan.ts` (+ test): `/raid-plan`, autocomplete, publish, amend, cancel, the confirm button;
  the shared R4/R5 check in `src/discord/alliance-standing.ts`.
- [x] T007 `/raid-plan` in `src/discord/commands.ts` and `/help`; routing and wiring in `src/discord/client.ts`.

## Phase 3: User Story 3 (P2)

- [x] T008 The Raid clock `src/discord/raid-clock.ts` (+ test) on the one-minute tick after the Duel Plan.

## Phase 4: Polish

- [x] T009 Dictionary (War Council, Raid, Battle Plan, Objective, Phase, Assignment, Plan Confirmation, Plan Deadline,
  Confirmation Deadline, Confirmation Chase, Raid Reminder; Kingdom vs Kingdom gains Raid), ROADMAP row 034, STATUS,
  SERVER-SETUP.md, MIGRATION-GUIDE.md, DISCORD-PLATFORM.md.
- [ ] T010 Manual check on test Neil: after `npm run server:setup -- --apply`, `.env` (`DISCORD_WAR_COUNCIL_ROLE_ID`) and `npm run commands:register`, a War Council holder drafts, publishes, amends and cancels a plan; the
  cards read clearly, times show in Server Time and in the reader's own time, an R5 confirms, and every step appears in
  `#neil-log`. Also check whether Interaction Bot translates the plan card. Verify each result through Neil Police.
