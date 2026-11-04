# Feature Specification: Find the closest Exile (REAPER)

**Feature Branch**: `014-find-the-closest-exile`

**Created**: 2026-11-04

**Status**: Draft

**Input**: ROADMAP Later: "REAPER: Roster of Exiled Antagonists, Pervs, Evildoers & Reprobates. Lets the R5s keep a
list of Players the server's community has exiled for being malicious (add and remove), and any Member find the
closest unshielded exile, with their coordinates." Open questions in [#35](https://github.com/LilSticky/Neil/issues/35).

## Clarifications

### Session 2026-11-04 (discovery, answers on #35)

- Q: The Game API's `shielding` has always read 0. How does "closest unshielded" work? → A: show the 3 closest Exiles
  by distance and say shield state is not known; trust `shielding` only when it reads non-zero.
- Q: Closest to what? → A: the caller's Linked Player's position; only Exiles in the same Kingdom count; the caller may
  give a position instead.
- Q: Who may add and remove Exiles? → A: only Members Linked to the R5 of a Home Kingdom Alliance. Not Officers, not
  R5s of other Kingdoms.
- Q: How fresh must positions be? → A: each lookup re-reads the Exiles in that Kingdom through the caching Game API
  client (cached for 10 minutes), from the normal lookup budget, which stops short of the Quota Reserve.
- Q: What does an entry hold? → A: added by Player Name; holds the Player, a reason and when it was added. Who added it
  is stored but not shown to Members. Lookup results show the Exile's full player card.
- Q: Term? → A: **Exile** (one Player on REAPER) and **REAPER** (the list); added to the dictionary (approved
  2026-11-04).
- Q: (dictionary review) → A: include a full list option: the lookup can show every Exile in the Kingdom by distance,
  not only the 3 closest.
- Q: Order? → A: after slice 013.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Home R5 adds an Exile (Priority: P1)

A Player has been harassing the Kingdom. The R5 of a Home Kingdom Alliance adds them to REAPER by Player Name with a
reason. If the name matches Players in several Kingdoms, Neil shows a pick list, as `/player` does. Neil confirms the
Player it added (name, Kingdom, Alliance) privately and posts a log line for the Officers.

**Why this priority**: without Exiles there is nothing to find; it is the base of the slice.

**Independent Test**: automated: a Member Linked to a Home Kingdom Alliance's R5 adds a Player by name with a reason →
one Exile stored with uid, name, Kingdom, reason, time and adder; private confirmation; one log line.

**Acceptance Scenarios**:

1. **Given** a Member Linked to the R5 of a Home Kingdom Alliance, **When** they add a Player by name with a reason,
   **Then** that Player is an Exile with the reason and the time it was added, and only the caller sees the
   confirmation.
2. **Given** a name that matches Players in several Kingdoms, **When** the R5 adds it, **Then** they pick the Player
   from a list first (the Kingdom option narrows the search, as on `/player`).
3. **Given** the Player is already an Exile, **When** an R5 adds them again, **Then** only the caller sees "already an
   Exile" with the existing reason, and nothing changes.
4. **Given** a Member who is not Linked to a Home Kingdom Alliance's R5 (an Officer, an R4, an R5 of another Kingdom,
   a Guest, a Member without a Link), **When** they try to add, **Then** only they see that only Home Kingdom R5s may
   change REAPER, and no Game API request is made.
5. **Given** no reason, or a name the Game API does not know, **Then** the caller is told so and nothing is stored.
6. **Given** the add, **Then** one log line in the log channel names the Exile, the reason and the R5 who added it.

---

### User Story 2 - Any Member finds the closest Exiles (Priority: P1)

A Member wants to hit an Exile. They run the lookup; Neil takes their Linked Player's position, re-reads the Exiles in
the same Kingdom, and answers privately with the 3 closest: for each, the full player card (as `/player` shows it), the
coordinates, the distance, the reason and when they were exiled. The answer says that Neil cannot see shields.

**Why this priority**: it is what the list is for.

