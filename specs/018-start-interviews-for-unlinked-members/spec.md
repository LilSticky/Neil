# Feature Specification: Start Interviews for unlinked Members

**Feature Branch**: `018-start-interviews-for-unlinked-members`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User: "interview should be triggered for any player that comes online and is not already linked, or when Neil
comes online and sees unlinked members."

## Clarifications

### Session 2026-11-05

- Q: Does the startup check have a limit? → A: yes, the user chose a limit after the review (2026-11-05): 10 Interviews per
  start of Neil. Members over the limit are counted in the log and get an Interview the next time they come online.
- Q: How does Neil know a Member came online? → A: from Discord's presence information, which the user accepts for this
  slice. Neil reads it only to start Interviews and stores none of it.
- Q: When may a new Interview start after one was abandoned? → A: every time the Member comes online, with no waiting. The
  user knows a Member who stays unlinked gets a new thread on each login after the last one ended.
- Q: Who gets an Interview when Neil starts? → A: only the Members who are not Linked and online at that moment. The others
  get theirs when they come online.
- Q: What about a Member whose hand-off is waiting for an Officer? → A: they are skipped, as are bots.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member who comes online is interviewed (Priority: P1)

A Member who is not Linked comes online. Neil starts an Onboarding Interview for them in a private thread, the same one
they would get on joining, so nobody stays unlinked just because they missed it.

**Why this priority**: it is the request: every unlinked Member is led to a Link without an Officer having to ask.

**Independent Test**: automated: an unlinked Member goes from offline to online and an Interview opens; a Linked Member
doing the same gets none.

**Acceptance Scenarios**:

1. **Given** a Member who is not Linked and has no open Interview, **When** they come online, **Then** an Interview starts.
2. **Given** a Linked Member, **When** they come online, **Then** no Interview starts.
3. **Given** a Member with an open Interview, **When** they come online, **Then** no second Interview starts and the open
   one goes on.
4. **Given** a Member whose hand-off is waiting for an Officer, **When** they come online, **Then** no Interview starts.
5. **Given** a bot, **When** it comes online, **Then** no Interview starts.
6. **Given** a Member whose last Interview was abandoned, **When** they come online again, **Then** a new Interview starts.
7. **Given** an online Member, **When** their status changes between online, idle and do not disturb, **Then** that is not
   coming online and no Interview starts.
8. **Given** a Member whose Interview was abandoned while they stayed online, **When** nothing else changes, **Then** no new
   Interview starts until they next come online.

---

### User Story 2 - Neil interviews the unlinked Members it sees when it starts (Priority: P1)

Neil starts and sees Members online who are not Linked. Each of them gets an Interview, so a restart does not leave them
waiting until they next log in.

**Why this priority**: it is the second half of the request; Members already online never "come online".

**Independent Test**: automated: Neil starts with one unlinked Member online, one offline and one Linked online; only the
first gets an Interview.

**Acceptance Scenarios**:

1. **Given** a Member who is not Linked and online when Neil starts, **When** startup ends, **Then** an Interview starts.
2. **Given** a Member who is not Linked and offline when Neil starts, **When** startup ends, **Then** no Interview starts,
   and one starts when they come online.
3. **Given** a Member with an open Interview when Neil starts, **When** startup ends, **Then** no second Interview starts.
4. **Given** a Member whose hand-off is waiting for an Officer, or a bot, **When** Neil starts, **Then** no Interview starts.
5. **Given** several such Members, **When** Neil starts, **Then** their Interviews start one after another, and a failure
   for one is logged and the next one follows.
6. **Given** anything was started or failed, **When** the startup check ends, **Then** the log channel has one line with
   the counts.

### Edge Cases

- A Member who appears offline on purpose (invisible) is offline to Neil.
- A Member comes online while `/interview` opens an Interview for them: they still have at most one open Interview.
- A Member comes online during Neil's startup check: they get one Interview, not two.
- A Member is Linked between coming online and the Interview starting: no Interview starts.
- The Interview cannot start (no thread can be opened, the Daily Quota is spent): it behaves as an Interview started on
  joining does; a failure is logged, never thrown, and the next time they come online Neil tries again.
- Neil loses and regains its connection: Members seen online again are not treated as coming online unless they were seen
  offline.
- A Member who joins and is online at once gets the one Interview joining starts.
- An unlinked Officer or server owner is a Member like any other and gets an Interview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST start an Onboarding Interview when a Member comes online who is not Linked, has no open Interview,
  has no hand-off waiting for an Officer and is not a bot.
- **FR-002**: Coming online MUST mean going from offline to online, idle or do not disturb; a change between those three
  MUST NOT count.
- **FR-003**: When Neil starts, it MUST apply the same rule to every Member online at that moment, one Member after
  another, up to 10 Interviews per start of Neil (started and failed together). A failure for one Member MUST be logged and
  the next one follows. Members over the limit MUST be counted in the log; they get an Interview when they next come online.
- **FR-004**: Neil MUST NOT wait between Interviews: a Member whose last Interview ended may get a new one the next time
  they come online or Neil starts.
- **FR-005**: A Member MUST have at most one open Interview, however it was started.
- **FR-006**: Neil MUST log one line with the counts when its startup check started or failed anything.
- **FR-007**: Neil MUST NOT store whether a Member is online, or when they were; it is read only to start Interviews.
- **FR-008**: `/interview` and the Interview started on joining MUST keep working as they do.

### Key Entities

No new entity. Onboarding Interview, Link and hand-off are as in the dictionary. A Member's online status is read, not kept.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Member who is not Linked and comes online, with no open Interview or waiting hand-off, has an open
  Interview within a minute.
- **SC-002**: After a start of Neil, every such Member online at that moment has an open Interview.
- **SC-003**: No Member ever has two open Interviews.
- **SC-004**: No Linked Member, bot, or Member with a waiting hand-off gets an Interview from this slice.
- **SC-005**: Nothing about a Member's online status remains after Neil stops.

## Assumptions

- The user switches on Discord's presence permission for the bot before this slice is deployed; without it Neil cannot log
  in. HOSTING.md gets this step.
- An Interview started this way opens exactly as one started on joining: same thread, same messages, and the same use of
  the Quota Reserve.
- Repeated threads for a Member who stays unlinked are accepted by the user; thread clean-up stays as slice 013 made it.
- With no waiting, a restart starts a new Interview for every online unlinked Member whose last one has ended.
- Depends on the Links being on Wispbyte: a start of Neil treats a Member without a Link there as not Linked (HOSTING.md).
  The limit of 10 bounds what a missing Link can cost at one start.
