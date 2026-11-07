# Implementation Plan: Be reminded of events

**Branch**: `028-be-reminded-of-events` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md) | **Discovery**: [028](../../documentation/discovery/028-be-reminded-of-events.md)

## Summary

Neil reads Discord scheduled events (a new, unprivileged intent). For each new Event whose creator may create it, Neil posts one
Event Invitation in `#event-announcements` (Kingdom Event) or in the Alliance's `alliance-chat` (Alliance Event, `[TAG]` in the
name). Then a one-minute tick posts Event Reminders at the Event Kind's lead times, mentioning the Members who clicked Interested.
`/event-kinds` keeps the kingdom's and each Alliance's Event Kinds, and `/event-invitations` switches invitation mentions off.
One migration, two commands, one ADR. Research, data model and contracts are short, so they live here, as in recent slices.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24 LTS

**Primary Dependencies**: discord.js 14.27 (`GuildScheduledEvent`, `fetchSubscribers`), zod. No new dependency.

**Storage**: `neil.db`, migration 15: `events`, `event_reminders_sent`, `event_kinds`, `event_invitations_off`

**Testing**: Vitest, with a fake clock and fakes at the Discord boundary

**Target Platform**: Wispbyte (ADR 6)

**Performance Goals**: invitation within 1 minute of creation (SC-001); reminders within 1 minute of their lead time (SC-002)

**Constraints**: at most 100 mentioned users per message (chunks of 80, as slice 026); no Game API request at all

**Scale/Scope**: a handful of Events a week, up to 25 Event Kinds per list

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what a Member gets. Event, Kingdom Event, Alliance Event, Event Kind, Sign-up, Sign-up Deadline, Event Invitation, Event Invitations Off and Event Reminder were approved by the user and are in the dictionary on this branch. |
| II. TDD | Every code task is `test-first`, then `implementer`. |
| III. Framework-Free Domain | `src/domain/events.ts` takes names, times and lists as plain values: kind matching, Alliance tag, due reminders, lead-time parsing. No timers or discord.js. |
| IV. Respect the Game API | No Game API request. Who belongs to an Alliance comes from its `[TAG]` role and the Links. |
| V. Least Privilege | One new intent, `GuildScheduledEvents`, not privileged (ADR 14). Neil gets View Channel, Send Messages and Embed Links on `#event-announcements` through its overwrite; `alliance-chat` already has them (slice 026). Neil does not get Manage Events. The stored data (Event Invitations Off, which reminders were sent) is in ADR 14. Invitations, reminders and refused Events are logged. |
| VI. Context Never Gets Lost | STATUS, ROADMAP, SERVER-SETUP, TEST-RUN §6x and ADR 14 change in this slice. |
| VII. Small Vertical Slices | One PR, usable end to end; Event Kinds (P2) and the opt-out (P3) come after the P1 stories in tasks. |

Passes, before and after design.

## Decisions (research)

### D1. Reading Events

`GatewayIntentBits.GuildScheduledEvents` delivers `guildScheduledEventCreate`, `Update` and `Delete`, and fills
`guild.scheduledEvents`. At startup Neil fetches them once (FR-001). Neil sees only events in channels it can view, or with an
external location; SERVER-SETUP says so. Rejected: polling the REST list, which is slower and costs requests.

### D2. Who is Interested

`GuildScheduledEvent.fetchSubscribers({ withMember: true })` at reminder time, paged by 100. Reading the list when it is needed
avoids the `GuildScheduledEventUserAdd` and `Remove` bookkeeping and the cases where Neil missed one. Rejected: storing
subscribers from those events.

### D3. Creator check (FR-002a)

`creatorId` → the Link store gives the Alliance and rank; the Member's role IDs give Officer (`isOfficer`). An event with no
`creatorId` (created before Discord recorded it) is refused like any other, with a log line.

### D4. Which Alliance and channel

A name that starts with `[TAG]` is an Alliance Event. Its channel is the `alliance-chat` under the category named after the
Alliance role, found as `/booty` finds it (slice 026). A tag with no such role or channel posts nothing and is logged (US1 AS4).
Mentioned at invitation: holders of `Events` (Kingdom Event) or of `[TAG]` (Alliance Event), less Event Invitations Off.

### D5. One tick, pure due rule

A `setInterval` of one minute, wired as the sweeper is, calls `dueReminders(event, kind, sent, firstSeenAt, now)` in the domain. A
reminder is a target (`start` or `signup`) plus a lead time; it is due when `now` has passed `target − lead` and it is not in
`sent`. It is skipped, not sent, when:

- its due time is before `firstSeenAt` (an Event created close to its start: "only reminders still ahead go out");
- the Event has started (for `start`) or the Sign-up Deadline has passed (for `signup`);
- the Event is cancelled, completed or deleted.

