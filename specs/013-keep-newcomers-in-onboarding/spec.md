# Feature Specification: Keep newcomers in onboarding

**Feature Branch**: `013-keep-newcomers-in-onboarding`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User: "New members should receive an onboarding role that allows them to see and send messages to the
onboarding channel. This role should be restored after unlink. Visual noise from too many channels should be reduced."

## Clarifications

### Session 2026-11-04

- Q: When does a Member lose the role? → A: at Link (Interview Link or Officer Link), even with a Rank Approval
  pending. A handed-off Member keeps it until the Officer Link.
- Q: What does "less visual noise" cover? → A: newcomers see only `#onboarding`; Linked Members do not see
  `#onboarding`; finished Onboarding Interview threads are deleted instead of archived.
- Q: Where does the role come from? → A: Neil creates it on first use, without permissions (as for Managed Roles,
  ADR 8). The channel permissions are set by hand.
- Q: Dictionary? → A: "Onboarding Role" added (approved 2026-11-04).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A newcomer sees only #onboarding (Priority: P1)

A Member joins. Neil gives them the Onboarding Role, then starts the Onboarding Interview as before. With the server set
up as HOSTING.md describes (the other channels hidden from `@everyone`, `#onboarding` visible to the Onboarding Role),
the newcomer sees `#onboarding` and their own Interview thread, and nothing else.

**Why this priority**: it is the request itself; without it a newcomer faces every channel before they are Linked.

**Independent Test**: automated: a Member joins → the Onboarding Role is created if missing and given to them; a bot
joins → nothing.

**Acceptance Scenarios**:

1. **Given** the Onboarding Role does not exist, **When** a Member joins, **Then** Neil creates it without permissions
   and gives it to them.
2. **Given** the Onboarding Role exists, **When** a Member joins, **Then** Neil gives it to them and starts the
   Onboarding Interview.
3. **Given** a role named like the Onboarding Role has permissions, **When** Neil would use it, **Then** Neil refuses it,
   logs why, and the Onboarding Interview still starts.
4. **Given** a bot joins, **When** Neil sees it, **Then** it gets no Onboarding Role.

---

### User Story 2 - A Linked Member stops seeing #onboarding (Priority: P1)

When a Member is Linked (by the Interview or by an Officer Link), Neil removes their Onboarding Role, so `#onboarding`
disappears for them. A Member whose Interview was handed off keeps the role until an Officer Links them.

**Why this priority**: Linked Members are the majority; for them `#onboarding` is noise.

**Independent Test**: automated: Interview Link and Officer Link each remove the Onboarding Role, also with a Rank
Approval pending; a hand-off does not.

**Acceptance Scenarios**:

1. **Given** a Member with the Onboarding Role, **When** they are Linked by the Interview, **Then** the role is removed.
2. **Given** the same Member, **When** an Officer Links them, **Then** the role is removed.
3. **Given** their Link has a pending Rank Approval, **When** they are Linked, **Then** the role is still removed.
4. **Given** an Interview is handed off to the Officers, **When** the hand-off happens, **Then** the Member keeps the
   role.

---

### User Story 3 - An Unlinked Member gets the role back (Priority: P1)

A Member still on the server is Unlinked (by an Officer or by themselves). Neil removes their Managed Roles and nickname
as before and gives them the Onboarding Role again.

**Why this priority**: an Unlinked Member must still reach `#onboarding`, the only channel they can see.

**Independent Test**: automated: Unlink by an Officer and by the Member each give the Onboarding Role back; an Unlink
because the Member left gives nothing.

**Acceptance Scenarios**:

1. **Given** a Linked Member on the server, **When** an Officer Unlinks them, **Then** they get the Onboarding Role.
2. **Given** a Linked Member, **When** they Unlink themselves, **Then** they get the Onboarding Role.
3. **Given** a Linked Member leaves, **When** Neil Unlinks them, **Then** no role is given.

---

### User Story 4 - Neil catches up at startup (Priority: P2)

Members joined, or were Linked, before this slice or while Neil was offline. At startup, Neil gives the Onboarding Role
to every Member on the server who is not Linked, and removes it from every Linked Member.

**Why this priority**: without it, everyone already on the server is in the wrong state after the deploy.

**Independent Test**: automated: three Members (Linked with the role, not Linked without it, Linked without it) → after
startup only the not-Linked Member has the role; bots are skipped; a failure for one Member does not stop the others.

