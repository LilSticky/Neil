# Feature Specification: Be reminded before the Handover

**Feature Branch**: `037-be-reminded-before-the-handover`

**Created**: 2026-11-16

**Status**: Approved

**Input**: Issue [#132](https://github.com/LilSticky/Neil/issues/132), split from #120, built on slice 035 (See whose turn
it is, [#131](https://github.com/LilSticky/Neil/issues/131)) and the reminder clock of slice 028. Discovery:
[royal-city-rotation.md](../../documentation/discovery/royal-city-rotation.md). The owner's decisions (2026-11-15/16):

1. Two Handover Reminders: 24 hours and 1 hour before the Friday Royal City siege (Server Time).
2. The next-holder announcement in `#home-kingdom-announcements` goes out with the first one, 24 hours before.
3. The leaders mentioned are the Members holding both the R5 role and the Alliance's role (no Game API request).
4. The announcement mentions nobody.
5. A post missed while Neil was off goes out late while the siege is still ahead; a 24-hour reminder overtaken by the
   1-hour one is dropped; the announcement still goes out.
6. No reminders in Contested Kingdoms.

## User Scenarios

### User Story 1: The R5s are reminded of the Handover (P1)

24 hours before each Friday Royal City siege, the R5s of the Holding Alliance (outgoing) and of the next Alliance in the
City Rotation (receiving) are mentioned in a Handover Reminder in `#nap-leaders`, naming both Alliances and the siege as a
Discord timestamp. One hour before the siege, a second Handover Reminder says the siege starts soon.

**Acceptance**:

1. At siege − 24 h: one reminder in `#nap-leaders`, mentioning exactly the R5 holders of both Alliances, with the siege as
   `<t:…:F>` and `<t:…:R>`.
2. At siege − 1 h: the second reminder, same Alliances and mentions, saying the siege starts soon.
3. An Alliance with no Member holding R5 and its role is named without a mention; one `#neil-log` line says so.

### User Story 2: The Kingdom learns who holds the Royal City next (P1)

With the 24-hour reminder, `#home-kingdom-announcements` gets one line naming the receiving Alliance by `[TAG]` and the
siege as a Discord timestamp. It pings nobody.

### Edge cases

- Each post goes out at most once per siege, across repeated ticks and restarts (migration 20, `handover_posts`).
- Neil was off at a post's moment: sent late while the siege is ahead; the 24-hour reminder is dropped once the 1-hour
  one is due; the announcement still goes out.
- Nothing is posted in Contested mode, without `ROYAL_CITY_SIEGE_TIME` (paused), without a City Rotation, or when the
  next Alliance is the Holding Alliance.
- A missing `#nap-leaders` or `#home-kingdom-announcements` writes one error line per post; a failed post is logged once
  and not retried.

## Requirements

- **R1** 24 hours before each Friday Royal City siege (Server Time), a Handover Reminder in `#nap-leaders` names the
  outgoing and the receiving Alliance and mentions the R5 of each.
- **R2** A second Handover Reminder 1 hour before the siege, with the same Alliances and mentions.
- **R3** With the 24-hour reminder, the next-holder announcement in `#home-kingdom-announcements` (an announcement
  channel), mentioning nobody.
- **R4** Leaders are the holders of R5 and the Alliance's role; none: named without a mention, one `#neil-log` line.
- **R5** At most once per siege, across restarts; late only before the siege; an overtaken 24-hour reminder is dropped.
- **R6** Nothing when there is nothing to hand over; a missing channel is logged.
- **R7** Runs on the one-minute clock of the Event Reminders and the Duel Plan.
- **R8** Documentation describes the new reminders.

## Out of scope

Moving the King role, changing the City Rotation, Contested Kingdoms, any Game API request.