**Independent Test**: automated: with 5 Exiles in Kingdom 330 at known positions and a caller Linked to a Player at a
known position, the lookup answers with the 3 nearest in order of distance, each with card, coordinates, distance,
reason and date, plus the shield note.

**Acceptance Scenarios**:

1. **Given** a Linked Member and Exiles in their Linked Player's Kingdom, **When** they look up, **Then** they see the 3
   closest Exiles in order of distance from their Linked Player's current position, each with the full player card,
   coordinates, distance, reason and date added; who added them is not shown.
2. **Given** the caller gives a position (x and y), **Then** distances are measured from that position instead.
3. **Given** fewer than 3 Exiles in the Kingdom, **Then** all of them are shown; **given** none, **Then** the caller
   sees "no Exiles in Kingdom N".
4. **Given** Exiles in other Kingdoms only, **Then** none of them are shown.
5. **Given** the Game API reports an Exile as shielded (`shielding` not 0), **Then** that Exile is left out and the next
   closest takes its place; otherwise the answer says shield state is not known.
6. **Given** an Exile was read less than 10 minutes ago, **Then** the cached answer is used and no new request is made.
7. **Given** the caller chooses the full list option, **Then** they see every Exile in the Kingdom in order of
   distance, with the same details, paged; it costs no more requests than the 3-closest lookup.

---

### User Story 3 - A Home R5 removes an Exile (Priority: P2)

A Player has made amends, or was added by mistake. A Home Kingdom R5 removes them from REAPER, choosing from the
current Exiles. Neil confirms privately and posts a log line.

**Why this priority**: the list must be correctable, but adding and finding come first.

**Independent Test**: automated: an R5 removes an Exile → no longer stored, private confirmation, one log line;
someone else trying gets refused.

**Acceptance Scenarios**:

1. **Given** a Home Kingdom R5, **When** they remove an Exile, **Then** the Player is no longer an Exile, the caller sees
   the confirmation and one log line names the Exile and the R5.
2. **Given** a Player who is not an Exile, **Then** the caller sees "not an Exile" and nothing changes.
3. **Given** a Member who is not a Home Kingdom R5, **Then** they are refused as in US1 scenario 4.
4. **Given** the R5 is choosing which Exile to remove, **Then** suggestions list the current Exiles while they type,
   without a Game API request.

---

### User Story 4 - Any Member sees the whole list (Priority: P3)

A Member wants to know who is on REAPER. They ask for the list and see every Exile privately: name, Kingdom, reason
and date added, newest first. No Game API request is made.

**Why this priority**: useful, cheap, but not essential to the hunt.

**Independent Test**: automated: with 3 stored Exiles the list shows all three with name, Kingdom, reason and date,
newest first, and makes no Game API request.

**Acceptance Scenarios**:

1. **Given** stored Exiles, **When** any Member asks for the list, **Then** only they see every Exile with name, Kingdom,
   reason and date added, newest first, and never who added it.
2. **Given** more Exiles than fit one reply, **Then** the list is paged.
3. **Given** an empty REAPER, **Then** the caller sees "REAPER is empty".

### Edge Cases

- **Not Linked**: a Member without a Link must give x and y; distances then count in the Home Kingdom.
- **Exile moved Kingdom**: when a re-read shows an Exile in another Kingdom, Neil updates the stored Kingdom and leaves
  them out of this lookup.
- **Exile renamed**: the Exile is kept by uid; the stored name follows the latest read.
- **Exile cannot be read** (Game API error or timeout): Neil uses the last position it knows, marked with its date;
  an Exile Neil never had a position for is left out and the answer says how many could not be read.
- **Lookup budget spent**: Exiles not yet re-read are ranked by their last known position, marked with its date; when
  nothing can be read at all, the usual "Daily Quota spent" message is shown. The Quota Reserve is never used.
