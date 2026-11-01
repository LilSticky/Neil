# Feature Specification: Give a member their name and roles

**Feature Branch**: `006-give-a-member-their-name-and-roles` (stacked on `005-interview-a-new-member`)

**Created**: 2026-11-01

**Status**: Draft

**Input**: User description: "Slice 006 'Give a member their name and roles'. When a Member is Linked, Neil sets
their server nickname `[TAG|R5] Nickname | #331` and gives Managed Roles: Alliance (Home Kingdom alliances only),
Alliance Rank R1–R5, Kingdom, Troop Bracket T1–T10. Neil creates a missing Managed Role on first use and never
touches other roles. At startup Neil applies name and roles to every Linked Member that lacks them. Permission and
hierarchy problems are logged, never crash. Every change is logged." Decisions:
[discovery/initial.md](../../documentation/discovery/initial.md) and the user's answers of 2026-11-01.

## Clarifications

### Session 2026-11-01

- Q: Do the roles exist, or does Neil create them? → A: Neil creates a missing Managed Role on first use, named by
  convention: the Alliance tag (`NML`), `R1`–`R5`, `#330`, `T1`–`T10`.
- Q: Which roles? → A: all four kinds: Alliance, Alliance Rank, Kingdom, Troop Bracket.
- Q: Members Linked before this slice ships? → A: at startup Neil applies name and roles to every Linked Member that
  does not have them yet (one lookup each, from the normal quota).
- Q: Dictionary? → A: Managed Role, Home Kingdom, Guest, Troop Bracket approved (2026-11-01).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Linked Member gets their name and roles (Priority: P1)

A Member finishes the Onboarding Interview and is Linked. Right away Neil sets their server nickname from the
Player (`[NML|R4] Rogue`, or `[ABC] Rogue | #331` for a Guest) and gives them the Managed Roles that fit: their
Alliance's role (Home Kingdom only), their Alliance Rank role, their Kingdom's role and their Troop Bracket role.
The log channel shows what was set.

**Why this priority**: names and roles are what the server sees; they are why Members are Linked at all.

**Independent Test**: automated, with a fake Discord: Link a Player in `NML`, R4, Kingdom 330, level 21 → nickname
`[NML|R4] Rogue`, roles `NML`, `R4`, `#330`, `T7`, one log line; no extra Game API request.

**Acceptance Scenarios**:

1. **Given** a Member is Linked to a Home Kingdom Player in an Alliance with rank R1–R3, **When** the Link is made,
   **Then** the nickname is `[TAG] Name` and the Member has the Alliance, rank, Kingdom and Troop Bracket roles.
2. **Given** the Player is R4 or R5, **When** the Link is made, **Then** the nickname is `[TAG|R4] Name` (or `R5`).
3. **Given** the Player is a Guest's (not in the Home Kingdom), **When** the Link is made, **Then** the nickname
   ends with ` | #<kingdom>`, the Member gets the Kingdom and Troop Bracket roles, and no Alliance or Alliance Rank
   role.
4. **Given** the Player is in no Alliance, **When** the Link is made, **Then** the nickname is the Player Name
   (plus ` | #<kingdom>` for a Guest) and only the Kingdom and Troop Bracket roles are given.
5. **Given** the Alliance Rank is unknown, **When** the Link is made, **Then** no rank role is given and the
   nickname has no rank; **When** the Rank Approval is given later, **Then** the rank role is given and, for R4/R5,
   the nickname gains the rank.
6. **Given** the nickname would be longer than 32 characters, **When** it is set, **Then** the Player Name is cut so
   that the tag, rank and kingdom stay whole.
7. **Given** a Managed Role does not exist yet, **When** Neil needs it, **Then** Neil creates it (no permissions, not
   shown separately, not mentionable) and logs that it did.
8. **Given** the Member already holds Managed Roles that no longer fit (e.g. an old Troop Bracket), **When** Neil
   applies, **Then** those are removed; roles that are not Managed Roles are never touched.

---

### User Story 2 - Members Linked earlier get their name and roles at startup (Priority: P2)

When Neil starts, it finds every Linked Member on the server whose name and roles it has not applied yet (Members
Linked before this slice, or whose apply failed) and applies them, looking each Player up once.

**Why this priority**: Members Linked during the test run (slice 005) would otherwise wait for "Keep roles in sync".

**Independent Test**: automated: two stored Links without an apply record, Neil starts → two lookups, both Members
named and given roles; a third with a record is skipped.

**Acceptance Scenarios**:

1. **Given** Linked Members without applied names and roles, **When** Neil starts, **Then** each is looked up once
   (normal lookup quota, never the Quota Reserve) and gets name and roles.
2. **Given** the lookup quota is used up before all are done, **When** Neil stops for the quota, **Then** the rest
   wait for the next start (or the next apply), and the log says how many are left.
3. **Given** a Linked Member is no longer on the server, **When** Neil starts, **Then** they are skipped without a
   lookup.
4. **Given** a Player is not found any more, **When** Neil starts, **Then** that Member is logged and left as is.

---

### User Story 3 - Neil cannot rename or give a role (Priority: P2)

Discord does not let Neil change the server owner's nickname, or change Members or roles above Neil's own highest
role, or act at all without the Manage Nicknames and Manage Roles permissions. Neil does what it can and tells the
Officers what it could not.

