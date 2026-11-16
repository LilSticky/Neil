# 18. Personal data of the City Rotation

Date: 2026-11-16

## Status

Accepted

## Context

Slice 034 ("See whose turn it is", issue #131) lets the R5s of the Alliances in the City Rotation keep its order,
lets Officers name the Holding Alliance, and after each Royal City siege asks the receiving Alliance's R5 to confirm
the Handover. The R5 is read fresh from the Game API (`leader_id`). The constitution (principle V) asks that personal
data is kept to what a feature needs, and that what is stored, and for how long, is recorded in an ADR. ADR 5 decided
SQLite for Neil's storage.

## Decision

We will store, in one `city_rotation` row of `neil.db`:

- the order of the City Rotation as Alliance tags, and the Holding Alliance's tag;
- while a Handover waits for confirmation: the expected Alliance's tag, the Royal City siege it follows, the id of the
  confirmation message in `nap-leaders`, and the uid of that Alliance's R5 when the Game API named one (public game
  data). The uid is cleared with the Handover, when it is confirmed or an Officer or R5 changes the rotation;
- the last Royal City siege Neil handled, and the id of the pinned card in `nap-announcements`.

We store no Discord user ids, usernames or nicknames for the City Rotation. Who set the order, who named a holder and
who confirmed a Handover is written only to `#neil-log`, as a mention by id; that log is Discord's to keep. The R5's
Member is found from the existing Link (ADR 7) when the button is pressed, not stored.

## Consequences

- Officers can reconstruct every change to the City Rotation from `#neil-log`, not from `neil.db`.
- A Member whose Link ends can no longer confirm as R5; an Officer still can.
- The row keeps the order when the server switches to Contested, so switching back restores it.
- Changing what is stored, or keeping the confirmer, needs a new ADR.
