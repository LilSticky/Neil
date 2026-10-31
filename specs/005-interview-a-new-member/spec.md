# Feature Specification: Interview a new member

**Feature Branch**: `005-interview-a-new-member`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "Slice 005 'Interview a new member'. A Member who joins (or any Member without
a Link, via a command) is walked through giving their uid in a private thread, confirms the Player Neil
found, and gets Linked; an already linked uid is refused; 5 failures hand off to Officers; 24h silence or
leaving abandons; spent Daily Quota pauses until 00:00 UTC; unknown rank goes to Rank Approval (R5's
Linked Member, else Officer); every Link is logged. Interview Game API requests use the Quota Reserve.
Nicknames and roles are slice 006." Domain discovery and the user's decisions:
[discovery.md](discovery.md) (Decisions section, 2026-10-31).

## Clarifications

### Session 2026-10-31 (domain discovery)

- Q: Is the uid enough In-game Proof now that `/alliance` shows uids? → A: yes; every Link is posted to the
  log channel and the Alliance's Linked R5 is told; "Correct a link" (Later) is the remedy.
- Q: Rank Approval in this slice, and by whom? → A: yes; the Member Linked to the Alliance's leader, else an
  Officer.
- Q: Silence or leaving mid-Interview? → A: Abandoned after 24 hours without an answer (configurable) or on
  leaving; the thread is locked and archived, kept for Officers.
- Q: Who else gets an Interview? → A: any Member without a Link can start one with a command.
- Q: Limit on failed uids? → A: 5, then the Interview is handed off to the Officers.
- Q: Daily Quota spent mid-Interview? → A: paused until 00:00 UTC; the pause does not count toward the
  timeout.
- Q: Dictionary? → A: Onboarding Interview, In-game Proof, Link, Rank Approval and "Player identified by its
  uid" approved (2026-10-31).

### Session 2026-10-31

- Q: What can an Officer do with a handed-off Interview? → A: help the Member in the thread; the Member
  starts a new Interview with the command. No manual Link in this slice ("Correct a link", Later).
- Q: How do Officers see private Interview threads? → A: the Moderator and King roles get "Manage Threads"
  in the onboarding channel (server setup, documented); Neil adds only the Member, and adds the approver or
  Officers when it mentions them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new Member gets Linked (Priority: P1)

A Member joins the server. Neil opens a private thread for them in the onboarding channel, greets them,
explains how to find their uid in the game (profile picture in the top left → feather next to the name →
the number below the picture, with a copy button) and asks for it. The Member gives the uid; Neil shows the
Player it found (Player Name, Kingdom, Alliance, Alliance Rank) and asks "Is this you?". The Member confirms
and is Linked; Neil says so in the thread and posts the Link to the log channel.

**Why this priority**: the Link is what every later slice (names, roles, sync) builds on; without it the
Interview has no outcome.

**Independent Test**: in automated tests with a fake Discord and a fake Game API (join → uid → confirm →
Link stored and logged); on the test server, a second account joins and goes through the thread.

**Acceptance Scenarios**:

1. **Given** a Member without a Link joins, **When** Neil sees the join, **Then** it opens a private thread
   in the onboarding channel with only that Member (and Officers, who can read every Interview thread), and
   asks for the uid with the help text.
2. **Given** Neil asked for the uid, **When** the Member gives a whole number, **Then** Neil makes at most
   one Game API request (as an Onboarding Interview, which may use the Quota Reserve) and shows the Player
   found with "That's me" and "That's not me" buttons.
3. **Given** the Player is shown, **When** the Member presses "That's me", **Then** the Member is Linked to
   the Player, the thread says so, the Interview ends, and the log channel gets the Link (Member, Player
   Name, uid, Kingdom, Alliance, Alliance Rank or "rank unknown").
4. **Given** the Player belongs to an Alliance whose leader is Linked to a Member on the server, **When** a
   Link to that Alliance is made, **Then** that Member is told of it (mentioned in the log message).
5. **Given** the Member gives something that is not a whole number, **When** Neil answers, **Then** it asks
   again with the help text, makes no Game API request, and it does not count as a failed attempt.
6. **Given** someone other than the interviewed Member presses a button in the thread, **When** Neil
   answers, **Then** only that person sees a short note that the Interview belongs to someone else, and
   nothing changes.
