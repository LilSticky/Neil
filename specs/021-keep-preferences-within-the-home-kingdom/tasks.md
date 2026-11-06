# Tasks: Keep Preferences within the Home Kingdom

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contract](contracts/guest-refusal.md)

**Tests**: required (constitution II). Every code task is `test-first`, then `implementer`.

## Phase 1: Setup

- [x] T001 Install dependencies in the worktree (`npm ci`) and confirm `npm run test` is green before any change

## Phase 2: Foundational

- [x] T002 Add the pure Kingdom rules to `src/domain/preferences.ts` with tests in `src/domain/preferences.test.ts`: from the roles last applied (or none) and the Home Kingdom, whether the Member is known to be in the Home Kingdom, and whether they are a known Guest. No Applied State is neither (data-model.md)

## Phase 3: User Story 1 - A Guest is not offered Preferences (P1)

**Goal**: new Guests get no Preferences message or `/channels` note, and `/channels` refuses them.

**Independent Test**: a Link to a Player of another Kingdom posts no message and stores nothing.

- [x] T003 [US1] `postAfterLink` in `src/discord/preferences-after-link.ts` posts nothing and stores nothing for a Player outside the Home Kingdom, and reports whether it posted; update `src/discord/__fakes__/preferences-after-link.ts` (FR-001)
- [x] T004 [US1] `finishLink` in `src/discord/interview.ts` deletes the thread when nothing was posted and no Rank Approval is pending (FR-003)
- [x] T005 [P] [US1] `finishOfficerLink` in `src/discord/corrections.ts` sends no `/channels` note for a Player outside the Home Kingdom (FR-002)
- [x] T006 [US1] Add the refusal to `src/discord/preferences-texts.ts`, exactly as in the contract, and answer a known Guest's `/channels` with it in `src/discord/preferences-choices.ts` (FR-008)

## Phase 4: User Story 2 - A Guest holds no Preference Roles (P1)

**Goal**: no Guest keeps or gains a Preference Role.

**Independent Test**: a Daily Sync of a Guest holding Preference Roles takes them off, logs one line and keeps the Preferences.

- [x] T007 [US2] `applyTo` in `src/discord/preferences.ts` gives roles only to a Member known to be in the Home Kingdom, takes every Preference Role off anyone else, and stores NaP discussions by rank only for a Member known to be in the Home Kingdom; stored Preferences stay (FR-004, FR-005, FR-006, FR-010, FR-011)
- [x] T008 [US2] A known Guest's select menu press in `src/discord/preferences-choices.ts` gets the refusal and stores nothing; Done still closes; a Member with no Applied State is not refused (FR-009)
- [x] T009 [US2] Wire the Applied State and the Home Kingdom into the Preferences services in `src/discord/client.ts`

## Phase 5: User Story 3 - A Member who moves Kingdom (P2)

**Goal**: the Daily Sync follows a change of Kingdom in both directions.

**Independent Test**: a sync out of the Home Kingdom takes the roles off; a sync back gives the same roles.

- [x] T010 [US3] Test in `src/discord/daily-sync.test.ts` that a Member leaving and returning loses and regains the same Preference Roles without answering, using the real Preference Roles service (FR-006, FR-007)

## Phase 6: Polish

- [x] T011 Dictionary: Preference, Preference Role and Guest wording in `documentation/DICTIONARY.md`, after the user's approval
- [x] T012 [P] Remove the #64 limit notes from `documentation/SERVER-SETUP.md`, `documentation/STARTUP-GUIDE.md` and `documentation/MIGRATION-GUIDE.md` (FR-012)
- [x] T013 [P] Add §6o to `documentation/TEST-RUN.md` from [quickstart.md](quickstart.md)
- [ ] T014 `bot-reviewer` pass, findings in `review.md`
- [ ] T015 `spec-auditor` pass, findings in `audit.md`
- [ ] T016 Update `documentation/STATUS.md` and `documentation/ROADMAP.md`
- [ ] T017 Manual check on the test server (TEST-RUN.md §6o), which needs the deploy

## Dependencies

T001 → T002 → US1 and US2 → US3 → Polish. T003 comes before T004. T006 comes before T008. T009 follows T007 and T008.

## Parallel

T005 can run beside T003 and T004. T012 and T013 can run beside any code task.

## Implementation Strategy

US1 and US2 together are the MVP: both must be live before channels are gated on Preference Roles.
