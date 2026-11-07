# 14. Reading scheduled events, and what Event Reminders store

Date: 2026-11-07

## Status

Accepted

## Context

Slice 028 lets Neil invite Members to Discord scheduled events and remind those who click Interested. Neil needs to see the events
as they are created, changed and deleted, and to read who is Interested. The constitution (principle V) asks for the least
privilege that does the job, and that stored personal data, and for how long, is documented in an ADR.

## Decision

We will add the `GuildScheduledEvents` gateway intent. It is not privileged. Neil does not get Manage Events: it only reads events
and their subscribers (`fetchSubscribers`, at reminder time).

We will store in `neil.db`:

- per Event Neil has placed: its Discord id, when Neil first saw it and when the invitation was posted (`events`), and which
  reminders were sent, by target and lead time (`event_reminders_sent`). The rows go when the Discord event is deleted.
- the Event Kinds of the kingdom and of each Alliance (`event_kinds`): names and times, no personal data.
- per Member who switches invitations off: their Member id (`event_invitations_off`), until they switch back on or are Unlinked.

We will not store the event's name, description or start, nor who is Interested: they are read from Discord when needed.

## Consequences

- Neil sees only events in channels it can view, or with an external location; SERVER-SETUP.md says so.
- Being mentioned in a reminder shows others in the channel that a Member clicked Interested, which Discord already shows on the event.
- The log line for an invitation or reminder holds the Event and how many Members were mentioned, not who they were. A refused Event's
  log line gives its creator's Discord id, so Officers can see who created an Event Neil would not announce.
- A Member who leaves the server is Unlinked, so their Event Invitations Off row goes with the Link.
