# Feature Specification: Report a NaP breach

**Feature Branch**: `046-report-a-nap-breach`

**Created**: 2026-11-19

**Status**: Approved

**Input**: Issue [#122](https://github.com/LilSticky/Neil/issues/122), with the owner's answers; built on slice 043 (NaP
Motion, ADR 25), slice 038 (the NaP register, ADR 20) and slice 014 (REAPER, ADR 24).

The approved choices:

1. Only the R5 of an Alliance in the NaP files a report, and only against another Alliance in the NaP.
2. The NaP Council decides by NaP Motion (default 48 hours); Neil only records the decision and carries it out.
3. The evidence stays in a private thread under `#nap-leaders` for the NaP Council, the reporter and the accused
   Alliance's R5. Neil never deletes it, and keeps the report text and the thread id, not copies of the screenshots.
4. The public log is one post per approved outcome in `#nap-announcements`: the report number, the accused Alliance,
   the outcome and the date. The motion's decision log stays as ADR 25 has it.
5. No deadline to file or propose; one proposal per report waits at a time; a rejected one leaves the report open.
6. An expulsion is stored as a leave recorded with the proposer and announced as removed by NaP Motion; no NaP Cooldown.
7. The accused Alliance votes like any Alliance in the NaP.
8. Terms *NaP Report* and *Report Outcome* (proposed); commands `/nap report` and `/nap report-outcome`.

Out of scope: handling false reports, a public list command of past reports, a NaP Cooldown after an expulsion.

## User Scenarios

### User Story 1: An R5 reports a breach (P1)

A member of the NaP Council runs `/nap report alliance what [player]`. Neil stores the report with the next number, opens
a private thread `NaP report <n> · [TAG]` under `#nap-leaders`, adds the NaP Council (so the accused R5) and the reporter,
posts the report there asking for the evidence, and answers privately with the number and a link to the thread. Anyone
outside the NaP Council, their own Alliance, an Alliance outside the NaP, a blank or too-long text or an invalid uid is
refused privately, with nothing stored, posted or logged. Without `#nap-leaders`, or when the thread cannot be opened,
nothing is filed.

### User Story 2: The council decides an outcome (P1)

A member of the NaP Council runs `/nap report-outcome report outcome [note]`. Neil opens a NaP Motion whose text names
only the report number, the accused Alliance and the outcome, and posts the proposal with its note in the thread. An
unknown or decided report, a second waiting proposal, or Exile without an accused Player is refused. A motion that
cannot be opened leaves no proposal.

### User Story 3: Neil records and carries out the result (P1)

When the motion closes, Neil records the result once. Rejected: the thread says so and the report stays open.
Approved: the report is decided, the thread says so, an expulsion takes the Alliance out of the NaP register, an Exile
adds the accused Player to REAPER (or the thread asks for `/reaper add` when the Player cannot be read), and
`#nap-announcements` gets the outcome, naming no Member.

## Requirements

- **FR-001** `/nap report` only for the NaP Council, against another Alliance in the NaP; text 1–1000 characters, uid optional.
- **FR-002** A private thread under `#nap-leaders` with the NaP Council and the reporter; the report posted there, mentions off.
- **FR-003** Reports and proposals kept forever in `neil.db` (migration 29, ADR 28), not deleted at Unlink; Neil never
  deletes, archives or locks a thread.
- **FR-004** `/nap report-outcome` only for who may open a NaP Motion; one waiting proposal per report; note ≤ 500.
- **FR-005** The motion text names only the number, the accused Alliance and the outcome.
- **FR-006** On the tick after the NaP Rules', each closed motion's result is recorded once.
- **FR-007** Approved expulsion: a leave by the proposer, NaP list refreshed, announced as removed by NaP Motion.
- **FR-008** Approved Exile: the Player read through the caching client and added to REAPER; an existing Exile kept.
- **FR-009** One `#nap-announcements` post per approved outcome: number, Alliance, outcome, date.
- **FR-010** One `#neil-log` line per report, proposal and result; only there and in `neil.db` the reporter and proposer.
- **FR-011** Neil gets Create Private Threads and Send Messages in Threads in `#nap-leaders`.
- **FR-012** ADR 28, proposed dictionary terms, ROADMAP, STATUS, SERVER-SETUP, TEST-RUN and DISCORD-PLATFORM.