7. **Given** the Player is in no Alliance, **When** the Member confirms, **Then** they are Linked without
   an Alliance Rank and no Rank Approval is asked for.
8. **Given** Neil restarts during an Interview, **When** it is back, **Then** the Interview continues where
   it stood (the thread, the step and the failed attempts are kept).

---

### User Story 2 - Wrong, taken and unknown uids (Priority: P1)

The Member gives a uid that is already Linked to another Member, belongs to no Player, or shows a Player
that is not them. Neil explains and asks again. After 5 failed attempts it stops asking and hands the
Interview to the Officers.

**Why this priority**: it keeps Links unique and stops an endless loop; part of a safe minimum.

**Independent Test**: in automated tests with a fake Game API (404, "maybe unknown", a Linked uid, "That's
not me", fifth failure).

**Acceptance Scenarios**:

1. **Given** the uid is Linked to another Member, **When** the Member gives it, **Then** Neil refuses with
   an error naming no one, asks again, and counts a failed attempt; the Member who holds the Link is not
   told; the log channel records the refusal.
2. **Given** the Game API knows no Player with the uid (not found, or "maybe unknown"), **When** the Member
   gives it, **Then** Neil says so with the help text again and counts a failed attempt.
3. **Given** the Player is shown, **When** the Member presses "That's not me", **Then** Neil asks for the
   uid again and counts a failed attempt.
4. **Given** two Members give the same uid at the same time, **When** both confirm, **Then** only the first
   confirmation is Linked; the second is refused as already Linked.
5. **Given** 4 failed attempts, **When** a fifth fails, **Then** the Interview is handed off: Neil mentions
   the Officers in the thread, tells the Member an Officer will help and that they can start a new
   Interview with the command, stops asking, and logs it. Officers cannot Link the Member by hand in this
   slice.
6. **Given** the Game API is unavailable (after its retries), **When** the Member gives a uid, **Then** Neil
   asks them to try again shortly and does not count a failed attempt.

---

### User Story 3 - Rank Approval for an unknown rank (Priority: P2)

The Game API lists no Alliance Rank for a newly Linked Player who is in an Alliance. Neil asks the Member
Linked to that Alliance's leader (the R5) in the thread to pick the rank (R1–R5); if there is none, any
Officer may pick it. The rank is stored on the Link with who approved it.

**Why this priority**: needed before slice 006 can give a rank role, but the Link itself already works
without it.

**Independent Test**: in automated tests (leader Linked and on the server, leader not Linked, approver is
the Linked Member themselves, non-approver presses a button).

**Acceptance Scenarios**:

1. **Given** a Link is made with the rank unknown and the Alliance's leader is Linked to a Member on the
   server, **When** the Link is made, **Then** Neil mentions that Member in the thread with R1–R5 buttons.
2. **Given** the leader is not Linked or not on the server, **When** the Link is made, **Then** Neil
   mentions the Officers with R1–R5 buttons.
3. **Given** a Rank Approval is asked for, **When** the approver picks a rank, **Then** the rank is stored
   on the Link with the approver and time, the thread says so, and the log channel records it.
4. **Given** a Rank Approval is asked for, **When** anyone else presses a button (including the Linked
   Member themselves, even if they are an Officer), **Then** only they see a note that they may not approve
   it, and nothing changes.
5. **Given** a Rank Approval is pending, **When** the Linked Member leaves the server, **Then** the Rank
   Approval is cancelled and the buttons stop working.

---

### User Story 4 - Start an Interview, and Interviews that end without a Link (Priority: P2)

A Member without a Link (already on the server, missed while Neil was offline, or whose Interview was
abandoned) runs a command to start their own Interview. An Interview with no answer for 24 hours, or whose
Member leaves, is abandoned: Neil locks and archives the thread.

**Why this priority**: covers everyone already on the server and keeps the onboarding channel tidy; the
join path works without it.

**Independent Test**: in automated tests with a fake clock and fake Discord (command with and without a
Link, with an open Interview, 24 hours of silence, Member leaves).

**Acceptance Scenarios**:

1. **Given** a Member has no Link and no open Interview, **When** they run the start command, **Then**
   Neil opens an Interview as for a join and tells them privately where the thread is.
2. **Given** a Member has an open Interview, **When** they run the start command or rejoin, **Then** no
   second Interview is opened; they are pointed to the open thread.
3. **Given** a Member has a Link, **When** they run the start command or rejoin, **Then** no Interview is
   opened; only they see that they are already Linked (and to which Player).
4. **Given** an Interview waits for the Member, **When** 24 hours (configurable) pass without an answer,
   **Then** it is abandoned: Neil says so in the thread, locks and archives it, and logs it.
5. **Given** an open Interview, **When** the Member leaves the server, **Then** it is abandoned the same
   way.
6. **Given** a handed-off Interview, **When** the Member runs the start command, **Then** they may start a
   new one (the old thread stays as it is).

---

### User Story 5 - The Daily Quota runs out mid-Interview (Priority: P3)

The Daily Quota, including the Quota Reserve, is spent when a Member gives their uid. Neil tells them it
will continue at 00:00 UTC, and at the reset mentions them in the thread and asks for the uid again.

**Why this priority**: rare with the reserve; Interviews still must not fail silently.

**Independent Test**: in automated tests with a fake clock and a spent Daily Quota.

**Acceptance Scenarios**:

1. **Given** the Daily Quota is spent and the uid is not cached, **When** the Member gives it, **Then**
   Neil makes no request, says when it continues (00:00 UTC and the time left), and pauses the Interview;
   no failed attempt is counted.
2. **Given** a paused Interview, **When** 00:00 UTC passes (or Neil starts after it), **Then** Neil
   mentions the Member and asks for the uid again.
3. **Given** a paused Interview, **When** the pause lasts more than 24 hours of silence in total, **Then**
   it is not abandoned; the 24 hours start again when Neil asks again.

### Edge Cases

- A uid with spaces or a leading `#`: trimmed before checking that it is a whole number.
- The Member answers with several messages quickly: only the first answer to the current question counts;
  later ones get "one moment" while a request is in flight.
- The Player found has no Player Name or no Kingdom in the answer: the card shows what is known; the uid is
  always shown.
- The onboarding channel or log channel is missing or Neil lacks permission: Neil refuses to start with a
  clear message (configuration check), or, if lost at runtime, logs an error and the joiner is not left in
  a half-open Interview.
- A Member joins while Neil is offline: no Interview starts by itself; the Member uses the start command
  (Neil does not interview everyone at startup).
- A bot account joins: no Interview.
- The interviewed Member is an Officer: interviewed like anyone; they still cannot approve their own rank.
- The leader's Member and the Linked Member are the same person (the Member is the R5 with an unknown
  rank): an Officer approves instead.
