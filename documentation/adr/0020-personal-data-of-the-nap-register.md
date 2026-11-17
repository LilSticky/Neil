# 20. Personal data of the NaP register

Date: 2026-11-16

## Status

Accepted

## Context

Slice 038 ("Join the NaP", issue #143) keeps a register of the NaP: which Alliances of the Home Kingdom are in it, and
a history of every join and leave. The R5 of an Alliance asks to join with `/nap join`, a member of the NaP Council
(or, while the NaP has no members, an Officer) approves it with a button in `#nap-leaders`, and the R5 alone takes the
Alliance out with `/nap leave`. The NaP is a set of decisions made by Alliance leaders, so the issue asks Neil to
record who asked, who approved or left, and when. That is personal data. The constitution (principle V) asks that
personal data is kept to what a feature needs, and that what is stored, and for how long, is recorded in an ADR. ADR 5
decided SQLite for Neil's storage.

## Decision

We will store, in `neil.db` (migration 21):

- in `nap_history`, one row per join or leave: the Alliance tag, the time, and the Discord user id of the Member who
  approved the join or took the Alliance out; for a join also the Discord user id of the Member who asked, the time of
  the request, and whether the approver acted as NaP Council member or as Officer;
- in `nap_join_requests`, one row per open join request: the Alliance tag, the Discord user id of the Member who asked,
  the time, and the channel and message id of the request in `#nap-leaders`. The row is removed when the request is
  approved, or when it could not be posted.

We store no usernames, nicknames, Player Names or uids for the NaP. Who is on the NaP Council is not stored either: it
is worked out from the existing Links (ADR 7) when a Member acts.

The history is the NaP's record of its own decisions. It is kept as long as Neil runs, and it is not deleted when a
Member is Unlinked: the ids in it record what the Member did as an Alliance leader. It is shown only to the NaP
Council and Officers (`/nap history`); any Member sees only which Alliances are in the NaP since when, and which
Alliances wait for approval (`/nap show`), without the Members behind them.

## Consequences

- Officers and the NaP Council can reconstruct every join and leave from `neil.db`, also after the people involved
  left the server or were Unlinked.
- A Member who wants their id removed from the history needs an operator to edit `neil.db` by hand.
- Each request, approval and leave also writes one line to `#neil-log`, as a mention by id with mentions off.
- Changing what is stored, how long it is kept, or who sees it needs a new ADR.