- **Caller's own Linked Player cannot be read**: the caller is asked to give x and y.
- **Caller's Linked Player is an Exile**: they are left out of their own result.
- **Equal distance**: ties are ordered by the earlier date added.
- **R5 loses the rank**: whether a Member may change REAPER is decided from their Linked Player's Alliance Rank as Neil
  last knew it (Link, Rank Approval, Daily Sync), at the time they ask; Exiles they added stay.
- **A Linked Member is added as an Exile**: allowed; their Link and roles do not change.
- **Reason length**: at most 200 characters; longer reasons are refused with a message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST keep REAPER: a persistent list of Exiles, at most one per Player (uid), surviving restarts.
- **FR-002**: Each Exile MUST hold the Player's uid, latest known name, Kingdom, last known position with its date, the
  reason (1–200 characters), the time added, and the Member who added it.
- **FR-003**: Only a Member whose Linked Player is R5 of an Alliance in the Home Kingdom (as Neil last knew it) MAY add or
  remove Exiles; everyone else MUST be refused privately before any Game API request.
- **FR-004**: Adding MUST find the Player by Player Name (optionally narrowed by Kingdom), offer a pick list when
  several Players match, and refuse a Player who is already an Exile.
- **FR-005**: Removing MUST offer the current Exiles as suggestions while typing, without a Game API request.
- **FR-006**: Every add and remove MUST post one log line naming the Exile and the R5; Members never see who added an
  Exile.
- **FR-007**: Any Member MAY look up the closest Exiles; the answer MUST be private and show at most 3 Exiles in the
  Kingdom of the position used, ordered by straight-line distance on the map; with the full list option, every Exile
  in that Kingdom in the same order, paged.
- **FR-008**: The position MUST be the caller's Linked Player's current position, unless the caller gives x and y;
  without a Link the caller MUST give x and y, and the Home Kingdom is used.
- **FR-009**: Each Exile in the answer MUST show the full player card as `/player` shows it, the coordinates, the
  distance, the reason and the date added.
- **FR-010**: An Exile the Game API reports as shielded MUST be left out; otherwise the answer MUST state that shield
  state is not known.
- **FR-011**: A lookup MUST re-read the caller's Player and the Exiles in that Kingdom through the caching Game API
  client, from the lookup budget, never the Quota Reserve; Exiles it cannot re-read MUST be ranked by their last known
  position, shown with its date.
- **FR-012**: Any Member MAY see the whole list privately (name, Kingdom, reason, date added; newest first; paged),
  without a Game API request.
- **FR-013**: All Discord texts MUST use the dictionary terms (Exile, REAPER, Player, Kingdom, Alliance Rank).

### Key Entities

- **Exile**: a Player on REAPER; uid, name, Kingdom, last known position and its date, reason, time added, adder.
- **REAPER**: the list of all Exiles.
- **Position**: a point (x, y) on a Kingdom's map; distance is straight-line.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Home Kingdom R5 adds an Exile in one command plus at most one pick.
- **SC-002**: A Member gets the 3 closest Exiles with coordinates in one command, in under 10 seconds when the Game API
  answers normally.
- **SC-003**: No one but a Home Kingdom R5 can change REAPER (every other caller refused in tests).
- **SC-004**: A lookup repeated within 10 minutes costs no further Daily Quota.
- **SC-005**: A lookup never uses the Quota Reserve.
- **SC-006**: No Member-facing text names the Member who added an Exile.

## Assumptions

- REAPER stays small (tens of Exiles per Kingdom), so re-reading one Kingdom's Exiles fits the lookup budget; a
  cold lookup costs one request per Exile in that Kingdom plus one for the caller.
- The Game API's `x`/`y` (GAME-API.md, `/players/{uid}`) is the Player's sanctuary position on their Kingdom's map.
- Replies are private (only the caller sees them) so Exiles are not paraded in public channels.
- An add costs one name lookup from the lookup budget, like `/player`.
- Officers see who added an Exile through the log channel only.
- Command names and layout are decided in the plan.
- Dictionary: **Exile** and **REAPER** added (approved 2026-11-04).
