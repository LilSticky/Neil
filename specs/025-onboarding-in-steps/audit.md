# Audit of slice 025 (spec-auditor)

Typecheck: pass. Test: 99 files, 3273 tests pass. Lint (--quiet): pass.

## Coverage
| Requirement / scenario | Covering tests | Status |
|---|---|---|
| FR-001 order; US1-5 | src/domain/preference-steps.test.ts, preference-steps-texts.test.ts | covered |
| FR-002 / SC-002 one menu, place of four | preference-steps-texts.test.ts | covered |
| FR-003 Interests explained, R5 no NaP (US1-7) | preference-steps-texts.test.ts, preferences-choices.test.ts | covered |
| FR-004 / SC-003 skip, optional | preference-steps-texts.test.ts, "a go press" in preferences-choices.test.ts | covered |
| FR-005 back | preference-steps-texts.test.ts, preferences-choices.test.ts | covered |
| FR-006 select saves, same step | "a select change" in preferences-choices.test.ts | covered |
| FR-007 finishing message | finishedMessage tests; "Done" (preferences-choices.test.ts:580) | covered |
| FR-008 / SC-001 Languages step at the Link | preferences-after-link.test.ts | covered |
| FR-009 /channels | "/channels" in preferences-choices.test.ts | covered |
| FR-010 close on Done or timeout, Rank Approval keeps it | existing Preferences prompt tests (reused, per plan D4); Done tests | partial: no new test for the timeout after the Link or Done with a pending Rank Approval in this slice's diff; relies on slice 024 tests |
| FR-011 refusals | go press / /channels / select refusal describes | covered |
| FR-012 Interview texts | interview-texts.test.ts | covered |
| FR-013 voice, no "doctor" | interview-texts.test.ts:247 | partial: Interview texts only; step texts not checked for "doctor" |
| FR-014 errors unchanged | interview-texts.test.ts (T004) | covered |
| FR-015 / SC-005 limits | preference-steps-texts.test.ts | covered |
| FR-016 Region channels | server-setup.test.ts:915 | covered (shipped layout only) |
| SC-004 every text says what happens | step and Interview text tests | covered |
| Edge: Guest at Link, Officer Link note | preferences-after-link.test.ts, Interview tests | covered (not re-verified line by line) |

## Tasks
T001-T017 are ticked and their changes exist. T018 is this audit. T019 and T020 are open, as expected. The two "should fix" items of
review.md are resolved: `finishedMessage` is used by `finish` and `preferencesMessage` is gone.

## Findings
- STATUS.md line 10 still says Recruitment has `looking-for-alliance` and `looking-for-players`; FR-016 replaced them. Fix in T019.
- #news and #suggestions were added to server-layout.json and are tested (server-setup.test.ts:890-905); neither is in spec.md.
  Record them in spec (a scope note beside FR-016) so tests are not orphaned.
- setup-plan: forums now fall back to text without Community (a 029 follow-up, #82 area) shows in this diff; setup-plan.test.ts
  covers it. Likely a rebase artifact; confirm it is not double-counted against main.
- Review nit still open: a Guest pressing Done passes the Guest check and closes the prompt.

## Scope creep candidates
Tests for news and suggestions channels, and forum-to-text fallback in setup-plan.test.ts.

## Test-server check recorded: no
T020 is open and TEST-RUN section 6w (T019) is not written yet. Definition of Done 2 is unmet until both are done.