- The uid is cached from a lookup less than 10 minutes ago: the cached Player is used; no request is made.
- Someone writes in the thread who is not the Member: ignored.
- A Member deletes or leaves the thread: treated as silence (timeout applies), not as leaving the server.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a Member without a Link and without an open Interview joins, Neil MUST open an
  Onboarding Interview in a new private thread in the configured onboarding channel; bots are ignored.
- **FR-002**: Any Member without a Link and without an open Interview MUST be able to start their own
  Interview with a command; with a Link or an open Interview, the command MUST say so to them only.
- **FR-003**: Neil MUST ask for the uid with the help text on how to find it in the game, and MUST accept
  only a whole number (after trimming spaces and a leading `#`); anything else is asked again without a
  Game API request and without a failed attempt.
- **FR-004**: Each uid given MUST cost at most one Game API request, made with the Onboarding Interview
  purpose so it may use the Quota Reserve; a cached Player MUST be used when fresh.
- **FR-005**: Neil MUST show the Player found (Player Name, uid, Kingdom, Alliance, Alliance Rank or rank
  unknown) with "That's me" and "That's not me" buttons that only the interviewed Member can use.
- **FR-006**: "That's me" MUST create a Link between the Member and the Player, checking again at that
  moment that neither already has a Link; the Interview then ends as Linked.
- **FR-007**: A uid already Linked to another Member MUST be refused with an error naming no one.
- **FR-008**: "Already Linked", "no such Player" and "That's not me" MUST each count as a failed attempt;
  at the 5th failed attempt the Interview MUST be handed off: Officers mentioned in the thread, the Member
  told, no more questions. Officers MUST NOT be able to Link a Member by hand in this slice.
