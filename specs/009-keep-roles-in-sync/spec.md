# Feature Specification: Keep roles in sync

**Feature Branch**: `009-keep-roles-in-sync` (stacked on `008-alliance-overview`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: ROADMAP Later: "Keep roles in sync: re-read alliance rosters within the budget and update roles and
nicknames when a Player changes alliance, rank or kingdom."

## Clarifications

### Session 2026-11-02

- Q: How often? → A: once a day (the Daily Sync), at a configured UTC hour.
- Q: Budget? → A: at most 500 Game API requests per Daily Sync (Sync Share, configuration); lookups' share and the
  Quota Reserve are never touched; what is left waits for the next day.
- Q: A Member's own nickname? → A: always restored to the format.
- Q: Log? → A: one line per changed Member, plus a summary per run.
- Q: A Player moved Alliance and had an approved rank? → A: the approved rank is dropped; the new Alliance's rank
  from the Game API is used; if unknown there, no rank role and a log line for Officers (no new Rank Approval).
- Q: Dictionary? → A: Daily Sync, Sync Share approved (2026-11-02).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Names and roles follow the game (Priority: P1)

Once a day Neil re-reads the Alliance Roster of every Alliance that has Linked Members, and looks up Linked Players
who are in no Alliance or no longer in the roster they were in. Each Linked Member on the server gets the nickname and
Managed Roles of their Player as it is now (slice 006 rules); every change is logged.

**Why this priority**: ranks, alliances and levels change weekly; stale roles mislead the server.

**Independent Test**: automated: three Linked Members, two in `NML` (one promoted R3 → R4, one now T8), one moved to
`ABC` → one roster request for NML, one Player request for the mover; nicknames and roles updated; three log lines and
one summary.

**Acceptance Scenarios**:

1. **Given** Linked Members in the same Alliance, **When** the Daily Sync runs, **Then** one roster request covers all
   of them.
2. **Given** a Linked Player no longer in their last Alliance's roster, or in no Alliance, **When** the Daily Sync
   runs, **Then** that Player is looked up by uid (one request).
3. **Given** a Player's rank, Alliance, Kingdom, Player Name or sanctuary level changed, **When** synced, **Then**
   nickname and Managed Roles match the new state and a log line names what changed.
4. **Given** nothing changed for a Member and their nickname and roles are as Neil set them, **When** synced, **Then**
   nothing is changed or logged for them.
5. **Given** the Member changed their own nickname, **When** synced, **Then** it is restored and logged.
6. **Given** a Rank Approval gave the rank and the Player is still in that Alliance with the rank unknown in the Game
   API, **When** synced, **Then** the approved rank stays; **Given** the Game API now knows the rank, **Then** that
   rank is used.
7. **Given** a Player moved to another Alliance and the rank there is unknown, **When** synced, **Then** the old
   (approved) rank is dropped, no rank role is given, and the log asks Officers to check.

---

### User Story 2 - The sync stays within its share (Priority: P1)

The Daily Sync makes at most 500 Game API requests (Sync Share), never makes a request when that would leave less than
the Quota Reserve, and stops for the day when either limit is reached; the rest is done the next day first.

**Independent Test**: automated: Sync Share 2, three Alliances → two requests, the third Alliance is first next day;
summary says "1 left".

**Acceptance Scenarios**:

1. **Given** the Sync Share is reached, **When** more Members wait, **Then** the run stops and the summary says how many
   are left; the next run starts with them.
2. **Given** the Daily Quota left is at the Quota Reserve, **When** the sync would send, **Then** it stops.
3. **Given** Neil restarts after today's run, **When** it starts, **Then** the Daily Sync does not run again today; a
   restart before the hour runs it at the hour; a restart after a missed hour runs it soon after start.

### Edge Cases

- A Linked Member not on the server: skipped, no request for them (their Alliance's roster may still be read for
  others).
- A roster request fails (unavailable, not found): its Members are looked up by uid instead, within the share.
- A Player not found by uid: logged once per run, Link kept (cleanup is "Correct a link").
- Discord permission/hierarchy problems: as slice 006 (skipped and logged, never fatal).
- Several Members changed: one log line each; the summary counts checked, changed, skipped, requests used.

## Requirements *(mandatory)*

- **FR-001**: Neil MUST run the Daily Sync once per UTC day at `SYNC_HOUR_UTC` (configuration, default 3), recording
  the day it ran so a restart does not repeat it.
- **FR-002**: The Daily Sync MUST read each Alliance with Linked Members once (lookup by Kingdom and tag) and look up
  by uid only Players not found that way.
- **FR-003**: The Daily Sync MUST apply nickname and Managed Roles with the slice 006 rules to every Linked Member on
  the server, overwriting a nickname changed by hand.
- **FR-004**: Rank on the Link: a Game API rank replaces any other; an approved rank stays while the Player stays in
  that Alliance with the rank unknown; it is dropped when the Player moves Alliance.
- **FR-005**: The Daily Sync MUST use at most `SYNC_SHARE` requests per day (default 500) and never the Quota Reserve;
  Members left over come first the next day.
- **FR-006**: Each changed Member MUST get one log line (what changed); each run MUST end with one summary line.
- **FR-007**: The Daily Sync MUST NOT start Rank Approvals, unlink, or remove Links.

## Success Criteria *(mandatory)*

- **SC-001**: A Player promoted in the game has the new rank role within 24 hours (plus at most one more day when the
  Sync Share runs out).
- **SC-002**: The Daily Sync never uses more than its Sync Share or touches the Quota Reserve (automated tests).
- **SC-003**: A sync of 100 Linked Members in 10 Alliances costs at most 10 requests plus one per moved or Alliance-less
  Player.

## Assumptions

- The roster lists each member's uid, Player Name, rank, Kingdom and sanctuary level (GAME-API.md: `kid`, `lv`).
- Neil knows each Link's last Alliance (Kingdom and tag) from the last apply (slice 006 applied state, extended).
- The manual check is collected in TEST-RUN.md and run later by the user.
