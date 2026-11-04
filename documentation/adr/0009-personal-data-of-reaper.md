# 9. Personal data of REAPER

Date: 2026-11-05

## Status

Accepted

## Context

Slice 014 adds REAPER, the list of Exiles: Players the server's community has exiled for being malicious. Home Kingdom
R5s add and remove Exiles; any Member finds the closest ones. [ADR 7](0007-personal-data-of-links-and-interviews.md)
records what Neil stores about Links and Onboarding Interviews and says that a change to what is stored, or for how
long, needs a new ADR. The constitution (principle V) asks that personal data is kept to what a feature needs.

An Exile is a Player, not necessarily a Member. Their name, Kingdom and position are public in the game and come from
the Game API; the reason is typed by an R5. The R5 who added an Exile is a Member.

## Decision

We will store, in the `reaper` table of `neil.db` (migration 11), per Exile:

- the Player's uid, latest name and Kingdom, as the Game API last gave them;
- the last known position (`x`, `y`) and when it was read, refreshed on every `/reaper closest` that reads the Player;
- the reason (1–200 characters) and the time the Exile was added;
- the Discord id of the R5 who added it.

An Exile is kept until a Home Kingdom R5 removes it; there is no automatic expiry. The adder's id is used only for the
log-channel line of the addition and is never shown to Members. Removing an Exile deletes the row; the log channel
keeps the add and remove lines as Discord keeps them.

ADR 7 stays as it is; this ADR adds REAPER to it.

## Consequences

- Exiles stay on REAPER until someone removes them, even when the Player stops playing; R5s keep the list tidy by hand.
- Positions are as fresh as the last lookup; a stored position is shown with its date.
- A Player can be on REAPER without being on the server and without knowing it; the reason is visible to every Member.
- Storing anything more (who removed an Exile, a history of reasons) needs a new ADR.
