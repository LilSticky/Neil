# Feature Specification: Shield before the reset

**Feature Branch**: `044-shield-before-the-reset`

**Created**: 2026-11-18

**Status**: Approved

**Input**: Issue [#118](https://github.com/LilSticky/Neil/issues/118), with the owner's answers: a mention in the
Alliance channel with a Shielded button, like the Booty Calls (ADR 13); an Event Kind of slice 028, anchored at Friday's
reset; only in weeks a King or Moderator marks as a KvK Week; the list of who has not confirmed goes to each Alliance's
R5 and R4.

On Kingdom 330 many Players forget to shield before Friday's reset, before Saturday's KvK, and every unshielded city
gives the enemy Kingdom easy points. The Game API's `shielding` field always reads 0 (GAME-API.md), so Neil cannot check
shields and relies on each Member confirming.

The approved choices:

1. Each Alliance area gets a channel `alliance-leaders` (Alliance Leaders channel), seen only by a new Managed Role
   `[TAG] Leaders` (Alliance Leaders Role) and Neil. Neil gives the role to the Alliance's Linked R4s and R5s and keeps it
   in step through the existing role paths; the setup script sets the channel's permissions. Neil gets no new Discord
   permission and never edits channel permissions at runtime.
2. Lead times 12 hours, 4 hours and 1 hour before the Shield Deadline (Saturday 00:00 Server Time, 02:00 UTC). Officers
   change them with `/event-kinds add list:kingdom name:Shield`; a Sign-up Deadline is refused for it; removing it
   restores the defaults.
3. After each reminder round a new Shield List per Alliance, mentioning nobody: `N of M confirmed`, who has not, and who
   switched the reminders off.
4. `/kvk-week mark|unmark|show` (Officers) always acts on the week of the next Shield Deadline. Marked late, the missed
   lead times collapse into one reminder sent on the next tick.
5. `/shield-reminders on|off` for Members; without the option it shows the current choice.
6. Shield Confirmations are kept until the Shield Deadline, the unmark or the Unlink; Shield Reminders Off until switched
   on or the Unlink (ADR 26).

Out of scope: marking weeks further ahead, an editable status card, `#kvk-leaders`.

## User Scenarios

### User Story 1: An Officer marks the KvK Week (P1)

A King or Moderator runs `/kvk-week mark`. Neil records the week of the next Friday's reset and answers privately with
the reset as Discord timestamps; marking twice says it is already marked. `unmark` deletes the mark and the week's
Shield Confirmations; `show` says whether the week is marked. Anyone else is refused privately. Each change writes one
`#neil-log` line.

### User Story 2: Members are reminded until they confirm (P1)

In a KvK Week, at each lead time, Neil posts a Shield Reminder in every Alliance's `alliance-chat`, mentioning its Linked
Members (holders of its role) who have not confirmed and have not switched the reminders off, with the reset as a Discord
timestamp and a Shielded button. Each lead time goes out once; with nobody to mention none is posted there.

### User Story 3: A Member confirms (P1)

A Linked holder of the Alliance's role presses Shielded: Neil records it privately and does not mention them again that
week. Anyone else, a press after the reset or in a week no longer marked is refused privately and nothing is recorded.

### User Story 4: The leaders follow up (P1)

After each round, each Alliance's `alliance-leaders` gets a Shield List: the reset, how many confirmed, who has not, and
apart who has the reminders off. It pings nobody, is split under 2,000 characters, and never goes to `#kvk-leaders`.

### User Story 5: A Member switches the reminders off (P2)

A Linked Member runs `/shield-reminders off` and is no longer mentioned; `on` brings the mentions back; without the
option Neil shows the choice. They may still press Shielded.

## Requirements

- **FR-001**: Shield Deadline = the next Saturday 00:00 Server Time strictly after now (`src/domain/shield.ts`).
- **FR-002**: The kingdom's `/event-kinds` list always shows the built-in Shield line with the lead times, the next
  deadline and whether the week is marked; a kingdom kind named Shield sets the lead times; an Alliance's has no effect.
- **FR-003**: Reminders and lists run on the one-minute tick, after the Availability clock, through `dueReminders`, with
  the week's Sunday 00:00 Server Time as the first moment seen; each lead time is recorded before posting.
- **FR-004**: A missing channel or failed post is logged to `#neil-log`, never thrown; the other Alliances still get theirs.
- **FR-005**: `[TAG] Leaders` follows Link, Rank Approval, `/rank`, the Daily Sync, live game data and Unlink.
- **FR-006**: Unlink forgets the Member's confirmations and Shield Reminders Off; the tick deletes confirmations of
  passed weeks.
- **FR-007**: Data in `neil.db`, migration 27: `kvk_week`, `shield_reminder_sent`, `shield_confirmation`,
  `shield_reminders_off` (ADR 26).

## Success Criteria

- Automated tests cover FR-001 to FR-007; typecheck, lint, test and build pass as in CI.
- On test Neil, after the setup script ran, Neil Police sees an `alliance-leaders` per Alliance that only that Alliance's
  R5s and R4s and Neil can see and post in, and a marked week gives a Shield Reminder, a working Shielded button and a
  Shield List (TEST-RUN.md §6ad).
