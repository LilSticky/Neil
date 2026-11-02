# Feature Specification: Correct a link

**Feature Branch**: `011-correct-a-link` (stacked on `010-say-goodbye`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: ROADMAP Later: "Correct a link: Officers relink, unlink or override a Member; a Member asks for a re-check."
Scope decided in [discovery/011-correct-a-link.md](../../documentation/discovery/011-correct-a-link.md) §5.

## Clarifications

### Session 2026-11-02 (discovery)

- Q: An Officer Unlinks a Member who is still on the server: name and roles? → A: Neil removes the Managed Roles and
  the nickname it set and tells the Member privately; no Interview starts by itself, the Member may run `/interview`.
- Q: May an Officer Link by hand? → A: only for a Member whose Onboarding Interview was handed off (Officer Link),
  without In-game Proof, logged with the Officer.
- Q: "Override a Member"? → A: an Officer gives a Rank Approval at any time; the Daily Sync keeps it while the Game
  API has no rank, a Game API rank still replaces it. "Override" is not a dictionary term.
- Q: Member re-check? → A: cut; the Daily Sync covers it.
- Q: May a Member end their own Link? → A: yes, with a command; then they may run `/interview`.
- Q: Dictionary? → A: Officer Link added; Link, Unlink and Rank Approval amended (approved 2026-11-02).

### Session 2026-11-02 (clarify)

- Q: An Officer gives a rank the game already lists differently? → A: store and apply it anyway; the next Daily Sync
  replaces it with the game's rank, and the Officer is told so.
- Q: Confirmation before an Unlink? → A: none; Officer Unlinks and self-Unlinks happen at once.
- Q: Which budget does an Officer Link's lookup use? → A: the Quota Reserve, like Interview lookups.
- Q: May an Officer give a reason for an Unlink? → A: no.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An Officer Unlinks a Member (Priority: P1)

A Member was Linked to the wrong Player, holds someone else's uid, or their Player can no longer be found. An Officer
Unlinks them with a command naming the Member. Neil ends the Link at once, removes the Managed
Roles it gave the Member and the nickname it set, hands Rank Approvals waiting on the Member to the Officers, posts one
log line naming the Officer, and sends the Member a private message that their Link was ended by an Officer and that
they can run `/interview` to be Linked again.

**Why this priority**: it is the remedy slices 005 and 009 point to (a wrong Link, a disputed uid, a Player no longer
found), and the base of every other correction.

**Independent Test**: automated: an Officer Unlinks a Linked Member → no Link for them or their uid, Managed Roles
removed, Neil's nickname cleared, one log line with the Officer, one private message attempted; a second Member can
then be Linked to that uid.

**Acceptance Scenarios**:

1. **Given** a Linked Member on the server, **When** an Officer Unlinks them, **Then** the Link ends, the
   uid is free, the Managed Roles Neil gave them are removed and the nickname Neil set is cleared.
2. **Given** the Unlink, **Then** one log line names the Member, the uid, the nickname Neil had given them and the
   Officer; **and** Neil tries one private message to the Member; a refusal changes nothing else.
3. **Given** pending Rank Approvals waiting on the Unlinked Member as approver, **Then** they go to the Officers (as in
   slice 010); **given** a pending Rank Approval on the Unlinked Member's own Link, **Then** it is cancelled with a
   message in its thread.
4. **Given** a Member without a Link, **When** an Officer tries to Unlink them, **Then** only the Officer sees "not
   Linked" and nothing changes.
5. **Given** a Member who is not an Officer, **When** they try to Unlink another Member, **Then** only they see that
   only Officers may do that, and nothing changes.
6. **Given** the Member has since changed the nickname themselves, **Then** Neil leaves that nickname alone (it only
   clears a nickname it set).

---

### User Story 2 - A Member Unlinks themselves (Priority: P2)

A Member switched their main account or Linked the wrong Player. They Unlink themselves with a command; it happens at
once. The effects are the same as an Officer's Unlink; the log line says the Member did it themselves; the
Member sees the result privately in the reply (no extra private message) and is told they can run `/interview`.

**Why this priority**: saves an Officer's time for a rare but real case; builds on US1.

**Independent Test**: automated: a Linked Member Unlinks themselves → Link ended, roles and nickname removed, one log
line "by themselves", private reply mentions `/interview`; a following `/interview` starts a new Onboarding Interview.

**Acceptance Scenarios**:

1. **Given** a Linked Member, **When** they Unlink themselves, **Then** the same effects as US1 AS1 and AS3
   happen, and the log line says the Member Unlinked themselves.
2. **Given** a Member without a Link, **When** they try, **Then** only they see "not Linked".
3. **Given** a Member Unlinked themselves, **When** they run `/interview`, **Then** a new Onboarding Interview starts.

---

### User Story 3 - An Officer gives a Rank Approval at any time (Priority: P2)

A Linked Player's rank is wrong or missing: an earlier Rank Approval was wrong, the Player moved Alliance and the
Game API lists no rank there (slice 009 then asks Officers to check), or the game is behind. An Officer gives the Member's Alliance Rank
(R1–R5) with a command. Neil stores it on the Link as a Rank Approval by that Officer, replaces any earlier approved
rank, re-applies the nickname and Managed Roles, and posts one log line. The Daily Sync keeps it while the Player stays
in that Alliance with no rank in the Game API (slice 009 FR-004).

**Why this priority**: fixes the gap slice 009 leaves (no new Rank Approval after an Alliance move) and wrong approvals.

**Independent Test**: automated: Linked Member with unknown rank, an Officer gives R4 → Link carries R4 approved by that
Officer, rank role and nickname updated, one log line; a following Daily Sync with the rank still unknown keeps R4, one
with R3 in the Game API uses R3; an Officer giving R2 while the game lists R3 → R2 applied now, R3 after the next sync.

**Acceptance Scenarios**:

1. **Given** a Linked Player in an Alliance, **When** an Officer gives a rank, **Then** it is stored as a Rank Approval by that Officer, any earlier approved rank is
   replaced, name and roles are re-applied, and one log line names Member, rank and Officer.
2. **Given** a pending Rank Approval on that Link, **When** the Officer gives a rank, **Then** that Rank Approval is
   settled with the Officer's rank (approved by that Officer) and its thread says so.
3. **Given** the Game API lists a different rank for the Player (as Neil last saw it), **When** an Officer gives a
   rank, **Then** it is stored and applied as in AS1, and only the Officer sees that the game lists rank X, which the
   next Daily Sync will use.
4. **Given** the Player is in no Alliance, **When** an Officer gives a rank, **Then** only the Officer sees that a rank
   needs an Alliance; nothing changes.
5. **Given** the Officer names their own Linked Member, **Then** they are refused (never by the Linked Member
   themselves).
6. **Given** a Member without a Link, or a caller who is not an Officer, **Then** they are refused and nothing changes.

---

### User Story 4 - An Officer Links a handed-off Member (Priority: P3)

A Member failed In-game Proof five times and their Onboarding Interview was handed off to the Officers. An Officer who
has checked the Member's account in another way makes an Officer Link with a command naming the Member and a uid. Neil
looks the Player up, shows the Officer the Player privately for confirmation, then Links them exactly as an Interview
would (nickname, Managed Roles, Rank Approval if the rank is unknown), ends the handed-off Interview as Linked with a
message in its thread, and posts one log line marking it as an Officer Link with the Officer.

**Why this priority**: helps the few Members who cannot pass In-game Proof; it is the rarest case and bypasses proof,
so it comes last.

**Independent Test**: automated: handed-off Interview, an Officer Links uid U and confirms → Link exists marked as an
Officer Link with the Officer, Interview ended as Linked, one log line; same for a Member whose Interview is not handed
off → refused.

**Acceptance Scenarios**:

1. **Given** a Member whose latest Onboarding Interview is handed off, **When** an Officer gives their Member and a uid
   and confirms the Player shown, **Then** the Member is Linked to that Player as an Officer Link, name and roles are
   applied as for any Link, the Interview ends as Linked with a thread message, and one log line names Member, uid,
   Player and Officer.
2. **Given** the Member's latest Interview is not handed off (running, Linked, abandoned, or none), **When** an Officer
   tries, **Then** only the Officer sees that an Officer Link needs a handed-off Interview; nothing changes.
3. **Given** the uid is already Linked to another Member, **Then** the Officer is refused ("already Linked to …") and
   may Unlink that Member first (US1).
4. **Given** no Player has that uid, or the Game API cannot be reached or the Daily Quota is spent, **Then** the Officer
   sees why and nothing changes.
5. **Given** the Officer names themselves, or the caller is not an Officer, **Then** they are refused.
6. **Given** the Player's rank is unknown in the Game API, **Then** a Rank Approval starts as for any Link; the
   Officer may also settle it at once (US3).

### Edge Cases

- The Member is no longer on the server: an Unlink finds no Link (slice 010 did it) and the Officer sees "not
  Linked"; an Officer Link is refused (Member not on the server), also when they left before the Officer confirmed.
- Neil cannot remove a role or clear the nickname (role above Neil's, server owner): the Unlink still happens; the log
  line says what could not be removed.
- The log channel cannot be posted to: the correction still happens; the failure is logged to the console.
- Two Officers act on the same Member at once: the second finds the state changed (no Link, Link exists, rank already
  approved) and is refused or simply replaces the rank; no Link is ever duplicated.
- The Interview thread is gone when an Officer Link ends it: the Link still happens.
- An Officer-Unlinked Member is still on the server and runs `/interview`: a new Onboarding Interview starts (the
  handed-off one, if any, stays ended).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An Officer MUST be able to Unlink any Linked Member on the server; a Member MUST be able to Unlink
  themselves; both happen at once, without a confirmation and without a reason.
- **FR-002**: An Unlink of a Member on the server MUST end the Link, remove the Managed Roles Neil gave them, clear the
  nickname only if it is still the one Neil set, forget the applied state, cancel a pending Rank Approval on their own
  Link and hand Rank Approvals waiting on them to the Officers (slice 010 FR-004).
- **FR-003**: Every Unlink MUST post one log line naming the Member, the uid, Neil's nickname and who Unlinked (an
  Officer, the Member themselves, or a leave).
- **FR-004**: An Officer's Unlink MUST try one private message to the Member mentioning `/interview`; a refusal MUST NOT
  fail the Unlink. A Member's own Unlink answers in the private reply.
- **FR-005**: No Interview MUST start because of an Unlink.
- **FR-006**: An Officer MUST be able to give a Rank Approval (R1–R5) for a Linked Player in an Alliance; it MUST
  replace any earlier approved rank, settle a pending Rank Approval on that Link, and re-apply name and roles. When the
  Game API (as Neil last saw it) lists a different rank, the Officer MUST be told the next Daily Sync uses the game's
  rank. It MUST be refused on the Officer's own Link or without an Alliance.
- **FR-007**: An Officer MUST be able to make an Officer Link only for a Member whose latest Onboarding Interview is
  handed off, from a uid, after confirming the Player shown; never for themselves.
- **FR-008**: An Officer Link MUST keep the Link rules (one per Member, one per Player), apply name, roles and a Rank
  Approval exactly as a Link from an Interview, end the handed-off Interview as Linked, and be stored and logged as an
  Officer Link with the Officer.
- **FR-009**: Only Officers MAY Unlink another Member, give a Rank Approval this way, or make an Officer Link; every
  refusal MUST be visible only to the caller.
- **FR-010**: Unlinks MUST NOT use the Game API. A Rank Approval given this way re-applies name and roles like any Rank
  Approval (slice 006): at most one lookup from the lookup share. An Officer Link MUST use at most one Game API request
  through the rate-limited, caching client, from the Quota Reserve (it finishes an Interview).
- **FR-011**: Slice 005 FR-008 ("Officers MUST NOT be able to Link a Member by hand") is narrowed: allowed as an Officer
  Link after a hand-off.

### Key Entities

- **Link**: gains how it was made (In-game Proof or Officer Link, with the Officer).
- **Rank Approval**: may be given by an Officer at any time; stored with the approver.
- **Unlink**: gains who did it (a leave, an Officer, the Member).
- **Onboarding Interview**: a handed-off Interview may end as Linked through an Officer Link.

## Success Criteria *(mandatory)*

- **SC-001**: After an Officer or the Member Unlinks, the uid can be Linked by another Member at once, and the Member
  holds no Managed Role from Neil (automated tests).
- **SC-002**: Every correction (Unlink, Rank Approval by an Officer, Officer Link) appears as exactly one log line naming
  who made it (automated tests).
- **SC-003**: No Member can make an Officer Link or give their own Rank Approval (automated tests).
- **SC-004**: A rank given by an Officer survives the next Daily Sync while the Game API lists no rank (automated test).

## Assumptions

- Commands: `/unlink` (no option: yourself; `member`: an Officer Unlinks that Member), `/rank member rank` and
  `/link member uid` for Officers; final names are settled in the plan. `npm run commands:register` is needed again.
- "Officer" is the existing check (Moderator or King role).
- "The game lists rank X" is judged from what Neil last saw (stored Link and applied state); no Game API request is
  made for it.
- Only the Officer Link shows a confirmation (the Player found for the uid, private buttons that expire after a few
  minutes), so a mistyped uid is caught.
- The manual check is collected in TEST-RUN.md and run later by the user.
