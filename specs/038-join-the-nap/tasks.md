# Tasks: Join the NaP

**Input**: [spec.md](spec.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `src/domain/nap.ts` (+ test): `napMembers` follows the latest join or leave per tag (ignoring case);
  `linkedR5AllianceOf`, `mayAskToJoin`, `mayApprove` (council, or an Officer only while the NaP is empty), `mayLeave`.
- [x] T002 [P] Migration 21 and `NapStore` (+ tests): history and open requests across a reopened database at schema
  version 21; one open request per tag; a corrupt row is an error.

## Phase 2: User Stories

- [x] T003 `/nap show` in `src/discord/nap.ts` and `src/discord/nap-texts.ts` (+ test): members with join times and open
  requests, privately, to anyone, naming no Member.
- [x] T004 `/nap join` (+ test): the request with its Approve button in `#nap-leaders`, mentions off; refusals; a missing
  channel or failed post drops the request and logs one line.
- [x] T005 The Approve button (+ test): council approval, the Officer fallback while the NaP is empty, refusals, stale
  and gone requests, two presses approve once.
- [x] T006 `/nap leave` (+ test): the R5 leaves, the council is told; refusals; a missing channel or failed post only logs.
- [x] T007 `/nap history` (+ test): council and Officers only, newest first, at most 20 entries, mentions off.
- [x] T008 `/nap` in `src/discord/commands.ts` (+ test), routing and wiring in `src/discord/client.ts` (+ test),
  `NapStore` in `src/main.ts` and `src/startup.ts` (+ test).

## Phase 3: Polish

- [x] T009 Dictionary (NaP, NaP Council), ADR 20, ROADMAP row 038, STATUS, SERVER-SETUP, DISCORD-PLATFORM.
- [ ] T010 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a), after the deploy and
  `npm run commands:register`: with two Home Kingdom Alliances whose R5s are Linked, the first R5 runs `/nap join`;
  Police sees the request with its Approve button in `#nap-leaders` and one `#neil-log` line. An Officer presses
  **Approve**; Police sees the message updated without its button. The second R5 runs `/nap join`; an Officer's press is
  refused, the first R5's press approves. The second R5 runs `/nap leave`; Police sees the line in `#nap-leaders`. Any
  Member's `/nap show` lists the first Alliance only; the first R5's `/nap history` lists the three entries, newest first;
  a Member outside the council is refused. A human confirms the texts read clearly and show local times.
