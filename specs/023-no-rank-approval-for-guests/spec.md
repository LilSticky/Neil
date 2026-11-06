# Feature Specification: No Rank Approval for Guests

**Feature Branch**: `023-no-rank-approval-for-guests`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Issue [#67](https://github.com/LilSticky/Neil/issues/67), from slice 019: the rule that an R5 opens the Rank Approval
thread assumes the approver holds `R5`, but a Guest leader doesn't.

## Clarifications

### Session 2026-11-06

- Q: Do Guests get Rank Approvals at all? → A: no. Neil asks nobody, the Interview thread closes as usual, and an Officer can
  still set a rank with `/rank`.
- Q: Does anything already stored need carrying over? → A: no. Neil isn't live and the test server is empty, so no backwards
  compatibility is needed until the user announces the release.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Guest is Linked without a Rank Approval (Priority: P1)

A Guest confirms their Player in the Interview, and the game lists no rank for them. Neil stores the Link and asks nobody. The
thread closes as for any Link with no Rank Approval waiting.

**Why this priority**: it is the whole slice. A Guest's rank gives no role, and the leader asked often can't open the thread, so
the question only keeps a thread open.

**Independent Test**: automated: a Link of a Player outside the Home Kingdom with no rank stores no Rank Approval, asks nobody
and deletes the thread.

**Acceptance Scenarios**:

1. **Given** a Guest with no rank in the game, **When** the Link is made in the Interview, **Then** no Rank Approval is stored or
   announced, and the Interview thread is deleted.
2. **Given** a Guest with no rank in the game, **When** an Officer's Link is confirmed, **Then** no Rank Approval is stored or
   announced.
3. **Given** a Home Kingdom Member with no rank in the game, **When** the Link is made either way, **Then** the Rank Approval is
   asked as before.
4. **Given** a Linked Guest in an Alliance, **When** an Officer uses `/rank`, **Then** the rank is set as before and shows in
   their nickname.

### Edge Cases

- A Guest whose rank the game lists: nothing changes, no Rank Approval was needed.
- A Guest who later moves to the Home Kingdom with no rank in the game: Neil doesn't ask; an Officer uses `/rank`.
- The `#neil-log` line still names the Alliance's leader when they are Linked, as for any Link; that is not a Rank Approval.
- A Rank Approval already pending when its Member becomes a Guest: it stays and ends as any other. Nothing cancels it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST NOT open a Rank Approval at a Link of a Guest, in the Interview or by an Officer.
- **FR-002**: Neil MUST treat such a Link as one with no Rank Approval waiting, so the Interview thread closes as usual.
- **FR-003**: Neil MUST keep asking Rank Approvals for Home Kingdom Members, unchanged.
- **FR-004**: `/rank` MUST keep working for a Linked Guest in an Alliance.
- **FR-005**: The dictionary and the guides MUST say that Guests get no Rank Approval, and lose the note that a Guest leader
  can't open the thread.

### Key Entities

- **Rank Approval**: as in the dictionary, now asked only for a Home Kingdom Member.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No Guest's Link leaves a thread waiting on someone who can't open it.
- **SC-002**: Every Home Kingdom Member with no rank in the game is still asked about, as before.

## Assumptions

- A Guest's rank gives no role and only changes the nickname, so leaving it unknown costs little.
- Slice 006's roles and nicknames and slice 021's Guest rules work as merged.
