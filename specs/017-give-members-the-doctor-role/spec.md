# Feature Specification: Give Members the Doctor Role

**Feature Branch**: `017-give-members-the-doctor-role`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User: "any confirmed player should get the doctor role to see basic information and get access to the
alliance-hall, where neil takes commands. The server should make clear distinctions between on-server information and
inter-sever information, but enable everyone to get in touch with text or vaoice. King announcementsare on-server only by
default."

## Clarifications

### Session 2026-11-04

- Q: Who is a "confirmed player"? → A: every Linked Member, Guests and Officer Links included. Neil creates the role
  without permissions, gives it at Link, takes it off at Unlink and puts it right at startup.
- Q: What do "on-server" and "inter-server" mean? → A: "server" there is the game's Kingdom. On-server is Home Kingdom
  information, shown to its Kingdom role (e.g. `#330`). Inter-server is Shared information, shown to every Doctor, Guests
  included, with the shared text and voice channels.
- Q: How is `#alliance-hall` the place for commands? → A: through Discord's Integrations settings only; Neil does not
  check the channel. Officer commands stay in the moderator channel; newcomers keep `/interview` in onboarding.
- Q: How does a King reach everyone? → A: two announcement channels, Home Kingdom and Shared, chosen by hand. The Home
  Kingdom one is the usual place. No new command.
- Q: Dictionary? → A: "Doctor Role", "Home Kingdom information" and "Shared information" added (approved 2026-11-04), so
  that "server" keeps meaning the Discord server.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Linked Member becomes a Doctor (Priority: P1)

A Member finishes the Onboarding Interview, or an Officer Links them. Neil gives them the Doctor Role as it takes the
Onboarding Role off, so they go straight from seeing only `#onboarding` to seeing the basic information and
`#alliance-hall`.

**Why this priority**: Everything else in the server layout hangs on this role. Without it, Guests have no shared way in.

**Independent Test**: Link a test account and check that it holds Doctor and no longer holds Onboarding.

**Acceptance Scenarios**:

1. **Given** a Member who is not Linked, **When** they are Linked through the Interview, **Then** they hold the Doctor Role.
2. **Given** a handed-off Member, **When** an Officer Links them, **Then** they hold the Doctor Role.
3. **Given** a Player of another Kingdom, **When** they are Linked as a Guest, **Then** they hold the Doctor Role.
4. **Given** a Link with a Rank Approval pending, **When** the Link is made, **Then** they hold the Doctor Role at once.

---

### User Story 2 - An Unlinked Member stops being a Doctor (Priority: P1)

A Member is Unlinked, by themselves or by an Officer. Neil takes the Doctor Role off and gives the Onboarding Role back.

**Why this priority**: The Doctor Role stands for a confirmed Player, so it must not outlive the Link.

**Independent Test**: `/unlink` a test account and check that Doctor is gone and Onboarding is back.

**Acceptance Scenarios**:

1. **Given** a Doctor, **When** they are Unlinked, **Then** they no longer hold the Doctor Role.
2. **Given** a Linked Member who left the server, **When** Neil Unlinks them, **Then** nothing fails and the Unlink stands.

---

### User Story 3 - Members already on the server are put right (Priority: P1)

At startup Neil compares every Member with the Links: each Linked Member holds the Doctor Role, and nobody else does.

**Why this priority**: The server already has Linked Members, who must not lose access when the channels move to Doctor.

**Independent Test**: Start Neil with Linked Members without the role, and a Member who is not Linked with it.

**Acceptance Scenarios**:

1. **Given** Linked Members without the Doctor Role, **When** Neil starts, **Then** each of them holds it.
2. **Given** a Member who is not Linked and holds the Doctor Role, **When** Neil starts, **Then** it is taken off.
3. **Given** bots on the server, **When** Neil starts, **Then** they are left alone.
4. **Given** anything was changed, **When** the startup check ends, **Then** the log channel has one line with the counts.

---

### User Story 4 - A server owner sets up the channels (Priority: P2)

