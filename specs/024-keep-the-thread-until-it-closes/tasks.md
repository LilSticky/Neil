# Tasks: Keep the thread until it closes

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: required (constitution II). The code task is `test-first`, then `implementer`.

## Phase 1: User Story 1 - A Member finishes their Preferences in the thread (P1)

**Independent Test**: after an Interview Link with the Preferences message posted, the Member holds both roles; Done takes the Onboarding Role off and deletes the thread.

- [x] T001 [US1] Tests for scenarios 1 to 8: `src/domain/onboarding-role.test.ts`, `src/discord/onboarding-role.test.ts`, `src/discord/interview.test.ts`, `src/discord/corrections.test.ts`, `src/discord/rank-approval.test.ts`, `src/discord/preferences-choices.test.ts`, `src/discord/interview-sweeper.test.ts` (FR-001 to FR-004)
- [x] T002 [US1] Make them green, per plan.md's decisions, with the wiring in `src/discord/client.ts` (FR-001 to FR-004)

## Phase 2: Polish

- [x] T003 Dictionary: Onboarding Role in `documentation/DICTIONARY.md`, as the user decided (FR-005)
- [x] T004 [P] Guides: `documentation/SERVER-SETUP.md`, `documentation/STARTUP-GUIDE.md` (FR-005)
- [x] T005 [P] Add §6s to `documentation/TEST-RUN.md`, naming the rows it replaces
- [x] T006 `bot-reviewer` pass, findings in `review.md`
- [x] T007 `spec-auditor` pass, findings in `audit.md`
- [x] T008 Update `documentation/STATUS.md` and `documentation/ROADMAP.md`
- [ ] T009 Manual check on the test server (TEST-RUN.md §6s), which needs the deploy

## Dependencies

T001 → T002 → T006 → T007 → T008. T003 to T005 can run beside any code task.
