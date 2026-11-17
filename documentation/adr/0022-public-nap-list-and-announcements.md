# 22. Public NaP list and announcements

Date: 2026-11-17

## Status

Accepted. Amends [ADR 20](0020-personal-data-of-the-nap-register.md) on what any Member sees; the rest of ADR 20 is
unchanged.

## Context

Slice 041 ("See the NaP", issue #144) shows the NaP register (slice 038) in more places: on the `/alliance` card, in a
list pinned in `#nap-announcements`, and in an announcement there for every join and leave. ADR 20 said that any
Member sees only which Alliances are in the NaP since when, and the join requests waiting (`/nap show`), and that who
asked, approved or left is shown only to the NaP Council and Officers. The new views show more to everyone (which
Alliances left, and when), and the list needs its message id stored so Neil can keep it current.

## Decision

- The public views (the NaP list pinned in `#nap-announcements`, the join and leave announcements there, the NaP line
  of the `/alliance` card, and `/nap show`) show only the Alliance (tag and, when known, name), whether it joined or
  left, and when. They never show a Member's mention, id or name, and they mention nobody.
- Any Member now also sees which Alliances left the NaP and when. `/nap show` still answers privately and also lists the
  join requests waiting, by tag.
- Who asked, approved or left stays visible only to the NaP Council and Officers: `/nap history`, the messages in
  `#nap-leaders` and the lines in `#neil-log`, as ADR 20 decided.
- The NaP line appears only on cards of Home Kingdom Alliances: the register knows Alliances by tag only, so another
  Kingdom's Alliance with the same tag never matches.
- Neil stores the message id of the pinned list in `neil.db` (migration 24, `nap_list`, one row). No Member data is
  added.

## Consequences

- Everyone in the Kingdom sees the NaP and its changes without asking an R5, and the Interaction Bot's translated
  copies of `#nap-announcements` carry them too.
- A failure in `#nap-announcements` (no channel, a refused post, edit or pin) never undoes or blocks a join or leave;
  Neil writes one line in `#neil-log`.
- Showing who acted in a public view needs a new ADR.
