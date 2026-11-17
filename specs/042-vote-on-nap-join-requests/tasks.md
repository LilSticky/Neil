# Tasks: Vote on NaP join requests

**Input**: [spec.md](spec.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `NAP_VOTE_MS`, `NAP_COOLDOWN_MS`, `NapDecision`, declined events, `voteResult`, `cooldownEndOf`,
  `runningCooldownOf`, `mayDecide` and `mayAskToJoin` with the cooldown in `src/domain/nap.ts` (+ test).
- [x] T002 [P] Migration 25 and `NapStore` `setVoteEnd`, `castVote`, `votes`, declines and decisions (+ tests): an
  upgraded version 23 database with history and an open request.

## Phase 2: User Stories 1 to 4

- [x] T003 `vote` and `tick` in `src/discord/nap.ts`, Approve and Decline buttons and texts in `nap-texts.ts` (+ test):
  votes, changes, refusals, the Officer's decision, counting, opening a late vote, the cooldown in `/nap join`.
- [x] T004 Routing of `nap-decline:` and the tick in `client.ts` (+ test).
- [x] T005 `/nap history` description in `commands.ts` (+ test).

## Phase 3: Polish

- [x] T006 ADR 23, DICTIONARY (NaP Vote, NaP Cooldown), DISCORD-PLATFORM, SERVER-SETUP.
- [x] T007 ROADMAP row 042, STATUS, TEST-RUN.md §6ab.
- [ ] T008 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a, TEST-RUN.md §6ab), after
  `npm run commands:register`.
