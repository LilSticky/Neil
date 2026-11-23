# Tasks: Start the Interview

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

- [x] T001 `src/discord/interview.ts` (+ test): a join gives the role only (no thread, no post); the online and startup
  starts are gone (FR-001, FR-002); `onStartButton` answers like `/interview` (FR-004).
- [x] T002 `src/discord/interview-texts.ts` (+ test): the start message and its button id (FR-003); `onlineAtStartupLogLine`
  removed.
- [x] T003 `src/discord/onboarding-channels.ts` (+ test): `pinStartMessage` (missing, present, refused pin) and the two
  new permissions (FR-003, FR-006).
- [x] T004 `src/discord/client.ts` (+ test): routes and startup wiring; `server-layout.json` permissions (FR-006).
- [x] T005 STATUS, ROADMAP row 049, SERVER-SETUP/DICTIONARY wording if it says the Interview opens on join.
- [ ] T006 Smoke test on test Neil through Neil Police: after the setup script and a restart, `#onboarding` has one
  pinned start message.
