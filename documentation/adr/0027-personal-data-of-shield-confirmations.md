# 27. Personal data of Shield Confirmations

Date: 2026-11-18

## Status

Accepted

## Context

Slice 045 reminds the Members of each Home Kingdom Alliance to shield their city before Friday's reset in a KvK Week
(issue #118). The Game API cannot tell whether a city is shielded (its `shielding` field always reads 0, GAME-API.md),
so Neil relies on each Member pressing Shielded. The Alliance's R4s and R5s get a Shield List of who has not confirmed,
so they can follow up in the game. The constitution (principle V) asks that personal data is kept to what a feature
needs, and that what is stored, and for how long, is documented in an ADR.

## Decision

We will store, in `neil.db` (migration 28):

- `shield_confirmation`: per week and Member, the Member id and when they pressed Shielded. Deleted on the first tick
  after that week's Shield Deadline, when an Officer unmarks the week, and at Unlink.
- `shield_reminders_off`: the ids of the Members who switched Shield Reminders off. No row means on. Deleted when the
  Member switches them on again, and at Unlink.
- `kvk_week`: per week, when it was marked and the id of the Officer who marked it; `shield_reminder_sent`: per week,
  the lead times already sent. These say nothing about a Member's own city and are kept, like the other logs of what
  Neil did.

We will show a Member's confirmation and choice only in the Shield List, in their own Alliance's `alliance-leaders`
channel, which only that Alliance's Leaders Role (its Linked R4s and R5s) and Neil see. The list names Members with
mentions turned off, so nobody is pinged. The `#neil-log` line of a round holds only counts; the lines for marking and
unmarking name the Officer.

## Consequences

- A Member who never presses Shielded and never switches the reminders off has no row at all.
- A confirmation lives at most one week. After the reset no one can tell from Neil who confirmed.
- The Shield List shows the Alliance's leaders who has not confirmed and who switched reminders off. That is the
  purpose of the list; it reaches nobody outside the Alliance's leaders.
- The Shield Reminder in `alliance-chat` shows the Alliance who is still being reminded, as any mention does.
- A Member who leaves the server is Unlinked, so their rows go with the Link.
