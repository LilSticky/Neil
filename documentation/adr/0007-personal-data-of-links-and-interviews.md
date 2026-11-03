# 7. Personal data of Links and Onboarding Interviews

Date: 2026-10-31

## Status

Accepted

## Context

Slice 005 stores, for the first time, data about Members: who is Linked to which Player, how their
Onboarding Interview went, and who gave a Rank Approval. The constitution (principle V) asks that personal
data is kept to what a feature needs and that what is stored, and for how long, is recorded in an ADR.
ADR 5 decided SQLite for Links and Interviews. Interview threads themselves live in Discord and are kept by
Discord, not by Neil.

## Decision

We will store only:

- **Link**: the Member's Discord user id, the Player's uid, when it was made, and the Alliance Rank with its
  source (Game API, Rank Approval, unknown, no Alliance), plus the approver's Discord user id and time for a
  Rank Approval. A Link is kept until a later slice removes it ("Say goodbye", "Correct a link"); leaving the
  server does not remove it.
- **Onboarding Interview**: the Member's Discord user id, the thread id, its step, the number of failed
  attempts, the uid being checked and the Player shown (public game data), and its times. Ended Interviews are
  deleted 90 days after they end.
- **Rank Approval**: the Linked Member's and the approver's Discord user ids, the thread id, the rank and its
  times. Ended Rank Approvals are deleted 90 days after they end.

We store no usernames, nicknames, message content or other Discord profile data; Neil reads those from
Discord when it needs them. Log channel messages are Discord's to keep.

## Consequences

- Officers can reconstruct a Link from the log channel even after the Interview row is gone.
- A Member who left keeps their Link (and so their Player) until "Say goodbye" exists; a rejoin needs no new
  Interview.
- The sweeper also deletes old rows; a bug there keeps data longer, not shorter.
- Changing what is stored or how long needs a new ADR.
