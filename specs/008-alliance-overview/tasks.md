---
description: "Task list for slice 008, Alliance overview"
---

# Tasks: Alliance overview

**Input**: [spec.md](spec.md). TDD per task (`test-first` → `implementer`).

## Plan (short)

- Game API: `RosterEntry` gains `weeklyActivity`, `dailyHonor`, `dailyTech` (`number | undefined`), `online`
  (`boolean | undefined`), `lastOnlineAt` (`Date | undefined`) from `active`, `daily_honor`, `daily_tech`, `online`,
  `last_online_at` (nullish → undefined).
- Domain `src/domain/alliance-overview.ts`: `overviewOf(roster, now)` → totals (sum/average of the three over members
  with data, online now, online in 24 h, no-data count), `top(by, 5)`, `leastActive(5)`, `table(page)` (25 per page,
  sorted, no data last).
- Discord: `src/discord/overview-texts.ts` (embed + page buttons, no uids, escaped, Discord relative timestamps);
  the Alliance card gets an "Overview" button `pick:<session>:overview`; `pick.ts` answers privately from the session's
  Alliance, or looks the Alliance up again (lookup purpose) when the session is gone; table pages
  `overview:<id>:<page>` owned by the asking Member.

## Tasks

- [x] T001 Test `src/game-api/schemas.test.ts` + `client.test.ts`: the five roster fields map (recorded `alliance.json`
  first member: 490, 40, 4600, offline, last online 1793285439 s; others undefined). Implement.
- [x] T002 [P] Test `src/domain/alliance-overview.test.ts`: totals, top 5 each, Least Active 5, no-data count and
  exclusion, online now / 24 h, table paging and sort. Implement.
- [x] T003 Test `src/discord/overview-texts.test.ts`: embed content per FR-002/FR-006, table page with buttons,
  limits, escaping. Implement.
- [x] T004 Test `src/discord/lookup-cards.test.ts` + `pick.test.ts` (+ client routing): "Overview" button on the
  Alliance card; press → private overview with no Game API call while the session holds the Alliance; session gone →
  one lookup (lookup purpose); failure → private try-again; page buttons only for the asker. Implement.
- [x] T005 Docs: TEST-RUN.md §6d (collected), GAME-API.md (fields used), ROADMAP, STATUS.
- [x] T006 `bot-reviewer` → `review.md`; `spec-auditor` → `audit.md`; fix must/should.
- [ ] T007 Manual check collected in TEST-RUN.md §6d, run later by the user.
