# 26. NaP Rules and their versions

Date: 2026-11-18

## Status

Accepted. Builds on [ADR 25](0025-nap-motions-and-decision-log.md); amends [ADR 22](0022-public-nap-list-and-announcements.md)
for the NaP Rules only.

## Context

Slice 044 ("Agree on the NaP Rules", issue #157, split from #121) lets the NaP Council publish its rules as one current
text with a history of every version, so that a record of what the NaP agreed takes the heat out of disputes. A change
to the rules is decided by a NaP Motion (ADR 25), never by a separate vote, and every version that takes effect is
announced in `#nap-announcements`, which the Interaction Bot translates like the other NaP announcements.

## Decision

We will store, in `neil.db` (migration 27), in `nap_rules_versions`, one row per **NaP Rules Version**: its number
(1, 2, 3…, one per proposal, so a rejected version keeps its number), its full text (at most 4000 characters) and the
note on what changed (at most 500), the **Discord user id of the NaP Council member who proposed it**, when it was
proposed, its state (`proposed`, `approved` or `rejected`), when it was decided, and the id of the NaP Motion it was put
to. "In effect" (the approved version decided last) and "replaced" (any other approved version) are worked out from the
rows, never stored. Rows are kept as long as the NaP history and are **not deleted at Unlink**, for the same reason as
ADR 20, 23 and 25: they are the record of what the NaP agreed. The one exception is a proposal whose NaP Motion could not
be opened: it is removed at once, so no version is left open without a motion.

Only one version can be proposed at a time. Who may propose is who may open a NaP Motion (ADR 25); the outcome of that
motion decides the version, once, on the one-minute tick after the NaP Motions are closed.

The public views (`/nap rules`, `/nap rules-history`) and the announcement in `#nap-announcements` **name no Member**:
the proposer is not shown, and Member mentions in the text or the change note are replaced. The announcement is plain
message content (split at line breaks when over 2000 characters) with mentions off. The proposer appears only in
`#neil-log` (one line per proposal, with mentions off) and in `neil.db`; the NaP Motion itself names its opener in
`#nap-leaders` as ADR 25 says. A rejected version is not announced; it stays in the history marked rejected.

## Consequences

- Everyone can read the rules in effect and every earlier, proposed and rejected version, with what changed and when.
- A failure in `#nap-announcements` never undoes a decided version; it writes one `#neil-log` line.
- Officers can reconstruct who proposed each version from `neil.db` and `#neil-log`, also after Unlinks.
- A Member who wants their id removed from a version needs an operator to edit `neil.db` by hand.
- Changing what is stored, how long it is kept, or who sees it needs a new ADR.
