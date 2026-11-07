# Feature Specification: See what Neil can do

**Feature Branch**: `027-see-what-neil-can-do`

**Created**: 2026-11-07

**Status**: Draft

**Input**: Issue [#76](https://github.com/LilSticky/Neil/issues/76). The user: "include a help command that shows commands usage and
purpose".

## Clarifications

### Session 2026-11-07

- Q: Who sees the answer? → A: only the caller, like `/usage`. Assumed: a list posted in a channel helps nobody else.
- Q: Are Officer commands listed? → A: only to an Officer. Assumed: they are already hidden from Members (slice 011).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member sees what they can do (Priority: P1)

A Member runs `/help`. Neil privately lists each command they can use: how to write it, and what it is for.

**Why this priority**: it is the whole slice. Members have no other way to learn the commands from Neil.

**Independent Test**: automated: the `/help` answer for a Member holds every Member command with its options and purpose, and no
Officer command.

**Acceptance Scenarios**:

1. **Given** a Member, **When** they run `/help`, **Then** they get a private answer listing each command they can use, with its
   usage and purpose.
2. **Given** a command with options, **When** it is listed, **Then** required options show as `<name>` and optional ones as `[name]`.
3. **Given** a command with subcommands, **When** it is listed, **Then** each subcommand has its own line.
4. **Given** a Member who is no Officer, **When** they run `/help`, **Then** `/quota`, `/rank` and `/link` are not listed.
5. **Given** an Officer, **When** they run `/help`, **Then** those commands are listed too, marked as Officer commands.
6. **Given** a new command in the command definitions, **When** anyone runs `/help`, **Then** it is listed with no other change.

### Edge Cases

- The reply fails: it is logged and never thrown.
- A list too long for one Discord message: the answer must stay within Discord's limit for an Officer, who sees the most.
- A Guest or a Member who isn't Linked: they see the Member list too. Commands that refuse them say so themselves.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `/help` MUST answer privately, with no mentions.
- **FR-002**: It MUST list every command the caller can use, with its usage and its purpose.
- **FR-003**: It MUST show Officer commands only to an Officer.
- **FR-004**: It MUST build the list from the command definitions, not a second list.
- **FR-005**: It MUST NOT use the Game API or count against a Daily Allowance.
- **FR-006**: `/help` MUST list itself.
- **FR-007**: The guides MUST name `/help` and say where it can be used.

### Key Entities

- **Command**: a slash command as defined for Discord. Not a domain term.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member can find how to use any of their commands from one answer, with no help from an Officer.
- **SC-002**: A command added later appears in `/help` with no change to it.

## Assumptions

- Officer means holding an Officer role, as for `/usage`. An Administrator with no Officer role sees the Member list.
- Commands need registering again after the deploy (`npm run commands:register`).
