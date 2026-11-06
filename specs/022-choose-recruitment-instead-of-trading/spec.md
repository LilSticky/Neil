# Feature Specification: Choose Recruitment instead of Trading

**Feature Branch**: `022-choose-recruitment-instead-of-trading`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Issue [#65](https://github.com/LilSticky/Neil/issues/65), from slice 019's discovery: "Trading: dropped as a topic.
Recruitment takes its place, with one text channel."

## Clarifications

### Session 2026-11-06

- Q: What happens to Members who already chose Trading? → A: nobody holds the role yet, so there is nothing to carry over.
- Q: How does the Trading role go away? → A: the user deletes it by hand in Discord; Neil stops knowing it.
- Q: What does Recruitment mean? → A: the Interest for talking about recruiting Players to the Kingdom's Alliances. It shows
  the Recruitment channel and is offered to every Home Kingdom Member.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member chooses Recruitment (Priority: P1)

A Home Kingdom Member opens the Preferences message, or `/channels`, and finds Recruitment among the Interests where Trading
used to be. Choosing it gives them the Recruitment role, which shows the Recruitment channel.

**Why this priority**: it is the whole slice: the Server Layout's Recruitment channel can't be gated on its own role without it.

**Independent Test**: automated: the Interests offered hold Recruitment and not Trading; choosing Recruitment stores it and
gives the `Recruitment` role.

**Acceptance Scenarios**:

1. **Given** a Home Kingdom Member of any rank, **When** the Interests menu is shown, **Then** it offers Recruitment and not
   Trading.
2. **Given** a Home Kingdom Member, **When** they choose Recruitment, **Then** it is stored and they get the `Recruitment` role.
3. **Given** a Member holding `Recruitment`, **When** they clear it, **Then** the role comes off, as for any Interest.
4. **Given** a Guest, **When** they try to choose Recruitment, **Then** they get slice 021's refusal, as for any Interest.

### Edge Cases

- An old open Preferences message still offers Trading: pressing it stores nothing for Trading, because only the Interests
  offered now are accepted.
- A stored Trading answer (none on the live server, perhaps one in a local `neil.db`): it is dropped when read and reported
  once, as for any unknown stored answer. No migration.
- A Member still holding the `Trading` role: Neil no longer touches it. Deleting the role removes it from everyone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Interests MUST offer Recruitment in the place of Trading, to every Home Kingdom Member.
- **FR-002**: Choosing Recruitment MUST give the Preference Role `Recruitment`, created on first use like any Preference Role.
- **FR-003**: Neil MUST NOT offer, store or give Trading any more.
- **FR-004**: The guides MUST name `Recruitment` instead of `Trading`, say how to delete the `Trading` role, and lose the
  note naming issue #65 as a limit.

### Key Entities

- **Recruitment**: as in the dictionary: an Interest and its Preference Role.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member can choose Recruitment and see the Recruitment channel with no help from an Officer.
- **SC-002**: No Member is offered Trading after the deploy.

## Assumptions

- Nobody holds `Trading` on the live server, so no stored choice needs converting (the user's word).
- Slice 016's Preferences and slice 021's Guest rules work as merged.
- The Recruitment channel and its permissions stay the user's work ([MIGRATION-GUIDE.md](../../documentation/MIGRATION-GUIDE.md)).
