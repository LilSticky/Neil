# Feature Specification: Say goodbye

**Feature Branch**: `010-say-goodbye` (stacked on `009-keep-roles-in-sync`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: ROADMAP Later: "Say goodbye: clean up Links and roles when a Member leaves."

## Clarifications

### Session 2026-11-02

- Q: What happens to the Link when a Linked Member leaves? → A: it ends at once (Unlink); the Player can be Linked
  again, and a Member who comes back goes through a new Onboarding Interview.
- Q: What does Neil say? → A: a log line for Officers, and a private message to the Member if Discord allows it (no
  public farewell).
- Q: Members who left while Neil was offline? → A: found and Unlinked at startup and in the Daily Sync.
- Q: The leaving Member was the chosen approver of pending Rank Approvals? → A: those go to the Officers.
- Q: Dictionary? → A: "Unlink" added; Link and Rank Approval amended (approved 2026-11-02).
- Roles: Discord removes a leaving Member's roles itself; Neil forgets what it applied to them, so a Member who comes
  back starts clean.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Linked Member leaves (Priority: P1)

A Linked Member leaves the server (or is kicked or banned). Neil ends their Link, forgets the name and roles it applied
to them, posts one log line for Officers (who left, the uid and the nickname Neil had given them), and sends the Member
a private message that their Link ended and that they will be interviewed again if they come back. Their open
Interview and their own pending Rank Approval are ended as before (slice 005).

**Why this priority**: a Link that outlives its Member blocks the Player for anyone else and keeps stale data.

**Independent Test**: automated: a Linked Member leaves → no Link for them or their uid, no applied state, one log
line, one private message attempted; a new Member can be Linked to the same uid.

**Acceptance Scenarios**:

1. **Given** a Linked Member, **When** they leave, **Then** their Link ends and the uid is free to be Linked again.
2. **Given** a Linked Member leaves, **When** Neil Unlinks them, **Then** one log line names the Member, the uid and the
   nickname Neil had given them.
3. **Given** a Linked Member leaves, **When** Neil Unlinks them, **Then** Neil sends them a private message; **Given**
   Discord refuses it (no shared server, private messages closed), **Then** nothing else changes and nothing is
   logged as an error.
4. **Given** a Member who was Unlinked comes back, **When** they join, **Then** a new Onboarding Interview starts.
5. **Given** a Member without a Link leaves, **When** Neil sees it, **Then** no Unlink happens (slice 005 behaviour
   only).

---

### User Story 2 - Rank Approvals waiting on a leaving Member go to the Officers (Priority: P1)

The leaving Member was the chosen approver (the Alliance's R5) of pending Rank Approvals for other Members. Each of
those now waits for the Officers: Neil records the Officers as approver and says so in its thread, mentioning the
Officer roles.

**Independent Test**: automated: R5 Member is approver of two pending Rank Approvals and leaves → both have the
Officers as approver, one message in each thread, an Officer's press then approves.

**Acceptance Scenarios**:

1. **Given** pending Rank Approvals whose approver is the leaving Member, **When** they leave, **Then** each goes to
   the Officers, with a message in its thread mentioning the Officer roles.
2. **Given** a Rank Approval already approved or cancelled, **When** its approver leaves, **Then** it is not changed.
3. **Given** the Rank Approval went to the Officers, **When** the departed Member's old button press arrives, **Then**
   it is refused (they are not an Officer).

---

### User Story 3 - Leaves Neil missed are caught up (Priority: P2)

While Neil was offline, a Linked Member left. At startup, and during the Daily Sync, every Linked Member Discord
reports as not on the server is Unlinked the same way (log line, private message, Rank Approvals handed on).

**Independent Test**: automated: two Links, one Member no longer on the server → at startup that one is Unlinked, the
other is untouched; a Discord failure while fetching a Member Unlinks no one.

**Acceptance Scenarios**:

1. **Given** a Link whose Member Discord reports as unknown on the server, **When** Neil starts, **Then** that Member
   is Unlinked.
2. **Given** the same during the Daily Sync, **When** the sync reaches that Member, **Then** they are Unlinked and no
   Game API request is made for them.
3. **Given** fetching a Member fails for another reason (Discord outage, timeout), **When** Neil starts or syncs,
   **Then** that Member is not Unlinked.

### Edge Cases

- The leave event and the startup or Daily Sync both see the same Member: they are Unlinked once (a second Unlink
  finds no Link and does nothing).
- The log channel cannot be posted to: the Unlink still happens; the failure is logged to the console.
- The Rank Approval thread is gone: the approver still changes to the Officers.
- Kicked and banned Members leave like everyone else.
- A leaving approver whose own Link is already gone: their pending Rank Approvals still go to the Officers (no log
  line or private message for an Unlink, since there is none).

## Requirements *(mandatory)*

- **FR-001**: When a Linked Member leaves, Neil MUST end their Link and forget the name and roles it applied to them.
- **FR-002**: Each Unlink MUST post one log line with the Member, the uid and the nickname Neil had given them (when
  known).
- **FR-003**: Each Unlink MUST try one private message to the Member; a refusal MUST NOT stop or fail the Unlink.
- **FR-004**: Pending Rank Approvals whose approver is the leaving Member MUST go to the Officers, with a message in
  their thread.
- **FR-005**: At startup and in the Daily Sync, Neil MUST Unlink every Linked Member Discord reports as not on the
  server, and MUST NOT Unlink on any other fetch failure.
- **FR-006**: Unlink MUST be idempotent: a Member without a Link is not Unlinked again.
- **FR-007**: Unlink MUST NOT use the Game API.
- Slice 009 FR-007 ("the Daily Sync MUST NOT … remove Links") is narrowed: the Daily Sync removes Links only of
  Members no longer on the server, by Unlink.

## Success Criteria *(mandatory)*

- **SC-001**: After a Linked Member leaves, their Player can be Linked by another Member at once (automated test).
- **SC-002**: No Link outlives its Member by more than one startup or one Daily Sync (automated tests).
- **SC-003**: No Unlink happens because of a Discord outage (automated test).

## Assumptions

- Discord removes a leaving Member's roles and nickname; Neil does not need to remove them.
- A private message to a user who left usually fails (no shared server); it is tried anyway.
- The Rank Approval history (approved, cancelled) is kept; only the Link and the applied state are removed.
- The manual check is collected in TEST-RUN.md and run later by the user.
