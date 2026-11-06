# Tasks: Call out a booty

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md), [contracts/commands.md](contracts/commands.md)

**Tests**: required (constitution II). Every code task is `test-first`, then `implementer`, then `bot-reviewer`.

## Phase 1: Foundational

- [ ] T001 Dictionary: add Booty, Booty Call and Booty Alerts as approved, in `documentation/DICTIONARY.md` (after slice 024 merges; rebase first)
- [x] T002 [P] ADR 13, personal data of Booty Alerts, in `documentation/adr/` with its index
- [ ] T003 Rules in `src/domain/booty.ts`: mode `off`, `always`, `online`, `offline`; window in minutes 0 to 1439, equal start and end meaning the whole day, over midnight when start is after end, end minute outside; the match rule; `HH:MM` parsing; one-minute expiry and cooldown
- [ ] T004 Migration and store in `src/storage/database.ts`, `src/storage/booty-alerts-store.ts`: table `booty_alerts` per data-model.md; get, save, forget; no row means Off (FR-010, FR-011)

## Phase 2: User Story 2 - A Member chooses their Booty Alerts (P1)

**Independent Test**: recorded Booty Alerts are shown again by `/booty-alerts`, and decide whether the Member matches.

- [ ] T005 [US2] `/booty-alerts` in `src/discord/booty.ts`, `src/discord/booty-texts.ts`, `src/discord/commands.ts`: options per contracts, private answer, options left out keep what is recorded, invalid input refused (FR-009, scenarios 1 and 5)
- [ ] T006 [US2] Time zones in `src/discord/booty.ts`: autocomplete from `Intl.supportedValuesOf("timeZone")`, local minute with `Intl.DateTimeFormat`, daylight saving covered (scenarios 2 to 4)
- [ ] T007 [US2] Forget Booty Alerts at Unlink in `src/discord/unlink.ts` (FR-011, scenario 6)

## Phase 3: User Story 1 - A Member makes a Booty Call (P1)

**Independent Test**: with one opted-in Member and one who is not, a confirmed Booty Call posts one card that mentions only the first.

- [ ] T008 [US1] `/booty` checks in `src/discord/booty.ts`: `alliance-chat`, category an Alliance role, caller Linked and holding it; private refusals (FR-001, scenarios 5 and 6)
- [ ] T009 [US1] Confirmation in `src/discord/booty.ts`, `src/discord/booty-texts.ts`: buttons per contracts, Cancel, expiry after one minute, a press by another Member refused (FR-002, scenarios 1, 2 and 4)
- [ ] T010 [US1] Who is alerted in `src/discord/booty.ts`: one uncharged Player lookup of the caller, roster matched to Links, online from the game or Discord, caller left out (FR-004, FR-005, FR-006)
- [ ] T011 [US1] Fallback when the Game API can't answer: Alliance role holders, Discord alone (FR-007)
- [ ] T012 [US1] Card and mentions in `src/discord/booty.ts`, `src/discord/booty-texts.ts`: card once, mentions in content in chunks of 80, `allowedMentions.users` exact, no mentions when nobody matches, log line (FR-003, FR-012, scenarios 3 and 8)
- [ ] T013 [US1] Cooldown in `src/discord/booty.ts`: claimed before the first await, released if the post fails, later callers pointed to the card (FR-008, scenario 7)
- [ ] T014 [US1] Wiring in `src/discord/client.ts`, `src/main.ts`: commands, autocomplete, `booty:` buttons; check Neil may post in `alliance-chat` in `src/domain/server-layout.ts`

## Phase 4: Polish

- [ ] T015 Guides and TEST-RUN section for this slice, in `documentation/SERVER-SETUP.md`, `documentation/TEST-RUN.md` (FR-013; after slice 024 merges)
- [ ] T016 `bot-reviewer` pass, findings in `specs/026-call-out-a-booty/review.md`
- [ ] T017 `spec-auditor` pass, findings in `specs/026-call-out-a-booty/audit.md`
- [ ] T018 Update `documentation/STATUS.md`, `documentation/ROADMAP.md`
- [ ] T019 Manual check on the test server, by the user (needs the deploy), per [quickstart.md](quickstart.md)

## Dependencies

T003 → T004 → US2 → US1. T014 needs T005 to T013. T001 and T015 wait for slice 024's merge; T003 onward uses the terms, so T001 lands before this branch's PR. T016 → T017 → T018.

## Parallel

T002 beside any task. T005 and T008 touch the same file, so they run in order.

## Implementation strategy

US2 first: without recorded Booty Alerts nobody can be mentioned. Both stories ship in one PR.
