# Feature Specification: See whose turn it is

**Feature Branch**: `034-see-whose-turn-it-is`

**Created**: 2026-11-16

**Status**: Approved

**Input**: Issue [#131](https://github.com/LilSticky/Neil/issues/131), split from #120. Discovery:
[royal-city-rotation.md](../../documentation/discovery/royal-city-rotation.md) (answers 1, 2, 6, 7, 8 and the smallest
first cut). The owner's decisions:

1. Members Linked to the R5 of an Alliance in the City Rotation keep its order, a fixed list by Alliance tag (Known
   Alliances). Every change is logged.
2. After the Royal City siege Neil takes the next Alliance in the order, reads its R5 fresh from the Game API
   (`leader_id`) and asks that R5 to confirm. An Officer may confirm too.
3. A server setting chooses Rotation or Contested; in Contested there is no order and an Officer names the Holding
   Alliance.
4. The card is pinned in `nap-announcements`; the Handover question goes to `nap-leaders`.

Out of scope: moving the King role, Handover Reminders, news in `home-kingdom-announcements`, skip, pause or vote.

## User Scenarios

### User Story 1: A Member sees whose turn it is (P1)

Any Member runs `/rotation show`, or reads the pinned card in `#nap-announcements`: the Holding Alliance as `[TAG] name`,
the next Holding Alliance (Rotation only), the order, a waiting Handover, and the next Royal City siege as
`<t:…:F>` and `<t:…:R>`. Without a rotation: "No City Rotation is set yet". Without `ROYAL_CITY_SIEGE_TIME`: the siege time
is not set. No Game API request.

### User Story 2: An R5 sets the City Rotation (P1)

A Member Linked to the R5 of a Home Kingdom Alliance in the order (or, while none is set, in the new order) runs
`/rotation set order:"NML, ABC, XYZ" holding:ABC`. 2 to 10 Known Alliances, no duplicates, the holder among them (default
the first). Others, unknown tags and Contested mode are refused privately. A set clears a waiting Handover and is logged
with the old and new order.

### User Story 3: An Officer names the Holding Alliance (P2)

An Officer runs `/rotation holder tag:XYZ` (in Rotation, a tag in the order). A waiting Handover ends; the card is
updated; the change is logged.

### User Story 4: The Handover after the siege (P1)

On the first tick after each Friday siege, once even after a restart or several missed sieges: in Rotation, Neil
names the next Alliance, reads it live (purpose `sync`, one request), and posts in `#nap-leaders` with a Confirm handover
button, mentioning only the R5's Member. A failed read or an unlinked R5 still posts and says an Officer confirms. The
R5's Member or an Officer confirms; the expected Alliance becomes the Holding Alliance. In Contested, one line asks the
Officers to name the holder, with no Game API request.

## Requirements

R1–R17 of the approved spec of issue #131: dictionary, settings, the siege clock, storage (migration 18), `/rotation`
show, set and holder, Contested, the pinned card, the after-siege step, confirmation, the log, `leader_id`, Pin Messages
in the setup, `/help` and registration, and the documentation with ADR 18.
