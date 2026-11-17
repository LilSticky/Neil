# Feature Specification: Hand the King role over

**Feature Branch**: `039-hand-the-king-role-over`

**Created**: 2026-11-17

**Status**: Approved

**Input**: Issue [#133](https://github.com/LilSticky/Neil/issues/133), split from #120, built on slice 035 (See whose turn
it is, [#131](https://github.com/LilSticky/Neil/issues/131)). Discovery:
[royal-city-rotation.md](../../documentation/discovery/royal-city-rotation.md). Decision:
[ADR 21](../../documentation/adr/0021-neil-moves-the-king-role.md), the first commit of this slice.

**The authority the owner approved with this spec**: Neil may give and take the King role, and only when an Officer
presses Apply on a King Move. Neil never gives or takes the Moderator role or any other role with permissions, never
changes a role's permissions at runtime, and never moves King on its own. For this, Neil's role sits above King and
below Moderator, so a leaked bot token could hand out King; ADR 21 records the risk.

The owner's choices:

1. The prepared King Move appears in `#neil-log`, the Officers-only log channel.
2. King is taken only from the Members shown on the card when the move was prepared.
3. The R5 is the Alliance's `leader_id` from a fresh Alliance read.
4. When Neil cannot prepare the move: one log line, no retry; an Officer moves King by hand.
5. The prepared move is called **King Move** (dictionary).
6. Only the latest King Move is kept, replaced by the next; the log is the record.

## User Scenarios

### User Story 1: Officers get the King Move prepared (P1)

When a Handover settles the new Holding Alliance (its confirmation by the R5 or an Officer; in Contested mode an Officer
naming the holder), Neil reads the Alliance live from the Game API (one request, purpose `sync`), takes its R5
(`leader_id`) and that Player's Linked Member, and posts a King Move card in `#neil-log`: the Alliance `[TAG]`, the R5's
Player Name and uid, the new King, the Members holding King now (the snapshot) and an Apply button. Nobody is pinged.

**Acceptance**:

1. After a Handover: one live read, one card, one "prepared" log line; no role changes.
2. No readable R5, an R5 with no Linked Member or not on the server, a failed Game API read or a spent quota: one log line
   saying an Officer moves King by hand; no card.
3. The new King already is the only King: one "nothing to move" line; no card.

### User Story 2: An Officer applies the King Move (P1)

An Officer (Moderator or King) presses Apply. Neil gives King to the new King when missing, then takes it from the
snapshot Members who still hold it. Nothing else on any Member changes. The card shows who applied it and when, without
the button; the presser gets a private answer; one "applied" line names the presser, who lost and who got King.

**Acceptance**:

1. A Member who got King after the move was prepared keeps it.
2. A press by a non-Officer, or on an applied or superseded move, changes nothing and gets a private answer.
3. Discord refuses a step (for example 50013 with Neil below King): the presser and the log learn which steps were done
   and which failed, and that Neil's role must sit above King and below Moderator; the move stays applicable.
4. The move survives a restart of Neil: the Apply button still works.

### Edge cases

- A newer Handover supersedes a waiting King Move: its card loses the button, one "superseded" line.
- The regular role sync never gives or takes King or Moderator.
- The card cannot be posted: one log line; an Officer moves King by hand.

## Requirements

- **R1** ADR 21 as the first commit; ADR 8 partly superseded.
- **R2** The expected King: the receiving Alliance's R5, read fresh, and their Linked Member.
- **R3** The card in `#neil-log` with an Apply button (`king:` prefix).
- **R4** An Officer's Apply moves King only between the shown Members.
- **R5** Non-Officer, applied and superseded presses change nothing.
- **R6** One log line when Neil cannot prepare the move.
- **R7** Discord refusals are reported with the fix.
- **R8** Every King Move is logged.
- **R9** The latest King Move is kept in `king_moves` (migration 22).
- **R10** The role sync never moves King or Moderator.
- **R11** The setup hint and guides name the new role order.
- **R12** Dictionary, roadmap, status and a manual check.

## Out of scope

Building a City Rotation (slice 035), reminders (slice 037), a retry button, a history of King Moves.
