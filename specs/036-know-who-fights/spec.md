# Feature Specification: Know who fights

**Feature Branch**: `036-know-who-fights`

**Created**: 2026-11-16

**Status**: Approved

**Input**: Issue [#137](https://github.com/LilSticky/Neil/issues/137), split from #117; the second slice of
[discovery/kvk-battle-plan.md](../../documentation/discovery/kvk-battle-plan.md) (answers 3, 5, 10, 11 and 12). On Kingdom
330 the War Council does not know how many fighters each Alliance brings to Saturday's Raid. Slice 035 is taken by #131.

## Decisions (approved with the spec)

1. Troop Bracket and Might for the suggestion come from one uncharged, cached Player lookup of the Member's Linked Player
   when they press Available; the bracket from its sanctuary level. Neither is stored.
2. The private reply offers four buttons; the suggested one is highlighted and marked "(suggested)", so one press confirms it.
3. The poll opens 72 hours before the Raid start, fixed in code (Wednesday at the start time).
4. Answers are kept until the poll closes at the start or the cancel; then only the counts on the cards remain. An Unlink
   forgets them too (ADR 18).
5. The Alliance leaders see the totals in the Availability Summary in `#kvk-leaders`, and each Alliance its own counts on
   its poll card. No new channel or command.
6. The Alliances with a `[TAG]` role when the poll opens get a card; an Alliance added later that week gets none.
7. The thresholds are the settings `FIGHTER_WHALE_BRACKET`, `FIGHTER_WHALE_MIGHT`, `FIGHTER_DOLPHIN_BRACKET`,
   `FIGHTER_DOLPHIN_MIGHT`, `FIGHTER_SEAL_BRACKET` and `FIGHTER_SEAL_MIGHT` (defaults T10/150,000,000, T9/60,000,000,
   T7/20,000,000; Whale above Dolphin above Seal).

## User Scenarios

### User Story 1: Members say whether and as what they fight (P1)

72 hours before the Raid start Neil posts an Availability Poll in every Home Kingdom Alliance's `alliance-chat`, mentioning
nobody. A Linked Member of that Alliance presses **Available** and gets a private reply naming their Troop Bracket, Might and
Neil's suggested Fighter Class, with Whale, Dolphin, Seal and Small Fry to choose from; or presses **Not available**. They can
change their answer until the Raid starts, also from another Alliance's card. Anyone else is refused privately.

### User Story 2: The War Council and the leaders see the counts (P1)

Each poll card shows its Alliance's Whales, Dolphins and Seals and their sum, Small Fry apart and Not available. The
Availability Summary in `#kvk-leaders` shows the same per Alliance and a Kingdom total. Both are updated after every answer.

### User Story 3: The poll closes (P2)

At the Raid start, or within a minute of a cancel, the cards and the summary lose their buttons and show the final numbers;
then the answers are deleted. A Raid cancelled before the opening gets no poll. `#neil-log` gets one line when the poll opens,
closes, or a card cannot be posted or edited, never who answered what.

## Requirements

R1–R13 as approved in the factory's spec step for issue #137: the threshold settings (R1), the suggestion (R2), the opening
and its cards (R3), who may answer (R4), the private reply and class buttons (R5), changing until the start and the close
(R6), the cancel (R7), the counts (R8), persistence (R9, migration 18), keeping answers only as long as needed (R10, ADR 18),
the log (R11), the dictionary (R12) and the docs (R13).

## Out of scope

Chasing Members who have not answered, showing who answered what, a slash command, translated copies.