- **FR-009**: When the Game API is unavailable, Neil MUST ask the Member to try again shortly and MUST NOT
  count a failed attempt.
- **FR-010**: When the Daily Quota is spent, the Interview MUST pause until 00:00 UTC, tell the Member when
  it continues, and at (or after) the reset mention the Member and ask for the uid again.
- **FR-011**: An Interview with no answer from the Member for 24 hours (configurable, not counting a pause)
  or whose Member leaves the server MUST be abandoned: said in the thread, thread locked and archived.
- **FR-012**: When a Link is made with the rank unknown for a Player in an Alliance, Neil MUST ask for a
  Rank Approval in the thread: from the Member Linked to the Alliance's leader if that Member is on the
  server and is not the Linked Member, otherwise from the Officers, with R1–R5 buttons.
- **FR-013**: Only the asked approver (that Member, or any Officer when Officers are asked) other than the
  Linked Member MAY give the Rank Approval; it MUST be stored on the Link with the approver and time.
- **FR-014**: A pending Rank Approval MUST be cancelled when the Linked Member leaves the server.
- **FR-015**: Every Link, refusal of an already Linked uid, hand-off, abandonment and Rank Approval MUST be
  posted to the configured log channel; a Link MUST mention the Member Linked to the Alliance's leader, if
  any.
- **FR-016**: Interviews (step, thread, failed attempts, pause), Links and pending Rank Approvals MUST
  survive a restart; on start, Neil MUST resume what is due (resets passed, timeouts passed).
- **FR-017**: Buttons and answers in an Interview MUST act only for the interviewed Member (or the asked
  approver); anyone else gets a short note visible only to them.
- **FR-018**: The onboarding channel, log channel and Interview timeout MUST be configuration, checked at
  startup; Neil MUST refuse to start if they are missing or invalid.
- **FR-019**: What is stored about a Link (Member id, uid, Alliance Rank and its source, approver, times)
  and for how long MUST be recorded in an ADR (constitution V).
- **FR-020**: This slice MUST NOT change any nickname or role (slice 006).

### Key Entities

- **Onboarding Interview**: one Member's conversation in one private thread; step (awaiting uid, checking,
  awaiting confirmation, paused for quota, ended as Linked, handed off or abandoned), failed attempts (0–5),
  the Player shown, last answer time.
- **Link**: one Member and one Player (uid); Alliance Rank with its source (Game API or Rank Approval) or
  unknown; created time. A Member has at most one, a Player at most one.
- **Rank Approval**: on a Link with unknown rank; asked approver (a Member or the Officers), state
  (pending, approved, cancelled), the rank, who approved and when.
- **In-game Proof**: the uid the Member typed; not stored separately from the Link.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new Member who knows where to find their uid is Linked within 2 minutes of joining, with
  one typed answer and one button press.
- **SC-002**: No two Members are ever Linked to the same Player, and no Member to two Players (verified in
  automated tests, including simultaneous confirmations).
- **SC-003**: Every Interview ends in exactly one of Linked, handed off or abandoned; none is left open
  longer than 24 hours of silence plus any quota pause.
- **SC-004**: Officers can see every Link, hand-off and abandonment in the log channel without opening the
  thread.
- **SC-005**: An Interview costs at most one Game API request per uid given, and lookups never take the
  Quota Reserve from it (slice 004).

## Assumptions

- `/players/{uid}` returns the Player, their Alliance with its leader's uid, and the roster with ranks in
  one answer (GAME-API.md); the leader is identified by that uid, so finding the approver costs no extra
  request.
- Links outlive leaving the server until "Say goodbye" (Later); a Member who rejoins with a Link gets no
  Interview.
- The private thread is visible to the Member and to Officers because the Moderator and King roles have
  "Manage Threads" in the onboarding channel (server setup, documented in HOSTING.md or the quickstart);
  Neil adds the Member, and the approver or Officers when it mentions them.
- What a Member may see on the server before being Linked is unchanged by this slice (no "unverified"
  role).
- Guests and Players in no Alliance are interviewed and Linked the same way; names and roles are slice 006.
- The start command's name is decided in the plan (e.g. `/interview`), in dictionary terms.
- The test-server check (a second account joins, gets Linked, an unknown-rank approval, a timeout with a
  short configured value) is a manual step recorded in `tasks.md`.
