# Feature Specification: See the NaP

**Feature Branch**: `041-see-the-nap`

**Created**: 2026-11-17

**Status**: Approved

**Input**: Issue [#144](https://github.com/LilSticky/Neil/issues/144), split from #119. Builds on the NaP register of
slice 038. The decisions of the approved spec (2026-11-17):

1. The public NaP list is a message Neil pins in `#nap-announcements` and keeps current, like the City Rotation card.
2. It lists the members with their join date, then the former members with their leave date (newest 20). Waiting join
   requests stay only in `/nap show`.
3. Only Home Kingdom Alliances get a NaP line on their `/alliance` card: "Member since <date>", "Not a member" or
   "Not a member (left <date>)". The register knows Alliances only by tag, so another Kingdom's tag never matches.
4. The announcements name only the Alliance and the time, never the R5 or the approver.
5. ADR 22 records the public views and the stored list message id.

Out of scope: the Alliance Overview, the `/player` card, waiting requests on the public list, translations of the
announcements, and any change to joining, approving or leaving.

## User Scenarios

### User Story 1: Any Member sees the NaP status on an Alliance card (P1)

The `/alliance` card of a Home Kingdom Alliance has an inline NaP field before the roster, also after a pick, a roster
page turn and Look again. Cards of other Kingdoms' Alliances have none. When the status cannot be read, the card is
shown without it and the failure is logged. No Game API request is added.

### User Story 2: Everyone sees the NaP list in `#nap-announcements` (P1)

Neil posts and pins the list on its first refresh, edits it after every join and leave and once at startup, and posts
and pins it again when it is gone. Two quick changes post one list. It names no Member and mentions nobody.

### User Story 3: Joins and leaves are announced (P1)

After an approval or a leave, Neil posts one line in `#nap-announcements`: the Alliance and the time. The `#nap-leaders`
messages stay as they are.

**Acceptance**: without `#nap-announcements`, or when a post, edit or pin fails, the join or leave still counts, the R5
gets the usual answer, and Neil writes one `#neil-log` line about it.

### User Story 4: `/nap show` shows the same list (P2)

`/nap show` stays private and shows the list, then the join requests waiting.

## Requirements

- No public view shows a Member's mention, id or name (ADR 22).
- Migration 24 keeps the list's message id; migrations 1 to 23 are unchanged.
- No new dependency; `src/domain/` stays pure.
