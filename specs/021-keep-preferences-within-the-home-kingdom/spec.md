# Feature Specification: Keep Preferences within the Home Kingdom

**Feature Branch**: `021-keep-preferences-within-the-home-kingdom`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Issue [#64](https://github.com/LilSticky/Neil/issues/64), from slice 019's decision: "in general, everything on
the server should not be shared with the guests, as it includes tactical plans. Guests only in the guest area." Discord
can't express "Italian and `#330`", so a Guest holding a Preference Role would see that channel.

## Clarifications

### Session 2026-11-06

- Q: What happens to the stored Preferences of a Member who stops being in the Home Kingdom? → A: they are kept until the
  Unlink. The Preference Roles come off, and a Member who returns gets them back without answering again.
- Q: When do Guests already holding Preference Roles lose them? → A: at the next Daily Sync. There is no pass at startup.
- Q: What does a Guest see on `/channels`? → A: a private refusal, saying channel choices are for Home Kingdom Members and
  that Guests see the Guest area.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Guest is not offered Preferences (Priority: P1)

A Member Linked to a Player outside the Home Kingdom finishes the Interview. Neil gives them no Preferences message, and
`/channels` tells them privately that channel choices are for Home Kingdom Members.

**Why this priority**: it stops new Guests choosing their way into Home Kingdom channels, which is what lets channels be
gated on Preference Roles at all.

**Independent Test**: automated: a Link to a Player of another Kingdom posts no Preferences message and stores no
Preferences; the same Link in the Home Kingdom posts it as before.

**Acceptance Scenarios**:

1. **Given** an Interview confirming a Player outside the Home Kingdom, **When** the Link is stored, **Then** no Preferences
   message is posted, no Preference is stored, and the thread is deleted, unless a Rank Approval is pending.
2. **Given** an Interview confirming a Player in the Home Kingdom, **When** the Link is stored, **Then** the Preferences
   message is posted as before.
3. **Given** an Officer Link to a Player outside the Home Kingdom, **When** it is stored, **Then** the Member gets no private
   message about `/channels`.
4. **Given** a Guest, **When** they run `/channels`, **Then** they get the private refusal and no Preferences message.

---

### User Story 2 - A Guest holds no Preference Roles (Priority: P1)

Whatever a Guest chose earlier, Neil does not let them keep or gain a Preference Role, so no Preference channel opens to them.

**Why this priority**: the Guests already on the live server hold these roles today, and channels can't be gated until
they are gone.

**Independent Test**: automated: a Daily Sync of a Guest holding Preference Roles takes them all off and logs one line; their
stored Preferences stay.

**Acceptance Scenarios**:

1. **Given** a Guest holding Preference Roles, **When** the Daily Sync reaches them, **Then** every Preference Role comes off,
   the change is logged, and their stored Preferences stay.
2. **Given** a Guest Linked to an R5, **When** the Daily Sync reaches them, **Then** they get no NaP discussions and none is
   stored for them.
3. **Given** a Guest with an old Preferences message, **When** they change a select menu, **Then** they get the private
   refusal, and nothing is stored or given.
4. **Given** a Guest with an open Preferences message, **When** they press Done, **Then** it closes as before.

---

### User Story 3 - A Member who moves Kingdom (Priority: P2)

A Member's Player leaves the Home Kingdom and later returns. Neil follows at the Daily Sync, in both directions.

**Why this priority**: it is rarer than the two above, but without it a Member who leaves keeps seeing tactical channels.

**Independent Test**: automated: a Daily Sync with the Player in another Kingdom takes the roles off; a later one with the
Player back in the Home Kingdom gives the same roles back.

**Acceptance Scenarios**:

1. **Given** a Home Kingdom Member with Preference Roles, **When** the Daily Sync finds their Player in another Kingdom,
   **Then** their Preference Roles come off, the change is logged, and their stored Preferences stay.
2. **Given** a Guest with stored Preferences, **When** the Daily Sync finds their Player in the Home Kingdom, **Then** they get
   the Preference Roles of those Preferences, and the change is logged.
3. **Given** a Member who returned to the Home Kingdom, **When** they run `/channels`, **Then** they see their Preferences as
   they left them.
4. **Given** a Guest, **When** they are Unlinked, **Then** their stored Preferences are forgotten, as for any Member.

### Edge Cases

- A Home Kingdom Member presses the Preferences message before their name and roles have been applied: Neil doesn't yet
  know they are in the Home Kingdom. The choice is saved, no refusal is shown, and the Preference Roles follow with the name
  and roles.
- A Member whose Kingdom Neil doesn't know gets no Preference Roles: Neil gives none until it knows. This fails closed,
  because the channels hold tactical plans.
- A Member changes Kingdom between Daily Syncs: Neil acts on the Kingdom it last applied, so the change can take up to a day,
  as for every other role.
- A Guest's pending Rank Approval keeps the Interview thread, as for any Member. A Guest leader can't open one yet: issue
  [#67](https://github.com/LilSticky/Neil/issues/67), out of scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST NOT post the Preferences message after a Link to a Player outside the Home Kingdom, and MUST NOT store a
  preselected Language for them.
- **FR-002**: Neil MUST NOT send the `/channels` private message after an Officer Link to a Player outside the Home Kingdom.
- **FR-003**: After a Link with no Preferences message and no pending Rank Approval, the Interview thread MUST be deleted.
- **FR-004**: Neil MUST give Preference Roles only to a Member it knows to be in the Home Kingdom, and MUST take every
  Preference Role off anyone else, each time it applies their Preference Roles.
- **FR-005**: Neil MUST NOT store NaP discussions by rank for a Guest.
- **FR-006**: Neil MUST keep a Member's stored Preferences when they become a Guest, until the Unlink.
- **FR-007**: A Member who returns to the Home Kingdom MUST get the Preference Roles of their stored Preferences at the
  Daily Sync, without answering again.
- **FR-008**: A Guest running `/channels` MUST get a private refusal: channel choices are for Home Kingdom Members, and Guests
  see the Guest area.
- **FR-009**: A Guest changing a select menu on a Preferences message MUST get the same refusal, and nothing is stored or given.
  Done MUST still close the message.
- **FR-010**: Every change of Preference Roles under this slice MUST be logged to the log channel, as today.
- **FR-011**: The Guests already holding Preference Roles MUST lose them at the next Daily Sync, with no separate pass at
  startup and no extra Game API calls.
- **FR-012**: The notes naming issue #64 as a limit MUST be removed from SERVER-SETUP.md, STARTUP-GUIDE.md and
  MIGRATION-GUIDE.md.

### Key Entities

- **Guest**: a Member whose Linked Player is not in the Home Kingdom.
- **Preference** and **Preference Role**: as in the dictionary, now limited to Home Kingdom Members.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One Daily Sync after the deploy, no Guest holds a Preference Role.
- **SC-002**: No new Guest receives a Preferences message or the `/channels` note.
- **SC-003**: A Member who leaves and returns to the Home Kingdom holds the same Preference Roles as before, without
  answering a single question again.
- **SC-004**: The Game API calls of a Daily Sync don't rise.

## Assumptions

- Slice 016's Preferences, slice 017's Doctor Role and the Daily Sync work as merged.
- Whether Preferences are visible once `#onboarding` is hidden is separate: issue
  [#66](https://github.com/LilSticky/Neil/issues/66).
- Channel permissions stay the user's work ([MIGRATION-GUIDE.md](../../documentation/MIGRATION-GUIDE.md)); this slice changes
  no channel.
