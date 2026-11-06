# Tasks: Choose Recruitment instead of Trading

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: required (constitution II). The code task is `test-first`, then `implementer`.

## Phase 1: User Story 1 - A Member chooses Recruitment (P1)

**Independent Test**: the Interests offered hold Recruitment and not Trading; choosing it stores it and gives the role.

- [ ] T001 [US1] Change the tests to expect Recruitment in Trading's place, and add one that Trading is no Preference Role and that an old menu press of `trading` stores nothing: `src/domain/preferences.test.ts`, `src/discord/preferences-texts.test.ts`, `src/discord/preferences-choices.test.ts`, `src/storage/preference-store.test.ts` (FR-001, FR-002, FR-003)
- [ ] T002 [US1] Replace `trading` with `recruitment` in `InterestKey` and `INTERESTS` in `src/domain/preferences.ts` (FR-001, FR-002, FR-003)

## Phase 2: Polish

- [x] T003 Dictionary: add Recruitment to `documentation/DICTIONARY.md`, after the user's approval
- [x] T004 [P] Guides: `Recruitment` for `Trading` in `documentation/SERVER-SETUP.md` and `documentation/STARTUP-GUIDE.md`, the step to delete `Trading` in `documentation/MIGRATION-GUIDE.md`, the #65 note removed (FR-004)
- [x] T005 [P] Add §6p to `documentation/TEST-RUN.md`
- [ ] T006 `bot-reviewer` pass, findings in `review.md`
- [ ] T007 `spec-auditor` pass, findings in `audit.md`
- [ ] T008 Update `documentation/STATUS.md` and `documentation/ROADMAP.md`
- [ ] T009 Manual check on the test server (TEST-RUN.md §6p), which needs the deploy

## Dependencies

T001 → T002 → T006 → T007 → T008. T004 and T005 can run beside any code task.