**Acceptance Scenarios**:

1. **Given** a Member who is not Linked and has no Onboarding Role, **When** Neil starts, **Then** they get it.
2. **Given** a Linked Member who has the Onboarding Role, **When** Neil starts, **Then** it is removed.
3. **Given** a Member already in the right state, **When** Neil starts, **Then** nothing changes for them.
4. **Given** a role change fails for one Member, **When** Neil starts, **Then** the others are still handled and the
   failure is logged.

---

### User Story 5 - #onboarding stays empty (Priority: P2)

When an Onboarding Interview thread is finished, Neil deletes it instead of archiving it. A thread is finished when the
Interview ends in a Link with no Rank Approval pending, when its pending Rank Approval ends, when a handed-off Interview
ends in an Officer Link, or when the Interview is abandoned (the Member left or stopped answering). The log channel
keeps the record as before.

**Why this priority**: archived threads pile up in `#onboarding` for Officers.

**Independent Test**: automated: each of the endings deletes the thread; a thread with a pending Rank Approval stays.

**Acceptance Scenarios**:

1. **Given** an Interview ends in a Link with no pending Rank Approval, **When** it ends, **Then** its thread is deleted.
2. **Given** an Interview's Rank Approval is pending, **When** the Link is made, **Then** the thread stays until the
   Rank Approval ends, and is then deleted.
3. **Given** a handed-off Interview, **When** an Officer Links the Member, **Then** the thread is deleted.
4. **Given** an Interview is abandoned, **When** Neil ends it, **Then** its thread is deleted.
5. **Given** the thread is already gone, **When** Neil deletes it, **Then** that is not an error.

### Edge Cases

- Neil lacks Manage Roles, or the Onboarding Role sits above Neil's role: the role change fails, Neil logs it, and the
  Interview, Link or Unlink still goes ahead.
- A Member who removes the role by hand cannot see `#onboarding`; the next startup gives it back if they are not Linked.
- An Officer gives the role to a Linked Member by hand: the next startup removes it.
- The Member leaves between joining and getting the role: the failure is ignored.
- The Onboarding Role is deleted on Discord: Neil creates it again on next use.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a Member who is not a bot joins, Neil MUST give them the Onboarding Role as the Onboarding Interview
  starts.
- **FR-002**: Neil MUST create the Onboarding Role without permissions when it is missing, and MUST refuse to use a role
  of that name that has permissions (as for Managed Roles, ADR 8).
- **FR-003**: When a Member is Linked (Interview Link or Officer Link), Neil MUST remove their Onboarding Role, whether
  or not a Rank Approval is pending.
- **FR-004**: When a Member still on the server is Unlinked, Neil MUST give them the Onboarding Role.
- **FR-005**: At startup, Neil MUST give the Onboarding Role to every non-bot Member not Linked and remove it from every
  Linked Member; a failure for one Member MUST NOT stop the others.
- **FR-006**: A failed Onboarding Role change MUST be logged and MUST NOT stop the Interview, Link or Unlink.
- **FR-007**: Neil MUST delete a finished Onboarding Interview thread instead of archiving it (endings listed in User
  Story 5); a thread with a pending Rank Approval MUST stay until it ends.
- **FR-008**: Neil MUST NOT change channel permissions; HOSTING.md MUST describe the server setup (`@everyone` hidden
  from the other channels, the Onboarding Role allowed to view and write in `#onboarding`, Officers able to see the
  threads).
- **FR-009**: The Onboarding Role MUST NOT use the Game API.

### Key Entities

- **Onboarding Role**: the Discord role a Member holds while not Linked; lets them see and write in `#onboarding`. Not a
  Managed Role.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every non-bot Member on the server has the Onboarding Role exactly when they are not Linked, at the latest
  after the next startup (automated tests).
- **SC-002**: A newcomer on a server set up as HOSTING.md describes sees one channel, `#onboarding` (manual check).
- **SC-003**: After an Interview finishes, `#onboarding` holds no thread for it (automated test, manual check).

## Assumptions

- The Onboarding Role is named `Onboarding`; Neil's role must sit above it, as for Managed Roles.
- Threads archived before this slice are not deleted by Neil; they can be deleted by hand.
- Whether an Unlinked Member gets a new Onboarding Interview is unchanged by this slice.
- The Daily Sync does not reconcile the Onboarding Role; startup does.
- The manual check is collected in TEST-RUN.md and run later by the user.