Several reminders due at once for one target (Neil was off) collapse into the shortest lead time, and the others are recorded as
sent. This reads "a missed reminder is sent once, late" as one late message, not a burst.

### D6. Kind, at tick time

The Event Kind is looked up at each tick in the Event's own list (`kingdom` or the tag), not stored, so a kind changed after the
Event was created applies. Match: the kind's name appears in the event name, ignoring case; the longest name wins (FR-010). No
match: one reminder 30 minutes before the start (FR-008).

### D7. A moved start

`sent` is keyed by target and lead time, not by clock time, so a moved start keeps what was sent and the rest follow the new
start (US2 AS7). The invitation is not posted again on an edit (US1 AS5): `events.invited_at` is set once.

### D8. Messages

The card is an embed: name, `<t:unix:F>` and `<t:unix:R>` for the start (each reader's own time), the links from the
description as guides (`https?://` URLs, at most 10), a link to the Discord event. Mentions go in the content with
`allowedMentions.users` set exactly, in chunks of 80; the first chunk rides on the card (slice 026). A reminder is one line:
"⏰ **AD round 3** starts <t:…:R>" or "📝 Sign-up for **AD round 3** closes <t:…:R>", plus mentions and the event link.

### D9. Commands

- `/event-kinds add name:<text> before-start:<text> [signup-deadline:<text>] [before-signup:<text>] [list:kingdom|alliance]`;
  `/event-kinds remove name:<text> [list]`; `/event-kinds list [list]`. Times are written like `24h, 1h, 10m` or `2d`; at most 3
  per list, each from 1 minute to 7 days. `add` replaces a kind of the same name. `list` defaults to the caller's Alliance for an
  R4 or R5, else the kingdom for an Officer; an Officer who is also R4 or R5 chooses with it. All answers private.
- `/event-invitations [invitations:on|off]`: without the option, it shows the current choice. Private. Any Linked Member.

### D10. Create Events right

The setup script sets it (the user's decision, 2026-11-07). `server-layout.json` gains a top-level `rolePermissions` map, role name
→ server-wide permissions to add: `R4`, `R5`, `Moderator` and `King` → `CreateEvents`. The plan step adds a missing permission to
the role and never removes one; a dry run reports `would allow CreateEvents on R4`, and a second run has nothing to do. It runs
under the temporary Administrator of ADR 12, so Neil needs no new standing permission. The channel part of FR-014 (Neil on
`#event-announcements`) is an overwrite in the layout. Rejected: a hand step in SERVER-SETUP.md (the user chose the script).

### D11. Unlink

Unlink forgets Event Invitations Off, as it forgets Booty Alerts.

## Data model

| Table | Columns | Notes |
|-------|---------|-------|
| `events` | `event_id` PK, `first_seen_at`, `invited_at` null | One row per Event Neil has placed; deleted with the Discord event. |
| `event_reminders_sent` | `event_id`, `target` (`start`/`signup`), `lead_minutes`; PK all three | Cascade on `events`. |
| `event_kinds` | `owner` (`kingdom` or a tag), `name` (stored as typed, unique per owner ignoring case), `before_start` (JSON minutes), `signup_offset_minutes` null, `before_signup` (JSON minutes) | At most 25 per owner. |
| `event_invitations_off` | `member_id` PK | Deleted at Unlink. |

Name, start, description and status are read from Discord each time, never stored.

## Project Structure

```text
src/domain/events.ts               tag, kind match, lead-time parsing and limits, due reminders
src/discord/events.ts              scheduled-event handlers, invitation, tick and reminders
src/discord/event-kinds.ts         /event-kinds
src/discord/event-invitations.ts   /event-invitations
src/discord/event-texts.ts         card, reminders, replies, log lines
src/storage/event-store.ts         events, sent reminders, kinds, invitations off
src/storage/database.ts            migration 15
src/discord/commands.ts, client.ts, unlink.ts, src/main.ts   wiring, intent
server-layout.json                 Neil's overwrite on event-announcements, rolePermissions
src/domain/server-layout.ts, src/discord/server-setup.ts   rolePermissions: parse, plan, apply
documentation/adr/0014-…md         the intent and the stored data
```

## Validation (quickstart)

Automated: `npm run test`, `npm run lint`, `npm run typecheck`. Manual: TEST-RUN.md §6x on the test server after the deploy,
`npm run commands:register` and the setup script: a Kingdom Event by an Officer, an Alliance Event by an R5, one by a plain
Member (refused), Interested and a short Event Kind (1 and 2 minutes) to see reminders, a moved start, a cancel, and
`/event-invitations off`.

## Complexity Tracking

None.
