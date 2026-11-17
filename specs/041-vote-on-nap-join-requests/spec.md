# Feature Specification: Vote on NaP join requests

**Feature Branch**: `041-vote-on-nap-join-requests`

**Created**: 2026-11-17

**Status**: Approved

**Input**: Issue [#150](https://github.com/LilSticky/Neil/issues/150), built on slice 038 (Join the NaP,
[#143](https://github.com/LilSticky/Neil/issues/143)) and the fix of [#148](https://github.com/LilSticky/Neil/issues/148)
(a lost request message is posted again). Refs [#121](https://github.com/LilSticky/Neil/issues/121).

The approved choices:

1. A NaP Vote runs 48 hours from when it opens.
2. While the NaP has no members, an Officer decides alone with Approve or Decline, at once; a decline also starts the
   30-day wait. Such a request gets its 48-hour vote once the NaP has a member.
3. A vote can be changed before the deadline by pressing the other button; every change is logged.
4. A tie, and a request with no votes at all, are declined, with the 30-day wait.
5. One vote per Alliance in the NaP, cast by any of its Linked R5s; only Alliances still in the NaP at the deadline
   count.
6. The vote always closes at the deadline, never early.
7. The request message shows no running count; `/nap history` shows only the counts; who voted what is in `#neil-log`
   and `neil.db` (ADR 22).
8. New terms: NaP Vote and NaP Cooldown.

Out of scope: withdrawing a request, telling the R5 privately about the result, closing a vote early, any change to the
City Rotation.

## User Scenarios

### User Story 1: The NaP Council votes on a join request (P1)

An R5 asks with `/nap join`. The request in `#nap-leaders` has Approve and Decline and says until when the NaP Council
votes (a Discord timestamp). A council member presses a button; their Alliance's vote is stored and they are told
privately what was recorded and until when they can change it. Anyone else is refused privately.

### User Story 2: Neil counts the vote at the deadline (P1)

On the one-minute tick after the deadline Neil counts the votes of the Alliances in the NaP: more Approve than Decline
approve; a tie or no votes decline. The message shows the result and counts without buttons, and one `#neil-log` line
records it.

### User Story 3: A declined Alliance waits 30 days (P1)

`/nap join` for an Alliance declined less than 30 days ago is refused privately with the decline date and when it may
ask again.

### User Story 4: An Officer decides while the NaP is empty (P2)

While the NaP has no members, an Officer's Approve lets the Alliance in and Decline declines it with the 30-day wait,
both at once.

## Requirements

- **R1** Each join request has Approve (`nap-approve:<tag>:<ms>`, unchanged) and Decline (`nap-decline:<tag>:<ms>`); its
  text says the NaP Council votes, until when, and what a decline means. Mentions off.
- **R2** The vote ends 48 hours after it opens: at the request, or, for a request made while the NaP was empty, on the
  first tick, press or `/nap join` once the NaP has a member (the message is edited to say so).
- **R3** One vote per Alliance, latest press of any Linked R5 counts; refusals for anyone not on the council, stale
  buttons, closed requests and presses after the deadline, with nothing stored.
- **R4** While the NaP is empty, an Officer approves or declines alone.
- **R5** The tick counts and closes votes at the deadline (not while the NaP is empty) and edits the message.
- **R6** The NaP Cooldown of 30 days follows from the latest decline; `/nap join` names its end.
- **R7** Every vote, change, result and Officer decline writes one `#neil-log` line.
- **R8** The history keeps declines and how each request was decided; `/nap history` shows counts, `/nap show` vote ends.
- **R9** Migration 24 keeps votes, vote ends and declines; existing data keeps its meaning.
- **R10** The Decline button is routed to the NaP handler.
- **R11** The `/nap history` description mentions declines.
- **R12** ADR 22, dictionary, roadmap, status and the manual check.

## Success Criteria

The automated criteria of the approved spec are covered by `src/domain/nap.test.ts`, `src/storage/nap-store.test.ts`,
`src/storage/database.test.ts`, `src/discord/nap.test.ts`, `src/discord/client.test.ts` and
`src/discord/commands.test.ts`; the owner reads ADR 22, the dictionary entries and the request texts in Discord.
