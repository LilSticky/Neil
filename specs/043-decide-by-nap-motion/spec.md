# Feature Specification: Decide by NaP Motion

**Feature Branch**: `043-decide-by-nap-motion`

**Created**: 2026-11-18

**Status**: Approved

**Input**: Issue [#158](https://github.com/LilSticky/Neil/issues/158), split from
[#121](https://github.com/LilSticky/Neil/issues/121); built on slice 042 (NaP Vote, ADR 23) and slice 041 (public NaP
announcements, ADR 22).

The approved choices:

1. `/nap motion` takes a `text` (required, at most 500 characters) and optional `hours` (1 to 168, 48 when left out).
2. Only NaP Council members may open a motion; Officers outside the council may not, so nobody may while the NaP is
   empty.
3. One reminder, in `#nap-leaders`: 24 hours before the deadline, or halfway through a motion shorter than 48 hours,
   mentioning the Linked R5s of the Alliances that have not voted; never how anyone voted.
4. The decision log is posts in `#nap-announcements`, which the Interaction Bot already translates.
5. The public log shows the opener only as their Alliance (ADR 22); the Member is named only in `#nap-leaders` and
   `#neil-log`.
6. New term NaP Motion; results "approved" and "rejected".

Out of scope: withdrawing, editing or closing a motion early, Officers opening motions, a command listing past motions,
any change to the join-request NaP Vote.

## User Scenarios

### User Story 1: A council member opens a motion (P1)

A NaP Council member runs `/nap motion`. Neil posts the motion in `#nap-leaders` with its text, the opener's Alliance,
the deadline and Approve and Decline buttons, and tells the opener privately until when the council votes. Anyone else
is refused privately and nothing is opened.

### User Story 2: The council votes (P1)

A Linked R5 of an Alliance in the NaP presses Approve or Decline; their Alliance's vote is stored (the latest press
counts) and they are told privately what was recorded. Votes stay hidden while the motion runs.

### User Story 3: Neil reminds the R5s who have not voted (P2)

Once, before the deadline, Neil mentions the Linked R5s of the Alliances that have not voted in `#nap-leaders`.

### User Story 4: Neil closes the motion and logs the decision (P1)

At the deadline Neil counts the votes of the Alliances still in the NaP: more Approve than Decline approve; a tie or no
votes reject. The motion in `#nap-leaders` shows the result without buttons, and the decision log in
`#nap-announcements` gets the text, the opening Alliance, the times, the result with its counts and each Alliance's
vote, naming no Member.

## Requirements

- **R1** `/nap motion` with `text` and `hours`; only NaP Council members may open; blank texts and bad hours refused.
- **R2** The motion in `#nap-leaders` with `nap-motion-approve:<id>` and `nap-motion-decline:<id>`, mentions off, no
  count; a missing channel or failed post removes it, tells the opener and writes one log line.
- **R3** One vote per Alliance, changeable until the deadline; refusals for anyone else, unknown or closed motions and
  presses at or after the deadline, storing nothing.
- **R4** One reminder at `endsAt - min(24h, duration / 2)`, recorded before it is sent, late after a restart but never at
  or after the deadline.
- **R5** Closing on the first tick at or after the deadline, once; only Alliances still in the NaP count.
- **R6** The decision-log entry in `#nap-announcements` as plain content, split between lines above 2,000 characters.
- **R7** Translated copies by the Interaction Bot, as for the other NaP announcements; no server-layout change.
- **R8** Migration 26 (`nap_motions`, `nap_motion_votes`) and `NapMotionStore`, kept after closing and at Unlink.
- **R9** `/nap motion`, the motion buttons and the tick wired in `client.ts`.
- **R10** ADR 25, dictionary, roadmap, status and the manual check.

## Success Criteria

The automated criteria are covered by `src/domain/nap-motion.test.ts`, `src/storage/nap-motion-store.test.ts`,
`src/storage/database.test.ts`, `src/discord/nap-motions.test.ts`, `src/discord/client.test.ts`,
`src/discord/commands.test.ts` and `src/startup.test.ts`; the owner reads ADR 25, the dictionary entry and the texts in
Discord.
