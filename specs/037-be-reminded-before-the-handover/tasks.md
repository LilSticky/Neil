# Tasks: Be reminded before the Handover

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [x] T001 [P] `dueHandoverPosts` and `HANDOVER_REMINDER_LEADS` in `src/domain/handover.ts` (+ test): before the 24-hour
  mark, at it, late, at the 1-hour mark, the dropped 24-hour reminder, from the siege on.
- [x] T002 [P] Migration 19 and `HandoverStore` (+ tests): one row per siege and kind, a reopened database.

## Phase 2: User Stories 1 and 2 (P1)

- [x] T003 `napLeadersChannelId`, `kingdomAnnouncementsChannelId` and announcement-channel posts in
  `src/discord/event-server.ts` (+ test), and the fake server.
- [x] T004 `createHandoverReminders` in `src/discord/handover-reminders.ts` and the texts in
  `src/discord/handover-texts.ts` (+ test): both reminders and their mentions, the announcement pinging nobody, no post
  twice across ticks and a reopened database, late and dropped posts, Contested, paused, empty and single-Alliance
  rotations, a missing R5, missing channels, a failed post.
- [x] T005 Wire the poster in `src/discord/client.ts` after the Duel Plan on the one-minute tick (+ connect test).

## Phase 3: Polish

- [x] T006 Dictionary (Handover Reminder), ROADMAP row 037, STATUS.
- [ ] T007 Manual check on test Neil through Neil Police (NEIL-POLICE.md section 3a): with `ROYAL_CITY_SIEGE_TIME` set
  about 24 hours ahead and a City Rotation of two Alliances whose R5s are on the server, Police sees the 24-hour reminder
  in `#nap-leaders` mentioning both R5s and the announcement in `#home-kingdom-announcements` mentioning nobody; with the
  siege about 1 hour ahead, the 1-hour reminder. A human confirms the texts read clearly and show local times.
