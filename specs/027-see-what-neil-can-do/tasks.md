# Tasks: See what Neil can do

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: required (constitution II). The code task is `test-first`, then `implementer`.

## Phase 1: User Story 1 - A Member sees what they can do (P1)

**Independent Test**: the `/help` answer for a Member holds every Member command with its options and purpose, and no Officer command.

- [ ] T001 [US1] Tests: `src/discord/help-texts.test.ts`, `src/discord/help.test.ts`, and `/help` in `src/discord/commands.test.ts` (FR-001 to FR-006)
- [ ] T002 [US1] Make them green: `src/discord/help-texts.ts`, `src/discord/help.ts`, `src/discord/commands.ts`, the wiring in `src/discord/client.ts` (FR-001 to FR-006)

## Phase 2: Polish

- [ ] T003 [P] Guides: `documentation/SERVER-SETUP.md` (FR-007)
- [ ] T004 [P] Add §6t to `documentation/TEST-RUN.md`
- [ ] T005 `bot-reviewer` pass, findings in `review.md`
- [ ] T006 `spec-auditor` pass, findings in `audit.md`
- [ ] T007 Update `documentation/STATUS.md` and `documentation/ROADMAP.md`
- [ ] T008 Manual check on the test server (TEST-RUN.md §6t), which needs the deploy and `npm run commands:register`

## Dependencies

T001 → T002 → T005 → T006 → T007. T003 and T004 can run beside any code task.
