# Tasks: Give Members the Doctor Role

**Input**: [spec.md](spec.md), [plan.md](plan.md). Tests come first in every task (TDD, constitution).

## Phase 1: Foundational

- [x] **T001** Refactor, no behaviour change (plan R1, R2): move the sweep, logging and skip handling of
  `src/discord/onboarding-role.ts` to `src/discord/link-state-role.ts` (`createLinkStateRole`: role name, wanted when
  Linked, startup log line), and `planOnboardingRole` to `planRoleStep` in `src/domain/link-state-role.ts`.
  `src/discord/onboarding-role.test.ts` stays unchanged and green.

## Phase 2: User Stories 1–3, the Doctor Role (P1)

- [x] **T002** [US1–3] `src/domain/doctor-role.ts`: `DOCTOR_ROLE_NAME` is `Doctor`; `wantsDoctorRole` is true for a Member
  who is Linked and not a bot.
- [x] **T003** [US1–3] `src/discord/doctor-role.ts` with `createDoctorRole` and `src/discord/__fakes__/doctor-role.ts`;
  `doctorRoleStartupLogLine` in `src/discord/doctor-role-texts.ts`. Tests: give and take off; a Member not on the server
  is left alone; a role with permissions is skipped and logged (FR-005); an Officer role named Doctor is untouched; at
  startup Linked Members get it, others lose it, bots are left alone, one line with the counts and none when nothing
  changed (FR-003, FR-004); a Member Unlinked after the listing is not given it (R6); a failure for one Member does not
  stop the next (FR-006).
- [x] **T004** [US1] `src/discord/interview.ts` `finishLink` and `src/discord/corrections.ts` after an Officer Link: give
  the Doctor Role before taking the Onboarding Role off (R3), also with a Rank Approval pending.
- [x] **T005** [US2] `src/discord/unlink.ts` `unlinkMember`: for a Member still on the server, take the Doctor Role off
  before giving the Onboarding Role (R4); nothing is asked for a Member who left or is missing.
- [x] **T006** [US3] `src/discord/client.ts`: build one Doctor Role service, pass it to the Interview, the Officer Link and
  Unlink, and run its `atStartup` after the Onboarding Role's, in a chain (R5).

## Phase 3: User Story 4, the server guide (P2)

- [x] **T007** [US4] `documentation/SERVER-SETUP.md`: Doctor in sections 1–3; the layout (basic information,
  `#alliance-hall`, Home Kingdom area, Shared area with text and voice, the two King announcement channels) as a new step;
  Member commands limited to `#alliance-hall` in step 9, `/interview` allowed in `#onboarding`; NaP publications and step 8
  use Doctor where they mean every Linked Member (FR-009); the roll-out order (R9).
- [x] **T008** `documentation/HOSTING.md` if it repeats the affected steps; `documentation/TEST-RUN.md` §6l;
  `documentation/ROADMAP.md`, `documentation/STATUS.md`.

## Phase 4: Review

- [x] **T009** `bot-reviewer` on the slice diff; findings into `review.md`; fix Must and Should items.
- [x] **T010** `spec-auditor` against spec.md; findings into `audit.md`; close gaps.
- [ ] **T011** Manual check in TEST-RUN.md §6l, run by the user on the test server (Definition of Done 2). Not run at merge
  (2026-11-04), so Definition of Done 2 is open.

## Dependencies

T001 → T002 → T003 → T004, T005 → T006. T007 and T008 can run beside them. T009 and T010 come last.

## MVP

T001–T006: every Linked Member holds the Doctor Role. The guide then puts the role to use.
