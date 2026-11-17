# 23. REAPER is kept by the NaP Council

Date: 2026-11-17

## Status

Accepted. Supersedes [ADR 9](0009-personal-data-of-reaper.md) only for who adds and removes Exiles.

## Context

REAPER, the list of Exiles (slice 014), was kept by the Home Kingdom R5s: any Member Linked to the R5 of an Alliance in
the Home Kingdom could add and remove Exiles, as [ADR 9](0009-personal-data-of-reaper.md) records. REAPER is a
feature of the NaP, and since the NaP register ([ADR 20](0020-personal-data-of-the-nap-register.md)) Neil knows which
Alliances are in the NaP and who sits on the NaP Council. An R5 of a Home Kingdom Alliance outside the NaP should not
decide who is an Exile. Issue #145 moves REAPER under the NaP; the owner decided who may keep it.

## Decision

Only the NaP Council (the Members Linked to the R5 of an Alliance in the NaP) may add and remove Exiles. While the NaP
has no member Alliances, an Officer adds and removes them instead. The rule is read from the NaP register at the moment
of each `/reaper add`, `/reaper remove` and pick of the `/reaper add` pick list, the same way Officers approve NaP
join requests; once an Alliance is in the NaP, an Officer who is not on the NaP Council is refused. Anyone else is
refused before any Game API request, store change or log line.

Everything else ADR 9 says stays: the stored columns of the `reaper` table, that an Exile is kept until it is removed
with no automatic expiry, and that the adder's Discord id is used only for the log-channel line and never shown to
Members. Who may find and list Exiles does not change.

## Consequences

- The R5 of a Home Kingdom Alliance outside the NaP can no longer add or remove Exiles.
- The stored adder of an Exile may now be an Officer who is not an R5; the stored data itself does not change.
- When the last Alliance leaves the NaP, Officers keep REAPER until an Alliance joins again.
- The rule lives with the NaP rules in the domain (`mayKeepReaper`), next to the approval of join requests.
