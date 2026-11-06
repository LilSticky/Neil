# Feature Specification: Keep the thread until it closes

**Feature Branch**: `024-keep-the-thread-until-it-closes`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Issue [#66](https://github.com/LilSticky/Neil/issues/66), from slice 019: at the Link the Onboarding Role comes off and
the Preferences message is posted in the Interview thread. With `#onboarding` hidden from everyone else, the Member may no longer
see that thread.

## Clarifications

### Session 2026-11-06

- Q: Test on Discord first, as the issue says? → A: no. Neil isn't live and the test server is empty, so make the change without
  worrying about backwards compatibility until the user announces the release.
- Q: Should the Preferences message move out of the thread, to a private `/channels` note? → A: no. That was built and dropped. The
  user: "make sure the interview is complete or timed out before closing it, even after the link is done". Preferences stay in
  the thread, which closes on Done or at the timeout. Guests still close at the Link, since they get no Preferences.
- Q: How does the Member keep sight of the thread? → A: the Onboarding Role comes off when the thread closes, not at the Link. The
  Member holds the Doctor Role and the Onboarding Role together until then.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member finishes their Preferences in the thread (Priority: P1)

A Home Kingdom Member confirms their Player. They get the Doctor Role and their roles at once, keep the Onboarding Role, and still
see the thread with the Preferences message. When they press Done, or the thread times out, it closes and the Onboarding Role
comes off.

**Why this priority**: it is the whole slice. A Member who loses sight of the thread can't answer the Preferences message.

**Independent Test**: automated: after an Interview Link with the Preferences message posted, the Member holds both roles; Done
takes the Onboarding Role off and deletes the thread.

**Acceptance Scenarios**:

1. **Given** a Home Kingdom Member, **When** the Link is made in the Interview and the Preferences message is posted, **Then** the
   Doctor Role is given and the Onboarding Role stays.
2. **Given** that open thread, **When** the Member presses Done, **Then** the Onboarding Role comes off and the thread is deleted.
3. **Given** that open thread, **When** it times out, **Then** the Onboarding Role comes off and the thread is deleted.
4. **Given** a Guest, or a Link whose Preferences message could not be posted, with no Rank Approval pending, **When** the Link is
   made, **Then** the Onboarding Role comes off and the thread is deleted at once.
5. **Given** a Link with a Rank Approval pending, **When** the Member presses Done, **Then** the thread stays and the Onboarding
   Role stays until the Rank Approval ends.
6. **Given** a Rank Approval that ends with no Preferences message open, by the buttons or by `/rank`, **When** the thread is
   deleted, **Then** the Onboarding Role comes off.
7. **Given** an Officer Link, **When** the thread closes, **Then** the Onboarding Role comes off at that moment: at once with no
   Rank Approval pending, otherwise when it ends.
8. **Given** a Linked Member with an open thread, **When** Neil starts, **Then** they keep the Onboarding Role. **Given** a Linked
   Member with no open thread, **Then** it comes off, as before.

### Edge Cases

- A thread that cannot be deleted: the Preferences message stays open, the next sweep retries, and taking the role off again changes
  nothing.
- An Unlink with the thread open: the thread goes and the Member keeps the Onboarding Role, as any Unlinked Member does.
- A Member who leaves with the thread open: nothing changes; the role goes with them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST keep the Onboarding Role on a Linked Member while their Interview thread stays open.
- **FR-002**: Neil MUST take the Onboarding Role off whenever a Linked Member's Interview thread closes: at the Link, on Done, at the
  timeout, or when a Rank Approval ends.
- **FR-003**: The Doctor Role, name and roles MUST still be given at the Link.
- **FR-004**: The startup sweep MUST leave the Onboarding Role on a Linked Member with an open Preferences message or a pending
  Rank Approval, and otherwise work as before.
- **FR-005**: The dictionary and the guides MUST describe the new timing, and lose the check that asks whether the message is
  still visible.

### Key Entities

- **Onboarding Role**: as in the dictionary, now held until the Interview thread closes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Member can see their Interview thread until it closes.
- **SC-002**: No Linked Member holds the Onboarding Role once their thread has closed, at the latest after the next start of Neil.

## Assumptions

- `#onboarding` is the only thing the Onboarding Role shows, and it denies nothing, so holding it with the Doctor Role is harmless.
- Nothing stored needs carrying over: Neil isn't live (the user's word).
