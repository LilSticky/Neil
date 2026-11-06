# 13. Personal data of Booty Alerts

Date: 2026-11-07

## Status

Accepted

## Context

Slice 026 lets a Member record when they want to be mentioned for a Booty Call: a mode, a daily time window and a city time zone.
The constitution (principle V) asks that personal data is kept to what a feature needs, and that what is stored, and for how long,
is documented in an ADR. A time zone and a window hint at where a Member lives and when they sleep.

## Decision

We will store, per Member who records them, the Member id, mode, time window and time zone in `booty_alerts`, until the Member
changes them or is Unlinked. We will show them only to that Member, privately.

We will not store Booty Calls: the cooldown lives in memory and is lost at a restart. The log line holds the caller, the Alliance
and how many Members were mentioned, not who they were.

## Consequences

- Nothing is stored for a Member who never opts in.
- Being mentioned shows others in the channel that a Member's Booty Alerts matched at that moment. That follows from the Member's own opt-in.
- A Member who leaves the server is Unlinked, so their row goes with the Link.
- Officers can't see from the log who was mentioned, though the card's mentions remain in the channel.
