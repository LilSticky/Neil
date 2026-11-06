# Tasks: Onboarding in steps

**Input**: [spec.md](spec.md), [plan.md](plan.md). Every code task is red, then green, then review.

## Phase A: Interview texts (can start now)

- [ ] T001 [US4] Welcome and uid question in `src/discord/interview-texts.ts`: introduce Neil as the alliance hall's Liaison, say why the uid is needed and what comes next (FR-012, FR-013)
- [ ] T002 [US4] Recommended Player, pick list and found card: say what confirming does; buttons and pings unchanged (FR-012)
- [ ] T003 [US4] Linked message: say what Neil is setting up and name `/channels` (FR-012, edge case: closed private messages)
- [ ] T004 [US4] Test that error messages, refusals and log lines are unchanged, and that no text calls Neil a doctor (FR-013, FR-014)

## Phase B: Steps (after slice 024 merges; rebase first)

- [ ] T005 [US1] Step order in `src/domain/preferences.ts`: Languages, Interests, Region, Experience, with next and previous (FR-001)
- [ ] T006 [US1] Custom ids: `pref:go:{step}:{memberId}` alongside the existing forms (plan D2)
- [ ] T007 [US1] Step messages in `src/discord/preferences-texts.ts`: one menu, explanation, place among the steps; Interests explained per option (FR-002, FR-003)
- [ ] T008 [US2] Buttons per step: Skip or Next, Back, Done; Region and Experience say they are optional (FR-004, FR-005)
- [ ] T009 [US1] A select press saves, applies, logs and re-renders the same step (FR-006)
- [ ] T010 [US2] A go press shows that step from stored answers and changes nothing (FR-004, SC-003)
- [ ] T011 [US2] Finishing message: `/channels` and the guides line, no menus (FR-007)
- [ ] T012 [US3] `/channels` answers privately with the Languages step (FR-009)
- [ ] T013 [US3] Guests and Members who are not Linked are refused on go presses too (FR-011)
- [ ] T014 [US1] Private message after the Link: welcome, explanation, start button, from both senders (FR-008)
- [ ] T015 [US1] A press with no server works: roles still change (FR-010, plan D4)
- [ ] T016 Every step and text fits Discord's limits (FR-015, SC-005)

## Phase C: Finish

- [ ] T017 `bot-reviewer` pass, findings in `review.md`
- [ ] T018 `spec-auditor` pass, findings in `audit.md`
- [ ] T019 TEST-RUN.md section for the manual check, STATUS and ROADMAP
- [ ] T020 Manual check on the test server, by the user (needs the deploy)
