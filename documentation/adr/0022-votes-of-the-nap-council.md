# 22. Votes of the NaP Council

Date: 2026-11-17

## Status

Accepted

## Context

Slice 041 ("Vote on NaP join requests", issue #150) replaces the single approval of a NaP join request (slice 038,
ADR 20) with a **NaP Vote**: each Alliance in the NaP votes Approve or Decline through one of its Linked R5s, the vote
closes 48 hours after it opens, and more Approve than Decline votes approve the request; a tie or no votes decline it.
A declined Alliance waits 30 days (the **NaP Cooldown**) before it may ask again. The issue asks that every vote, the
result and the cooldown are logged and kept in the NaP history. So Neil now stores who voted what, and declines. ADR
20 says that changing what the NaP register stores, how long, or who sees it needs a new ADR.

## Decision

We will store, in `neil.db` (migration 24), in addition to ADR 20:

- in `nap_votes`, one row per Alliance per join request: the request (tag and time), the voting Alliance's tag, the
  Discord user id of the Linked R5 whose press counts (the latest press of that Alliance), the vote and its time. A
  later press of the same Alliance replaces its row;
- in `nap_join_requests`, the end of the request's NaP Vote (NULL until the vote opens: a request made while the NaP
  had no members gets its vote once the NaP has a member);
- in `nap_history`, declines as well as joins and leaves, and for both how they were decided: by an Officer (their
  Discord user id, while the NaP has no members), by one NaP Council member (rows from before this change), or by vote
  (the Approve and Decline counts, no Member). The NaP Cooldown is not stored: it follows from the latest decline.

The votes are kept after the decision as its record, as long as the history, and are not deleted when a Member is
Unlinked, for the same reason as ADR 20. Who voted what is visible only in `#neil-log` (one line per vote and vote
change, mentions off) and in `neil.db`. The request message in `#nap-leaders` shows no running count; `/nap history`
shows only the counts; `/nap show` shows when each vote ends and no Members.

## Consequences

- Officers can reconstruct every vote from `neil.db` and `#neil-log`, also after the voters left or were Unlinked.
- Voters are not exposed to other council members while the vote runs, which avoids pressure on late voters.
- A Member who wants their id removed from the votes needs an operator to edit `neil.db` by hand.
- Changing what is stored, how long it is kept, or who sees it needs a new ADR.