**Why this priority**: role hierarchy mistakes are common on a new server; a crash or silent failure would hide them.

**Independent Test**: automated: fake Discord refuses the nickname of the owner and one role above Neil → the other
roles are given, two log lines name what failed and why; Neil keeps running.

**Acceptance Scenarios**:

1. **Given** the Member is the server owner or ranks above Neil, **When** Neil applies, **Then** the nickname (and
   roles it cannot give) are skipped and the log names the Member, what was skipped and the reason.
2. **Given** Neil lacks Manage Roles or Manage Nicknames at startup, **When** it starts, **Then** it still starts
   (Interviews and lookups work) and the log channel says which permission is missing; applies skip that part.
3. **Given** an existing role has the convention name but grants permissions, **When** Neil would use it, **Then**
   Neil does not give it and logs that the role must lose its permissions (or be renamed) first.

---

### Edge Cases

- The Player has no Player Name in the answer: the nickname is not changed; roles are still given.
- A Player Name with Discord markdown or mentions: the nickname is plain text (Discord does not render it).
- Two Alliances in other Kingdoms share the Home Kingdom Alliance's tag: only Home Kingdom Alliances get a role,
  so the tag stays unique.
- The Alliance changes its tag later: out of scope ("Keep roles in sync"); the old role stays until then.
- The sanctuary level is missing or 0: no Troop Bracket role.
- Neil restarts in the middle of an apply: the apply is repeated at startup (it is idempotent).
- Two Links at the same moment need the same new role: it is created once.
- The Member changed their own nickname after Neil set it: left alone until "Keep roles in sync".
- Discord's limit of 250 roles: creating a role fails, the failure is logged, the rest still applies.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a Link is made, Neil MUST apply the nickname and Managed Roles from the Player Neil already has,
  without another Game API request.
- **FR-002**: The nickname MUST be `[TAG|Rn] Name | #K`: `[TAG]` when in an Alliance, `|R4`/`|R5` inside the
  brackets only for those ranks, ` | #K` only for Guests; at most 32 characters, cutting only the Player Name.
- **FR-003**: Neil MUST give the Alliance role (named by the tag) only for Alliances in the Home Kingdom.
- **FR-004**: Neil MUST give the Alliance Rank role `R1`–`R5` only when the rank is known (Game API or Rank
  Approval) and the Player is in a Home Kingdom Alliance; a Rank Approval MUST trigger a new apply.
- **FR-005**: Neil MUST give every Linked Member the role of their Kingdom, named `#<kingdom>`.
- **FR-006**: Neil MUST give the Troop Bracket role `T1`–`T10` from the sanctuary level using a configurable level
  table (default: 1, 3, 6, 10, 14, 17, 20, 24, 27, 30 as the first level of T1…T10).
- **FR-007**: Neil MUST create a missing Managed Role on first use with no permissions, not hoisted and not
  mentionable; it MUST use an existing role of the same name only if that role grants no permissions.
- **FR-008**: An apply MUST leave the Member with exactly the Managed Roles that fit and MUST NOT add or remove any
  other role.
- **FR-009**: At startup Neil MUST apply to every Linked Member on the server without a successful apply record, one
  lookup each with the lookup purpose (stopping at the Quota Reserve); the rest wait for the next start.
- **FR-010**: Neil MUST record per Link what it last applied and when; a failed or partial apply is not successful.
- **FR-011**: Missing permissions, role hierarchy and the server owner MUST NOT stop Neil; each skipped part MUST be
  logged with the Member and the reason.
- **FR-012**: Every apply that changes something MUST be logged in the log channel (Member, nickname, roles added
  and removed); a role Neil creates MUST be logged.
- **FR-013**: The Home Kingdom MUST be configuration (`HOME_KINGDOM`, required), checked at startup.
- **FR-014**: This slice MUST NOT re-sync Members whose Player changed, unlink, or clean up on leaving ("Keep roles
  in sync", "Correct a link", "Say goodbye" are Later).

### Key Entities

- **Managed Role**: a Discord role of one of four kinds (Alliance, Alliance Rank, Kingdom, Troop Bracket), found by
  its convention name.
- **Applied state** (per Link): the nickname and Managed Roles last applied, when, and whether it fully succeeded.
- **Troop Bracket table**: the first sanctuary level of each tier, from configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member who is Linked has their nickname and roles within 10 seconds, with no extra Game API request.
- **SC-002**: After a start, every Linked Member on the server has name and roles, unless the quota or Discord
  permissions stopped it, and the log says which and why.
- **SC-003**: No role other than a Managed Role is ever added or removed by Neil (verified in automated tests).
- **SC-004**: No permission or hierarchy problem ever stops Neil (verified in automated tests).

## Assumptions

- The Player's sanctuary level is the Game API's `lv` (GAME-API.md), already read by the client.
- Guests get no Alliance Rank role, so a foreign R5 gets no rank power on this server; their rank still shows in the
  nickname only for R4/R5 like everyone's.
- Neil's own role is placed above the Managed Roles by an Officer (server setup, documented in HOSTING.md); roles
  Neil creates appear just below Neil's role.
- The test-server check is a manual step collected in TEST-RUN.md and run later by the user.
