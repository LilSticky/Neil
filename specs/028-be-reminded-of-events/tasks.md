# Tasks: Be reminded of events

**Input**: [spec.md](spec.md), [plan.md](plan.md). Every code task is red (`test-first`), then green (`implementer`), then review.
Tasks in one phase run in order unless marked [P].

## Phase A: Foundation

- [x] T001 [P] Event rules in `src/domain/events.ts`: an Alliance tag from `[TAG] …` in the name (FR-002); lead-time parsing of `24h, 1h, 10m` or `2d`, at most 3 per list, each from 1 minute to 7 days (plan D9)
- [x] T002 [P] Migration 15 in `src/storage/database.ts` and `src/storage/event-store.ts`: `events` (`event_id` PK, `first_seen_at`, `invited_at` null), `event_reminders_sent` (PK `event_id`, `target` `start`/`signup`, `lead_minutes`; cascade), `event_kinds` (`owner` `kingdom` or a tag, `name` unique per owner ignoring case, `before_start` JSON, `signup_offset_minutes` null, `before_signup` JSON; at most 25 per owner), `event_invitations_off` (`member_id` PK)
- [x] T003 `GuildScheduledEvents` intent, and the Event as Neil reads it (id, name, start, description, status, creator) validated at the boundary in `src/discord/events.ts` (FR-001, plan D1)

## Phase B: US1, Members are invited to a new Event (P1)

- [x] T004 [US1] Creator check in `src/domain/events.ts`: an Alliance Event needs a creator Linked as that Alliance's R4 or R5 or an Officer; a Kingdom Event needs an Officer; no creator is refused (FR-002a, plan D3)
- [x] T005 [US1] Invitation card and mention chunks in `src/discord/event-texts.ts`: name, `<t:…:F>` and `<t:…:R>`, links from the description as guides (at most 10), a link to the Discord event; chunks of 80 mentions with `allowedMentions.users` exact; no links gives no guides (FR-004, plan D8)
- [x] T006 [US1] On a created Event in `src/discord/events.ts`: place it (`#event-announcements` or the Alliance's `alliance-chat`), mention `Events` or `[TAG]` holders less Event Invitations Off, post once (`invited_at`), log; an unknown tag or refused creator posts nothing and logs (US1 AS1–AS7, FR-003, FR-005, FR-013)
- [x] T007 [US1] At startup, fetch the Events still ahead and invite those not yet invited; an edit or restart never posts a second invitation; a failed post logs and breaks nothing (FR-001, US1 AS5, edge cases)

## Phase C: US2, Interested Members are reminded (P1)

- [x] T008 [US2] `dueReminders` in `src/domain/events.ts`: targets `start` and `signup`, keyed by lead time; skip those due before `firstSeenAt`, after the target, or for a cancelled, completed or deleted Event; several due at once for one target collapse into the shortest lead time; no kind gives one reminder 30 minutes before the start and no Sign-up reminder (FR-006, FR-008, FR-012, plan D5, D7)
- [x] T009 [US2] Kind match in `src/domain/events.ts`: the kind's name in the event name, ignoring case, longest wins, only the Event's own list (FR-010, US3 AS4–AS5)
- [x] T010 [US2] Reminder texts in `src/discord/event-texts.ts`: start and Sign-up lines with the deadline, the event link, mention chunks (plan D8)
- [x] T011 [US2] The one-minute tick in `src/discord/events.ts`: fetch subscribers, mention only Linked Members who may take part (no Guests for a Kingdom Event, Alliance role for an Alliance Event), Event Invitations Off ignored, nobody Interested posts nothing, record sent, log (FR-007, US2 AS1–AS8, plan D2)
- [x] T012 [US2] Moved start, cancel and delete: reminders follow the new start without repeats; a deleted Event's rows go (FR-012, US2 AS7–AS8)

- [x] T024 [US1] Wire it in `src/discord/client.ts` and `src/main.ts`: the scheduled-event create, update and delete handlers, the startup catch-up, the one-minute tick (stopped on shutdown, as the sweeper), and the real `EventInvitationServer` over discord.js (holders, roles, channels, posts, `#neil-log`, `fetchSubscribers`) (FR-001, plan D1, D2, D5)

## Phase D: US3, Leaders set their Event Kinds (P2)

- [x] T013 [US3] `/event-kinds add|remove|list` in `src/discord/event-kinds.ts` and its texts: R4 or R5 for their Alliance, Officers for the kingdom, `list` option for both, private answers, refusals keep what was recorded, `add` replaces the same name, at most 25 (FR-009, US3 AS1–AS3, AS6, plan D9)
- [x] T014 [US3] Register `/event-kinds` in `src/discord/commands.ts` and `/help` (slice 027)

## Phase E: US4, A Member switches invitations off (P3)

- [x] T015 [US4] `/event-invitations [invitations:on|off]` in `src/discord/event-invitations.ts`: any Linked Member, private, shows the choice without the option; registered in `commands.ts` and `/help` (FR-011, US4 AS1–AS2)
- [x] T016 [US4] Unlink forgets Event Invitations Off in `src/discord/unlink.ts` (FR-011, US4 AS3, plan D11)

## Phase F: Server Layout

- [x] T017 Neil's overwrite on `event-announcements` (View Channel, Send Messages, Embed Links) in `server-layout.json` (FR-014)
- [x] T018 `rolePermissions` in `server-layout.json`, `src/domain/server-layout.ts` and `src/discord/server-setup.ts`: `R4`, `R5`, `Moderator`, `King` → `CreateEvents`; add a missing permission, never remove; dry run reports it; a second run has nothing to do (FR-014, plan D10)

## Phase G: Finish

- [x] T019 ADR 14 in `documentation/adr/`: the `GuildScheduledEvents` intent and the stored data (Event Invitations Off, sent reminders)
- [x] T020 `bot-reviewer` pass, findings in `review.md`
- [x] T021 `spec-auditor` pass, findings in `audit.md`
- [x] T022 Docs: STATUS, ROADMAP, SERVER-SETUP (Create Events, where Neil can see events), TEST-RUN.md §6x
- [ ] T023 Manual check on the test server, by the user (needs the deploy, `npm run commands:register` and the setup script)

## Dependencies

A before everything. B before C (an Event must be placed before it is reminded). D, E and F can follow C in any order. G last.
MVP: phases A–C (invitations and default reminders).
