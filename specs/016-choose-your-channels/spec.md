# Feature Specification: Choose your channels

**Feature Branch**: `016-choose-your-channels`

**Created**: 2026-11-04

**Status**: Draft

**Input**: User: "Include a few optional steps in the interview, like finding out the Member's interest, goal or
languages to assign them to the right channels and roles. This is supposed to also reduce visual noise, i.e. not
showing the Italian auto-translated channel to someone not speaking Italian." Issue
[#42](https://github.com/LilSticky/Neil/issues/42).

## Decisions so far

### Session 2026-11-04 (before the spec)

- Built into Neil's Onboarding Interview, not Discord's own Server Onboarding questions.
- The questions come **after the Link**, in the same Interview thread; each one can be skipped. A command lets a
  Member change their answers later.
- Languages: several allowed, from every game Language; the Language the Player set in the game comes preselected.
- Region: broad regions (Americas, Europe/Africa, Asia/Oceania).
- Interests: PvP/wars, Events, Trading/economy, Off-topic/social, and NaP discussions. NaP discussions are offered only
  to R4s; R5s get it automatically; others are not offered it and see only the NaP publications.
- Experience: New / Intermediate / Veteran. Veterans are invited to write guides in the guides forum; New players are
  pointed to those guides.

### Clarifications 2026-11-04

- Q: Are R1–R3 offered NaP discussions? → A: no; only R4 (opt in) and R5 (automatic).
- Q: What happens to Preferences at Unlink? → A: the Preference Roles are removed and the Preferences forgotten.
- Q: Term names? → A: Preference, Preference Role, NaP discussions (approved; added to DICTIONARY.md).
- Q: Command name? → A: `/channels`.

### Terms

- **Preference**: one optional answer a Member gives about themselves (a Language, a Region, an
  Interest or an Experience level), which decides which channels they see.
- **Preference Role**: the Discord role Neil gives for one Preference (for example `Italian`, `Europe/Africa`,
  `PvP`, `Veteran`). Neil creates it without permissions; channel permissions are set by hand.
- **NaP discussions**: the Interest for talking about non-aggression pacts (NaP) between Alliances; limited
  to R4s and R5s.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick languages after the Link (Priority: P1)

Right after a Member is Linked in the Onboarding Interview, Neil asks in the same thread which languages they speak. The
Language their Player has set in the game is already ticked. The Member confirms, changes the selection, or skips. Neil
gives the Preference Roles for the chosen Languages, so only those auto-translated channels show up for them.

**Why this priority**: it is the example in the request and removes the most noise (one channel per language).

**Independent Test**: automated: Link → language question with the game Language preselected → choosing Italian and
English gives exactly those two Preference Roles; skipping gives none.

**Acceptance Scenarios**:

1. **Given** a Member was just Linked and their Player's Language is Italian, **When** Neil asks the language question,
   **Then** Italian is preselected.
2. **Given** the language question, **When** the Member picks Italian and English, **Then** they get those two Preference
   Roles and no other language role.
3. **Given** the language question, **When** the Member skips it, **Then** they get no language role and Neil moves on.
4. **Given** the Player has no Language set, **When** Neil asks, **Then** nothing is preselected.

---

### User Story 2 - Pick region, interests and experience (Priority: P1)

After the languages, Neil asks for the Member's Region (one), Interests (several) and Experience (one), each skippable.
Each answer gives the matching Preference Role. A Veteran gets an invitation to write guides in the guides forum; a New player
gets a pointer to those guides.

**Why this priority**: completes the request; Region and Interests also cut noise, Experience connects new and experienced
players.

**Independent Test**: automated: answers Europe/Africa, PvP + Events, Veteran → those four Preference Roles and the guide
invitation; New → the pointer to the guides.

**Acceptance Scenarios**:

1. **Given** the Region question, **When** the Member picks Europe/Africa, **Then** they get that Preference Role only.
2. **Given** the Interests question, **When** the Member picks PvP/wars and Events, **Then** they get both Preference Roles.
3. **Given** the Experience question, **When** the Member picks Veteran, **Then** they get the Veteran Preference Role and an
   invitation to write guides in the guides forum.
4. **Given** the Experience question, **When** the Member picks New, **Then** they get the New Preference Role and a pointer to
   the guides forum.
5. **Given** any question, **When** the Member skips it, **Then** Neil asks the next one; after the last, the Interview
   ends.

---

### User Story 3 - NaP discussions only for R4s and R5s (Priority: P1)

The Interests question offers NaP discussions only to a Member whose Linked Player is an R4. A Member Linked to an R5 gets
the NaP discussions Preference Role automatically at Link, without being asked. Everyone else is not offered it.

**Why this priority**: NaP talks are between alliance leaders; giving the role to the wrong Member leaks them.

**Independent Test**: automated: R4 sees the option; R5 gets the role without picking it; R1–R3, unknown rank and no
Alliance do not see the option; a rank change in the Daily Sync takes the role away from someone no longer R4/R5.

**Acceptance Scenarios**:

1. **Given** a Member Linked to an R4, **When** Neil asks for Interests, **Then** NaP discussions is one of the options.
2. **Given** a Member Linked to an R5, **When** the Link is made, **Then** they get the NaP discussions Preference Role, and the
   Interests question does not list it.
3. **Given** a Member Linked to an R1–R3, to a Player with unknown rank or without Alliance, **When** Neil asks for
   Interests, **Then** NaP discussions is not offered.
4. **Given** a Member holds the NaP discussions Preference Role, **When** the Daily Sync or a Rank Approval sees they are no
   longer R4 or R5, **Then** the role is removed; an R5 who becomes R4 keeps it.
5. **Given** a Member becomes R5, **When** the Daily Sync or a Rank Approval sees it, **Then** they get the role.

---

### User Story 4 - Change choices later (Priority: P2)

A Linked Member runs `/channels` to see their current Preferences and change any of them, with the same questions and
rules as in the Interview (their current answers preselected).

**Why this priority**: people learn languages, move or lose interest; without it only Officers could fix roles.

**Independent Test**: automated: a Linked Member with Italian changes to English → Italian role removed, English role
given; a Member who is not Linked is told to finish onboarding first.

**Acceptance Scenarios**:

1. **Given** a Linked Member, **When** they run the command, **Then** they see the questions with their current choices
   preselected, privately.
2. **Given** they deselect Italian and select English, **When** they confirm, **Then** the Italian Preference Role is removed and
   the English one given.
3. **Given** a Member who is not Linked, **When** they run the command, **Then** Neil tells them to finish onboarding first
   and changes nothing.

---

### Edge Cases

- The Member stops answering: after the Interview's usual idle time the remaining questions count as skipped; the choices
  made so far stay, and the thread is deleted as in slice 013.
- The Link has a pending Rank Approval: the questions are asked anyway; the NaP rule uses the rank once it is known.
- Officer Link (no Interview questions): Neil tells the Member about the command instead, in a private message if
  Discord allows it.
- Unlink: Neil removes all Preference Roles with the Managed Roles, and forgets the Preferences.
- Neil cannot give a Preference Role (missing permission, role above Neil's): it logs it and carries on.
- A role named like a Preference Role has permissions: Neil refuses it, as for Managed Roles (ADR 8).
- The Member answers by hand on Discord (an Officer gives a Preference Role by hand): Neil leaves it, except NaP discussions,
  which the Daily Sync still checks against the rank.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: After an Interview Link, Neil MUST ask in the same thread, one after another: Languages (several), Region
  (one), Interests (several), Experience (one); each MUST be skippable.
- **FR-002**: The Languages question MUST offer every game Language, with the Player's game Language preselected; it MUST
  NOT make an extra Game API request.
- **FR-003**: For each chosen answer Neil MUST give its Preference Role, and MUST remove Preference Roles of the same question that
  are no longer chosen.
- **FR-004**: Neil MUST create a missing Preference Role without permissions on first use and MUST refuse a role of that name
  that has permissions.
- **FR-005**: NaP discussions MUST be offered only to Members Linked to an R4, MUST be given automatically to Members Linked
  to an R5, and MUST be removed when the Member is no longer R4 or R5 (Daily Sync, Rank Approval, Unlink).
- **FR-006**: Picking Veteran MUST bring an invitation to write guides in the guides forum; picking New MUST bring a pointer
  to the guides forum.
- **FR-007**: A Linked Member MUST be able to see and change their Preferences later with `/channels`, privately.
- **FR-008**: Unlink MUST remove every Preference Role and forget the Preferences.
- **FR-009**: The Interview thread MUST be deleted (slice 013) only after the last question is answered, skipped or timed
  out, or as before while a Rank Approval is pending.
- **FR-010**: A failed role change MUST be logged and MUST NOT stop the Interview or the command.
- **FR-011**: Neil MUST NOT change channel permissions; HOSTING.md MUST describe which Preference Role sees which channels.

### Key Entities

- **Preference**: a Member's answer to one optional question; stored per Linked Member.
- **Preference Role**: the Discord role for one Preference. Not a Managed Role.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member who chooses only English sees no other language's auto-translated channel (manual check).
- **SC-002**: The optional questions add at most 4 interactions after the Link, and skipping all of them takes one click
  each (automated tests).
- **SC-003**: No Member who is not R4 or R5 holds the NaP discussions Preference Role after the next Daily Sync (automated
  test).

## Assumptions

- Region answers: Americas, Europe/Africa, Asia/Oceania. Experience answers: New, Intermediate, Veteran. Intermediate gets
  only its Preference Role.
- Preference Role names are the answer names (e.g. `Italian`, `PvP`); the guides forum is set by configuration.
- The NaP publications channel is visible to every Linked Member by its channel permissions, so it needs no Preference Role.
- Preference Roles do not use the Game API and do not change nicknames.
- Members Linked before this slice get no questions; they can use the command.
- The manual check is collected in TEST-RUN.md and run later by the user.
