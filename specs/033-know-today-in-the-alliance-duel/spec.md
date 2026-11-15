# Feature Specification: Know today in the Alliance Duel

**Feature Branch**: `033-know-today-in-the-alliance-duel`

**Created**: 2026-11-15

**Status**: Approved

**Input**: Issue [#109](https://github.com/LilSticky/Neil/issues/109). Each Alliance Duel day, Monday to Saturday, rewards
different actions; a Player who spends speedups or resources on the wrong day loses score. The owner's decisions
(2026-11-15):

1. The day plan is a file in the repository with one text per Duel day: what scores today and what to save for a later
   day. The owner or a leader supplies it, and changes go through a pull request.
2. The Alliance Duel is an Event Kind of slice 028 and posts through its Events mechanism, not a feature with its own
   channel.
3. One post per Duel day at the game's daily reset, 00:00 Server Time. No opt-in mention in this slice.

## User Scenarios

### User Story 1: A Member sees today's Duel Plan (P1)

At 00:00 Server Time on a Duel day, a Member finds one card in `#event-announcements`, titled `Alliance Duel: <Day>`,
with what scores today, what to save for later, and when the Duel day ends as a Discord timestamp in their own clock.

**Acceptance**:

1. Monday 02:00 UTC: one card `Alliance Duel: Monday`, both texts, mentioning nobody, ending at Tuesday 02:00 UTC shown as
   `<t:…:t>` and `<t:…:R>`.
2. Sunday in Server Time (including Monday before 02:00 UTC): nothing is posted.
3. Neil was off at the reset and starts at 20:00 UTC the same day: the card is posted then; never on a later day.
4. Restarts and ticks every minute post at most one card per Duel day. A failed post is logged once and not retried.
5. A Duel day without a text posts no card and writes one `#neil-log` line.

### User Story 2: An Officer sees the Alliance Duel among the kingdom's Event Kinds (P2)

`/event-kinds list` for the Home Kingdom ends with a built-in Alliance Duel line: daily plan in `#event-announcements` at
00:00 Server Time, Monday to Saturday, and the next Duel-day reset as a Discord timestamp (Sunday's reset is skipped). It
shows also with no stored kinds. Alliance lists have no such line. `add` and `remove` are unchanged.

## Requirements

- **R1** Server Time is the game's clock, UTC-2; the daily reset at 00:00 Server Time is 02:00 UTC. The offset is defined
  once, in `src/domain/server-time.ts`.
- **R2** The day plan lives in `src/duel-plan.ts`, typed so that all six days must be present; each text is at most 1024
  characters (Discord's embed field limit). It ships with empty texts.
- **R3** Duel days are Monday to Saturday in Server Time; Sunday has none.
- **R4** At each reset that starts a Duel day, one Duel Plan card goes to `#event-announcements`. It mentions nobody.
- **R5** At most once per Duel day, across restarts (migration 16, `duel_plan_posts`); late only within the same day.
- **R6** An empty day text posts nothing and writes one `#neil-log` line.
- **R7** Runs on the Events' one-minute tick; no Game API requests, no new setting.
- **R8** The kingdom's `/event-kinds list` shows the Alliance Duel line with the next Duel-day reset.
- **R9** The dictionary defines Server Time and Duel Plan.

## Out of scope

Opt-in mentions (a later slice), Alliance lists of Event Kinds, changing the plan from Discord, and any change to Event
Invitations or Event Reminders. The Daily Quota reset (00:00 UTC) and the Daily Sync hour are unchanged.
