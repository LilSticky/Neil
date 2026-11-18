# 25. NaP Motions and the decision log

Date: 2026-11-18

## Status

Accepted. Amends [ADR 22](0022-public-nap-list-and-announcements.md) and [ADR 23](0023-votes-of-the-nap-council.md)
for NaP Motions only.

## Context

Slice 043 ("Decide by NaP Motion", issue #158, split from #121) lets the NaP Council decide any matter by vote and keep
a record of what was agreed, and by whom, to reduce disputes. A member of the NaP Council opens a **NaP Motion** with a
text and a deadline; each Alliance in the NaP has one vote, cast by one of its Linked R5s, as in the NaP Vote of ADR 23.
The issue asks that the result is published in a decision log everyone can read, **with each Alliance's vote**. ADR 23
keeps votes on join requests private (only counts are shown), and ADR 22 keeps Members out of public NaP views. So Neil
now stores motions and their votes, and publishes each Alliance's vote once a motion closes.

## Decision

We will store, in `neil.db` (migration 26):

- in `nap_motions`, one row per motion: its text, the Discord user id of the council member who opened it and the tag of
  their Alliance, when it opened and when its vote ends, its message in `#nap-leaders`, when the Linked R5s who had not
  voted were reminded, and once closed its outcome (`approved` or `rejected`), its Approve and Decline counts and when
  it closed;
- in `nap_motion_votes`, one row per Alliance per motion: the Alliance's tag, the Discord user id of the Linked R5 whose
  press counts (the latest press of that Alliance), the vote and its time.

Motions and votes are kept after a motion closes, as long as the NaP history, and are not deleted when a Member is
Unlinked, for the same reason as ADR 20 and ADR 23: they are the record of what the council agreed.

While a motion runs, its votes stay hidden: the motion in `#nap-leaders` shows no count, and who voted what is visible
only in `#neil-log` (one line per vote and change, mentions off) and in `neil.db`. The one reminder in `#nap-leaders`
mentions the Linked R5s of the Alliances that have not voted, never how anyone voted.

When the motion closes, Neil posts a decision-log entry in the original `#nap-announcements` (translated by the
Interaction Bot like the other NaP announcements): the text, the opening Alliance, when it opened and closed, the
result with its counts, and **each Alliance's vote** (Approve, Decline or did not vote). This is the one place where a
vote of the NaP Council is published. It names Alliances only: no Member is mentioned, named or shown by id, the opener
appears only as their Alliance, and Member mentions in the motion's text are replaced. The join-request NaP Vote of
ADR 23 is unchanged: its votes stay private.

## Consequences

- Everyone can read what the NaP Council agreed, and how each Alliance voted, which settles disputes about decisions.
- An Alliance's vote on a motion becomes public once the motion closes; council members should know this when voting.
- Officers can reconstruct who voted for each Alliance from `neil.db` and `#neil-log`, also after Unlinks.
- A Member who wants their id removed from a motion needs an operator to edit `neil.db` by hand.
- Changing what is stored, how long it is kept, or who sees it needs a new ADR.
