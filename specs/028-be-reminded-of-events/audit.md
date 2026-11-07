# Audit of slice 028 (spec-auditor)

Checks on the worktree, branch 028-be-reminded-of-events: typecheck clean, test 107 files / 3523 tests passed, lint --quiet clean.

## Coverage

| Requirement / scenario | Covering tests | Status |
|---|---|---|
| FR-001 notice create/change/cancel/delete, startup read | client.test.ts (intent, routing), events.test.ts (onStartup, edit), connect.test.ts (tick wiring) | covered |
| FR-002 tag -> Alliance Event | domain/events.test.ts tag tests | covered |
| FR-002a creator check, US1 AS7 | domain/events.test.ts creator tests, events.test.ts refusals (Alliance, Kingdom) | covered |
| FR-003 one invitation, right channel; US1 AS1, AS2, AS5 | events.test.ts (announcements, alliance-chat, once, restart, edit) | covered |
| FR-004, US1 AS3 guides | event-texts.test.ts | covered |
| FR-005, US1 AS6, mention chunks | events.test.ts (Off left out, no mentions, chunks), event-texts.test.ts | covered |
| US1 AS4 unknown tag logged | events.test.ts "refuses ... tag has no Alliance role" | covered |
| FR-006, US2 AS1-AS3 | event-reminders.test.ts, domain/events.test.ts (30 min, kind lead times, Sign-up) | covered |
| FR-007, US2 AS4-AS6, SC-003 | event-reminders.test.ts (Off still mentioned, Guest, nobody Interested, left, not Linked) | covered |
| FR-008 default | domain and event-reminders tests | covered |
| FR-009, US3 AS1-AS3, AS6 | event-kinds.test.ts (roles, 25 limit, unreadable, private) | covered |
| FR-010, US3 AS4-AS5 | domain/events.test.ts, event-reminders.test.ts (own list) | covered |
| FR-011, US4 | event-invitations.test.ts, unlink.test.ts | covered |
| FR-012, US2 AS7-AS8 | event-reminders.test.ts (moved, cancelled, deleted), domain moved start | covered |
| FR-013 logs | events.test.ts, event-reminders.test.ts | covered |
| FR-014 layout, D10 | server-setup.test.ts, setup-plan.test.ts (rolePermissions, dry run, idempotent) | covered |
| Edge: Neil off, late reminder once / dropped after start; D5 collapse | domain/events.test.ts, event-reminders.test.ts | covered |
| Edge: cannot post in channel | event-reminders.test.ts failed post (reminder); events.test.ts failed invitation | partial: missing alliance-chat on a reminder has no test of the retry/log-each-minute behaviour |
| SC-001 / SC-002 timing (1 minute) | connect.test.ts tick skip; the interval is 1 minute | partial: no test asserts the interval itself; manual check only |

## Review fixes
Applied and tested: reminder recorded after posts succeed; role review flags extra permission bits; card title fitted; one-pass membersOnServer; in-flight tick skip.
Still open, as review.md says: no skip of the tick when disconnecting and no await of the running tick in disconnect (client.ts ~1536, 1557); a moved start does not re-remind an already-sent lead time (spec US2 AS7 asks exactly this, so acceptable); a refused Event is re-logged on every edit. The "nobody to mention" reminder is recorded as sent (accepted).

## Tasks
- T001-T020 and T024 ticked and present in code.
- T022 is done (STATUS, ROADMAP, SERVER-SETUP, TEST-RUN 6x all changed) but not ticked.
- T021 unticked: this audit. T023 unticked: the user's manual check (correct).
- STATUS.md says "Merged to main with T001-T022 and T024 done"; it is written ahead of the merge and says T021 audit is "in the spec folder". Check it reads true at merge time.

## Scope creep
None found. Tests of fakes and the schema-v14 fixture serve the migration test.

## Test-server check recorded
Yes as a plan: tasks.md T023 and TEST-RUN.md 6x.1-6x.9, results columns blank (pending the user). Definition of Done 2 is open until then, and STATUS states "Merged red".
