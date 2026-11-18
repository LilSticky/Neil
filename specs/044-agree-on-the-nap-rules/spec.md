# Feature Specification: Agree on the NaP Rules

**Feature Branch**: `044-agree-on-the-nap-rules`

**Created**: 2026-11-18

**Status**: Approved

**Input**: Issue [#157](https://github.com/LilSticky/Neil/issues/157), split from
[#121](https://github.com/LilSticky/Neil/issues/121); built on slice 043 (NaP Motion, ADR 25) and slice 041 (public NaP
announcements, ADR 22).

The approved choices:

1. Three new `/nap` subcommands: `rules`, `rules-history [version]` and `rules-propose`.
2. A new version is entered in a form prefilled with the current rules: the text (at most 4000 characters) and what
   changed (at most 500).
3. Every proposal gets the next number, also a rejected one; the history shows its state.
4. Only one proposal can be open at a time.
5. A rejection is kept in the history and logged in `#neil-log`, not announced in `#nap-announcements`.
6. The announcement carries what changed and the full text, as plain messages (split when over 2000 characters).
7. Everyone can see proposed and rejected versions in `/nap rules-history`, without the proposer.

Out of scope: how NaP Motions are voted on and who may open one (slice 043), a pinned copy of the rules, editing or
deleting old versions, Neil translating texts itself.

## User Scenarios

### User Story 1: A council member proposes new rules (P1)

A member of the NaP Council runs `/nap rules-propose`. A form opens with the rules in effect filled in and a field for
what changed. Neil saves the next version and opens a NaP Motion on it, which names the version, what changed and where
to read the full text. Anyone else, a blank text or change, a text equal to the rules in effect, or a second proposal
while one is open, is refused privately. If the motion cannot be opened, nothing is saved.

### User Story 2: The NaP Motion decides (P1)

Approved, the version takes effect at once (the one before reads as replaced) and Neil announces it in
`#nap-announcements`: the version, since when, what changed and the full text, mentioning nobody. Rejected, it stays
in the history as rejected and the rules do not change. A failure in `#nap-announcements` only writes a `#neil-log` line.

### User Story 3: Any Member reads the rules (P1)

`/nap rules` shows the version in effect, since when, and its full text privately, or says there are none yet.
`/nap rules-history` lists every version newest first with its state, dates and what changed; with `version:` it shows
that version's full text. No public view names a Member.

## Requirements

- **FR-001** Numbered versions with text, change note, proposal time and state (proposed, in effect, replaced, rejected).
- **FR-002** Kept across restarts with the proposer and the NaP Motion (migration 27, ADR 26); never deleted at Unlink.
- **FR-003** `/nap rules-propose` opens a form; only who may open a NaP Motion may propose.
- **FR-004** One open proposal at a time, checked at the command and again at the form.
- **FR-005** A proposal opens a NaP Motion; a motion that cannot be opened leaves no version.
- **FR-006** Approved: in effect at once; decided once.
- **FR-007** Announced in `#nap-announcements` as plain content, mentions off, naming nobody.
- **FR-008** Rejected: kept as rejected, no announcement.
- **FR-009** `/nap rules`, private.
- **FR-010** `/nap rules-history [version]`, private, newest first, cut to fit.
- **FR-011** One `#neil-log` line per proposal, approval, rejection and failed announcement; only there the proposer.
- **FR-012** Dictionary terms NaP Rules and NaP Rules Version, ADR 26, ROADMAP and STATUS.
