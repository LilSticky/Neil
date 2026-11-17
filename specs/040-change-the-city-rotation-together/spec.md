# Feature Specification: Change the City Rotation together

**Feature Branch**: `040-change-the-city-rotation-together`

**Created**: 2026-11-17

**Status**: Approved

**Input**: Issue [#134](https://github.com/LilSticky/Neil/issues/134), split from #120, built on slice 035 (See whose
turn it is, [#131](https://github.com/LilSticky/Neil/issues/131)) and slice 038 (Join the NaP,
[#143](https://github.com/LilSticky/Neil/issues/143), the NaP member register of #119). Discovery:
[royal-city-rotation.md](../../documentation/discovery/royal-city-rotation.md), slice 4.

The owner's choices:

1. Move one Alliance to a numbered place (`/rotation move alliance position`), not a retyped order.
2. Skip always applies to the next (or expected, unconfirmed) Alliance's Turn; it keeps its place for the next round.
3. A Holding Alliance that leaves keeps the Royal City until the next Handover; the Alliance after it is next.
4. Skip and leave need no Confirm button: the NaP Council has decided, and the log and announcement make it traceable.
5. The last Alliance cannot be taken out. Move, skip and leave work while paused.
6. Leave changes only the City Rotation, not the NaP register.
7. One pull request for all four changes.

## User Scenarios

### User Story 1: An R5 reorders the City Rotation (P1)

A Member Linked to the R5 of an Alliance in the City Rotation moves an Alliance to another place. The Holding Alliance
stays the same; the next Alliance follows the new order.

### User Story 2: An R5 records a skip or a leave (P1)

The NaP Council decides that an Alliance skips its Turn, or an Alliance left the NaP. An R5 in the rotation records it.
A skipped Alliance keeps its place and the Alliance after it is next; an Alliance that left is taken out and the one
after it moves up. In an open Turn, Neil asks the new expected Alliance's R5 (read fresh) to confirm.

### User Story 3: An R5 pauses and resumes the City Rotation (P2)

While paused, Neil names no new Holding Alliance after a siege and asks nobody; the card says so.

### Edge cases

- Neil never skips, removes or advances anything by itself: an open Turn stays open past ticks and sieges until a
  confirmation, a skip or a leave.
- Refused privately, with nothing written: a caller not Linked to an R5 of an Alliance in the rotation (from the Game
  API or a Rank Approval), Contested mode, no rotation set, an Alliance outside the rotation, a place out of range, a
  move to the same place, a skip with one Alliance, removing the last Alliance, a double pause or resume.

## Requirements

- **FR-001** (R1): only a Member Linked to the R5 of an Alliance in the City Rotation may move, skip, leave, pause or
  resume. A refusal is private and writes no `#neil-log` line. No Game API request.
- **FR-002** (R2): `/rotation move alliance position` moves an Alliance; holder and open Turn untouched.
- **FR-003** (R3): `/rotation skip` skips the next or expected Alliance's Turn.
- **FR-004** (R4): `/rotation leave alliance` takes an Alliance out of the order; a leaving Holding Alliance keeps holding.
- **FR-005** (R5): no timer advances, skips or removes anything.
- **FR-006** (R6): `/rotation pause` and `/rotation resume`; while paused the after-siege step names nobody and asks
  nobody.
- **FR-007** (R7): every accepted change writes one `#neil-log` line naming the Member, the Alliances and the order
  before and after; one post in `#home-kingdom-announcements`; the pinned card is refreshed. Mentions off everywhere. A
  failed post is logged once and does not undo the change.
- **FR-008** (R8): `/help` lists the new subcommands; autocomplete for `alliance`.

## Out of scope

A council vote (#121), changing the NaP register, adding Alliances (that is `/rotation set`), the Handover Reminders and
the King role.

## Success criteria

- `npm run typecheck`, `lint`, `test` and `build` pass.
- On test Neil, an R5 moves, skips, removes, pauses and resumes; the announcements and the pinned card read clearly, and
  `#neil-log` shows who did what (TEST-RUN.md §6aa).
