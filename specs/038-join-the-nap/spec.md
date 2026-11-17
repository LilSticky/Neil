# Feature Specification: Join the NaP

**Feature Branch**: `038-join-the-nap`

**Created**: 2026-11-16

**Status**: Approved

**Input**: Issue [#143](https://github.com/LilSticky/Neil/issues/143), split from #119. The decisions of the approved
spec (2026-11-16):

1. The very first members: while the NaP has no members, an Officer approves a join request; each founding R5 still asks
   with `/nap join`, so every member was asked for by its own R5. Once one Alliance is in, only the NaP Council approves.
   When every Alliance has left, the Officer fallback applies again.
2. A join request cannot be declined or withdrawn; it stays open until approved. A second request for the same Alliance
   is refused while one is open.
3. Any Member sees the members and the open requests; only the NaP Council and Officers see who asked, approved or left.
4. Unlink does not delete a Member's entries in the history: it is the NaP's record of decisions made as Alliance
   leaders (ADR 20).
5. One command, `/nap`, with `show`, `join`, `leave` and `history`.

Out of scope: declining or withdrawing a join request, votes of the council (#121), and any link between the NaP and the
City Rotation, whose editors stay as they are.

## User Scenarios

### User Story 1: Any Member sees who is in the NaP (P1)

`/nap show` answers privately with the Alliances in the NaP, each as `[TAG] name` with the date it joined as a Discord
timestamp, then the Alliances whose join request waits, by tag. No Member is named; no Game API request.

**Acceptance**:

1. With no members: "No Alliance is in the NaP yet."
2. With members and open requests: both lists, and no mention.

### User Story 2: An R5 asks for their Alliance to join (P1)

A Member Linked to the R5 of a Home Kingdom Alliance (rank from the Game API or a Rank Approval) runs `/nap join`. Neil
stores the request, posts it in `#nap-leaders` naming the Alliance and the asking Member (mentions off) with one
**Approve** button, and tells the R5 privately.

**Acceptance**:

1. Refused privately: not a Linked R5 of a Home Kingdom Alliance; the Alliance is already in the NaP; a request for it
   is open.
2. Without `#nap-leaders` or when the post fails, the request is dropped, the R5 is told, and one `#neil-log` line says
   why.

**Edge case** ([#148](https://github.com/LilSticky/Neil/issues/148)): when the request's message in `#nap-leaders` was
deleted, nobody could approve it. A new `/nap join` by the R5 now edits the open request's message with the current
text and button and is refused as before; if the message is gone (or not in the current `#nap-leaders`), Neil posts the
same request again (same asker, time and Approve button), tells the R5 privately and writes one `#neil-log` line. If
Neil cannot check or repost it, the request stays open, the R5 is told, and one `#neil-log` line says why. Two such
commands at once repost once.

### User Story 3: The NaP Council approves (P1)

A member of the NaP Council (a Member Linked to the R5 of an Alliance in the NaP) presses **Approve**. The Alliance is
in the NaP; the history records who asked and when, who approved and when, and whether as council or as Officer. The
message shows the result without its button.

**Acceptance**:

1. Anyone else is refused privately and nothing changes: the asker, R5s of Alliances outside the NaP, R4s, and Officers
   once the NaP has members.
2. While the NaP has no members, an Officer's press approves (recorded as Officer).
3. A stale button (an earlier request of the same Alliance) or a request that is gone changes nothing; two presses
   approve once.

### User Story 4: An R5 takes their Alliance out (P1)

The Linked R5 of an Alliance in the NaP runs `/nap leave`. The Alliance is out at once, without anyone's approval; the
history records who and when; the council is told in `#nap-leaders`. The Alliance may ask to join again later.

**Acceptance**: anyone else is refused privately; a missing `#nap-leaders` or failed post only writes a `#neil-log` line.

### User Story 5: The council and Officers see the history (P2)

`/nap history` answers privately with at most 20 entries, newest first: when, `[TAG]`, joined or left, and the Members
as mentions (mentions off), "(Officer)" after an Officer's approval. Anyone else is refused privately.

### Edge cases

- Every request, approval and leave writes one `#neil-log` line with mentions off; a failed log line goes to the error
  log and never throws.
- Tags are compared ignoring letter case.
- Checks and the writes after them run without an await in between, so two requests or two presses never both pass.

## Requirements

- Domain `src/domain/nap.ts`: `NapEvent`, `napMembers`, `linkedR5AllianceOf`, `mayAskToJoin`, `mayApprove`, `mayLeave`.
- Storage: migration 21 (`nap_history`, `nap_join_requests`), `NapStore`; ADR 20 for the personal data.
- Discord: `/nap` in `src/discord/commands.ts`, `createNap` in `src/discord/nap.ts`, texts in `src/discord/nap-texts.ts`,
  the Approve button `nap-approve:<tag>:<requestedAt ms>`; `#nap-leaders` through the City Rotation's server adapter.
- Dictionary: NaP and NaP Council.

## Success criteria

- Domain, store and adapter tests cover every acceptance item; typecheck, lint, tests and build pass.
- On test Neil: an Officer approves the first request, a second Alliance's R5 asks and a council member approves, one R5
  leaves, and `/nap show` and `/nap history` show it.
