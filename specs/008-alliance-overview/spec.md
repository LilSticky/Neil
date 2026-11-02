# Feature Specification: Alliance overview

**Feature Branch**: `008-alliance-overview` (stacked on `007-find-an-alliance-by-approximate-name`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: ROADMAP Later: "Alliance overview: activity (`active`, `daily_honor`, `daily_tech`)."

## Clarifications

### Session 2026-11-02

- Q: Content? → A: all four: Alliance totals, top contributors, Least Active members, a per-member table.
- Q: Who? → A: any Member.
- Q: How opened? → A: an "Overview" button on the Alliance card (`/alliance`), shown only to the Member who pressed.
- Q: Dictionary? → A: Alliance Overview, Weekly Activity, Daily Honor, Daily Tech, Least Active approved (2026-11-02).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See an Alliance's activity at a glance (Priority: P1)

A Member looks up an Alliance with `/alliance` and presses "Overview" under the card. Only they see the Alliance
Overview: totals (sum and average Weekly Activity, Daily Honor and Daily Tech; members online now and in the last 24
hours), the top 5 by Weekly Activity, Daily Honor and Daily Tech, the 5 Least Active members, and how many members
have no data.

**Why this priority**: R4s and R5s use activity to manage their Alliance; today they must open the tracker.

**Independent Test**: automated: an Alliance with 3 members (one without activity data) → totals over the 2 with data,
top lists, Least Active, "1 member without data"; no Game API request while the roster is still held.

**Acceptance Scenarios**:

1. **Given** an Alliance card, **When** any Member presses "Overview", **Then** only they get the Alliance Overview.
2. **Given** members without activity data, **When** totals are computed, **Then** those members are left out of sums,
   averages, top lists and Least Active, and counted as "no data".
3. **Given** the roster shown on the card is still held by Neil, **When** "Overview" is pressed, **Then** no Game API
   request is made; otherwise the Alliance is looked up again (lookup purpose, cache first).
4. **Given** the Game API cannot answer, **When** the roster is no longer held, **Then** the Member gets the usual
   private "try again" answer.

---

### User Story 2 - A per-member table (Priority: P2)

Below the overview, a table lists every member with Weekly Activity, Daily Honor, Daily Tech and last online, sorted by
Weekly Activity (highest first, "no data" last), 25 per page with page buttons that only the asking Member can use.

**Independent Test**: automated: 30 members → page 1 of 2 with 25 rows, "Next" shows 5 rows; another Member's press
gets the "not yours" note.

**Acceptance Scenarios**:

1. **Given** the overview, **When** shown, **Then** page 1 of the table is part of it.
2. **Given** more than 25 members, **When** the Member presses "Next"/"Previous", **Then** the table turns page.
3. **Given** a member online now, **When** listed, **Then** "online" shows instead of a time; unknown last online shows
   "–".

### Edge Cases

- An Alliance with no member data at all: totals say "no activity data", lists are empty, the table still lists names.
- Player Names with markdown are escaped; no uids are shown (slice 005 FR-027).
- Times are relative (Discord timestamps), so each Member sees their own time zone.
- The overview fits Discord's limits (embed fields, 4096-character description); long names are cut.

## Requirements *(mandatory)*

- **FR-001**: The Alliance card MUST carry an "Overview" button for any Member.
- **FR-002**: The Alliance Overview MUST be private to the pressing Member and show totals, top 5 by each of Weekly
  Activity, Daily Honor and Daily Tech, the 5 Least Active, and the count of members without data.
- **FR-003**: Members without activity data MUST be excluded from totals, top lists and Least Active.
- **FR-004**: A per-member table MUST list all members (25 per page, sorted by Weekly Activity, "no data" last) with
  page buttons usable only by the asking Member.
- **FR-005**: The overview MUST use the roster Neil already holds for the card; when it no longer holds it, one lookup
  with the lookup purpose (cache first, Quota Reserve kept).
- **FR-006**: No uid is shown.

## Success Criteria *(mandatory)*

- **SC-001**: An R4 sees who contributed least this week in two clicks (`/alliance`, "Overview").
- **SC-002**: Opening the overview right after the card costs no Game API request.

## Assumptions

- `active` is weekly activity points, `daily_honor` and `daily_tech` today's contributions (GAME-API.md); the roster
  gives `online` and `last_online_at`.
- The manual check is collected in TEST-RUN.md and run later by the user.
