# Feature Specification: Plan the Raid

**Feature Branch**: `034-plan-the-raid`

**Created**: 2026-11-16

**Status**: Approved

**Input**: Issue [#138](https://github.com/LilSticky/Neil/issues/138), split from #117; the first cut of
[discovery/kvk-battle-plan.md](../../documentation/discovery/kvk-battle-plan.md) (sections 3, 6 and 7). Saturday's KvK Raid
is not planned in time, and the plan does not reach the Alliances clearly.

## Decisions (approved with the spec)

1. One `/raid-plan` command with subcommands (`show`, `objective-add`, `objective-remove`, `phase-add`, `phase-remove`,
   `assign`, `unassign`, `notes`, `publish`, `cancel`), answered privately with a preview. It is visible to everyone;
   Neil refuses callers without the War Council role privately.
2. `RAID_START` (HH:MM Server Time, Saturday) has no default and is required once `DISCORD_WAR_COUNCIL_ROLE_ID` is set.
   The Plan Deadline defaults to 24 hours and the Confirmation Deadline to 2 hours before the start.
3. `#kvk-leaders` is seen by R5, R4, War Council and King (and Neil).
4. An R5 or R4 of the Alliance confirms at any time; the first press counts. Asks and chases mention both R5s and R4s.
5. Raid Reminders go to each assigned Alliance's `alliance-chat`, mentioning its Members: 30 minutes before the start and
   at each of its Phases.
6. Confirmation Chases go out 12 hours and 2 hours before the Confirmation Deadline (fixed in code).
7. Changes are saved at once; publishing again edits both posted cards in place and keeps the confirmations.
8. A cancel is final for that week's Raid.

## User Scenarios

### User Story 1: The War Council drafts and publishes a Battle Plan (P1)

A War Council holder adds Phases (times in Server Time on Raid day), assigns Alliances to Objectives (the enemy Royal
City, the four Cannon Towers, the enemy sanctuaries, or their own), adds notes and sees a private preview. Publishing
posts the plan card in `#kvk-announcements` and a confirmation card with a **Read and confirmed** button in
`#kvk-leaders`, mentioning once the R5s and R4s of every Home Kingdom Alliance.

### User Story 2: Each Alliance confirms (P1)

An R5 or R4 of an Alliance presses **Read and confirmed**; the card shows who confirmed and when. Anyone else, a second
press, or a press on a cancelled Raid gets a private answer.

### User Story 3: Neil keeps the plan on time (P2)

If nothing is published by the Plan Deadline, Neil mentions the War Council in `#kvk-leaders`. It chases unconfirmed
on-plan Alliances 12 h and 2 h before the Confirmation Deadline and gives the War Council the missing list at the
deadline. Off-plan Alliances are asked once, never chased. On Raid day each assigned Alliance gets a Raid Reminder in
its `alliance-chat` 30 minutes before the start and at each of its Phases. Each notice goes out at most once, also across
restarts; a cancelled Raid sends nothing more.

## Requirements

R1–R16 as approved in the factory's spec step for issue #138: configuration (R1), server layout (R2), the command and its
role check (R3), Objectives, Phases, Assignments and notes (R4–R7), publish, amend and cancel (R8–R10), the Plan Deadline
(R11), Plan Confirmations (R12), chases and the Confirmation Deadline (R13), Raid Reminders (R14), logging and
persistence (R15, migration 17) and the docs (R16).

## Out of scope

Availability Poll and Fighter Class (Know who fights), translated copies of the cards, shield reminders.

## Not verified

Whether Interaction Bot translates Neil's plan card in `#kvk-announcements` (it may ignore bot posts or embeds): check on
the test server.
