# Tasks: No Rank Approval for Guests

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: required (constitution II). The code task is `test-first`, then `implementer`.

## Phase 1: User Story 1 - A Guest is Linked without a Rank Approval (P1)

**Independent Test**: a Link of a Player outside the Home Kingdom with no rank stores no Rank Approval, asks nobody and deletes the thread.

- [x] T001 [US1] Tests: an Interview Link and an Officer Link of a Guest with no rank open no Rank Approval and the Interview Link deletes the thread; a Home Kingdom Member is still asked; `/rank` still works for a Linked Guest: `src/discord/interview.test.ts`, `src/discord/corrections.test.ts` (FR-001 to FR-004)
- [x] T002 [US1] Make them green: `pendingApprovalFor` in `src/discord/interview.ts`, its callers, `homeKingdom` in `InterviewDeps` and `src/main.ts` (FR-001 to FR-003)

## Phase 2: Polish

- [x] T003 Dictionary: Rank Approval in `documentation/DICTIONARY.md`, as the user decided (FR-005)
- [x] T004 [P] Guides: `documentation/SERVER-SETUP.md` (FR-005)
- [x] T005 [P] Add §6r to `documentation/TEST-RUN.md`
- [ ] T006 `bot-reviewer` pass, findings in `review.md`
- [ ] T007 `spec-auditor` pass, findings in `audit.md`
- [ ] T008 Update `documentation/STATUS.md` and `documentation/ROADMAP.md`
- [ ] T009 Manual check on the test server (TEST-RUN.md §6r), which needs the deploy

## Dependencies

T001 → T002 → T006 → T007 → T008. T003 to T005 can run beside any code task.