The server guide tells the owner how to lay out the server: basic information and `#alliance-hall` for Doctors, a Home
Kingdom area, a Shared area with text and voice for every Doctor, and the two King announcement channels.

**Why this priority**: The distinction is made by channel permissions, which Neil never changes, so the guide is the
deliverable.

**Independent Test**: Follow the guide on the test server, then use View Server As Role for Doctor, `#330` and Onboarding.

**Acceptance Scenarios**:

1. **Given** the guide was followed, **When** viewing as a Guest (Doctor, another Kingdom), **Then** the basic information,
   `#alliance-hall`, the Shared area and the Shared announcements are visible, and the Home Kingdom area is not.
2. **Given** the guide was followed, **When** viewing as a Home Kingdom Doctor, **Then** the Home Kingdom area is visible as
   well.
3. **Given** the guide was followed, **When** a Member without the King role tries to post in an announcement channel,
   **Then** they cannot.
4. **Given** the guide was followed, **When** a Member uses `/player` outside `#alliance-hall`, **Then** Discord does not
   offer the command.
5. **Given** the guide was followed, **When** a newcomer is in `#onboarding`, **Then** `/interview` still works.

### Edge Cases

- A role named Doctor already exists with permissions: Neil does not use it and logs why, as for every role it creates.
- Neil lacks Manage Roles, or a Member sits above Neil: the Link or Unlink stands, and the failure is logged.
- An Officer is Linked: they hold the Doctor Role like any Member. Neil never gives or takes an Officer role, even one named
  Doctor.
- A Linked Member loses the Doctor Role by hand: the next startup gives it back.
- A Member Links, Unlinks and Links again: they end up holding the Doctor Role once.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST give the Doctor Role to a Member at every Link: Interview, Officer Link, Guests included.
- **FR-002**: Neil MUST take the Doctor Role off a Member still on the server at every Unlink.
- **FR-003**: At startup Neil MUST give the Doctor Role to every Linked Member on the server who lacks it, and take it off
  every other Member who holds it. Bots are left alone.
- **FR-004**: Neil MUST log one line with the counts when the startup check changed or skipped anything.
- **FR-005**: Neil MUST create the Doctor Role without permissions on first use, and MUST refuse to use a role of that name
  that has permissions, logging why.
- **FR-006**: A failure to give or take the role MUST be logged and MUST NOT undo or stop the Link or Unlink.
- **FR-007**: Neil MUST NOT change channel permissions, MUST NOT check the channel a command is used in, and MUST NOT gain
  a new command.
- **FR-008**: The server guide MUST set out the channel layout, the roles that see each area, the rule that only King posts
  in the announcement channels, and how to limit Member commands to `#alliance-hall`, keeping `/interview` usable in
  onboarding and Officer commands in the moderator channel.
- **FR-009**: Where the server guide shows a channel to Kingdom roles but means every Linked Member, such as NaP
  publications, it MUST use the Doctor Role instead.

### Key Entities

- **Doctor Role**: the Discord role of a Linked Member. Held exactly while Linked; it needs no stored data beyond the Link.
- **Home Kingdom information**: channels only the Home Kingdom's Members see.
- **Shared information**: channels every Doctor sees, Guests included.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After one restart, every Linked Member on the server holds the Doctor Role and no other Member does.
- **SC-002**: A newly Linked Member can use `#alliance-hall` as soon as the Interview says they are Linked, with no Officer
  step.
- **SC-003**: A Guest sees no Home Kingdom channel, and can reach every Doctor by text and voice in the Shared area.
- **SC-004**: A server owner can set up the layout from the guide alone, and check it in under 5 minutes with View Server
  As Role.

## Assumptions

- The role is named `Doctor`, fixed like `Onboarding`.
- The Daily Sync does not touch the Doctor Role: being Linked does not depend on the game, so startup and the Link events
  are enough.
- A Member whose Interview is handed off is not Linked, so they do not hold the role yet.
- "Basic information" means whichever channels the owner opens to Doctors; the guide names examples and Neil does not care.
- Depends on slices 013 (Onboarding Role) and 016 (the channel guide), both on `main`.
