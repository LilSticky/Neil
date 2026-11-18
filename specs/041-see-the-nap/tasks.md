# Tasks: See the NaP

**Input**: [spec.md](spec.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `src/domain/nap.ts` (+ test): `NapStatus`, `napFormerMembers` (newest leave first) and `napStatusOf`
  (Home Kingdom only, tags ignoring case; join, leave, rejoin).
- [x] T002 [P] Migration 24 (`nap_list`) and `NapStore.listMessageId` / `setListMessageId` (+ tests): kept across a
  reopened database at schema version 24; a corrupt row is an error.

## Phase 2: User Stories

- [x] T003 NaP field on the Alliance card in `src/discord/lookup-cards.ts` (+ test), threaded through `lookup.ts`,
  `pick.ts` (pick and roster page) and `look-again.ts` via an optional `napStatusOf` (+ tests; a failing read logs and
  shows no field).
- [x] T004 `napListEmbed` and `refreshList` in `src/discord/nap-texts.ts` and `src/discord/nap.ts` (+ test): posted and
  pinned, edited, reposted when gone, chained so two refreshes post once, no mention.
- [x] T005 Join and leave announcements in `#nap-announcements` (+ test): only the Alliance and the time, mentions off;
  missing channel, failed post, edit and pin each log one line and change nothing else. `/nap show` uses the list.
- [x] T006 Wiring in `src/discord/client.ts`: `napStatusOf` for every lookup, pick and Look again context, and
  `nap.refreshList()` once at startup.
- [x] T007 ADR 22, ROADMAP row 041, STATUS, SERVER-SETUP, DISCORD-PLATFORM.

## Phase 3: Polish

- [ ] T008 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a), after the deploy: Police sees the
  NaP list pinned in `#nap-announcements`. An R5 runs `/nap join` and an Officer approves; Police sees the join
  announcement and the list updated. The R5 runs `/nap leave`; Police sees the leave announcement and the list with the
  former member. `/alliance` on that Alliance shows its NaP line. A human confirms the texts read well and name no Member.
  Partial (2026-11-18): Police sees the NaP list pinned in `#nap-announcements` ("No Alliance is in the NaP yet."); the `/alliance` card of REB shows "Not a member". Open: the announcements of a join and a leave, because the test server has no Linked R5.
