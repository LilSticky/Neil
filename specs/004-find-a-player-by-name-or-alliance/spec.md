# Feature Specification: Find a player by name or alliance

**Feature Branch**: `004-find-a-player-by-name-or-alliance`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Slice 004 'Find a player by name or alliance' (ROADMAP): any Member runs
/player by name (with a pick list when the name matches Players in several kingdoms; an optional kingdom
narrows it) and sees an Alliance's members with their uids on /alliance, so they can look up any of them;
lookups stop short of the Quota Reserve, which is kept for Onboarding Interviews. Endpoints:
/players/name/{name}, /players/{kingdom}/{name}, /alliances/name/{name} (exact full name), 409 match list.
Approximate alliance-name search is out of scope (Later)."

## Clarifications

### Session 2026-10-30

- Q: How big is the Quota Reserve? → A: a fixed 100 requests per UTC day, configurable.
- Q: How does a Member look up one of an Alliance's members from `/alliance`? → A: the card lists the whole
  Alliance Roster with uids, and a select menu, paged 25 Players at a time with page buttons, opens a
  listed Player's card.
- Q: Who may use the pick lists on a public card? → A: only the Member who ran the command; anyone else
  gets a short note, visible only to them, to run the command themselves.
- Q: Dictionary terms? → A: Player Name and Alliance Roster approved (2026-10-30).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Look up a Player by Player Name (Priority: P1)

A Member knows a Player's in-game name but not their uid. They run `/player` with the name and get the
same profile card as a uid lookup. If the name belongs to several Players, Neil shows a pick list of them
(Kingdom and Player Name each), and the Member picks the one they meant. Giving a Kingdom narrows the
search to it.

**Why this priority**: Members rarely know uids; names are what they see in the game. It is the core of
the slice.

**Independent Test**: in automated tests with a fake Game API (one match, several matches, no match, with
and without a Kingdom); on the test server, `/player name:drlol` (several Kingdoms) and with
`kingdom:1`.

**Acceptance Scenarios**:

1. **Given** exactly one Player has the Player Name, **When** a Member runs `/player` with that name in
   any letter case, **Then** they see that Player's card, as for a uid lookup.
2. **Given** several Players share the Player Name, **When** a Member runs `/player` with it, **Then** they
   see a pick list naming each match's Kingdom and Player Name, and picking one shows that Player's card.
3. **Given** several Players share the Player Name in different Kingdoms, **When** a Member runs `/player`
   with the name and a Kingdom, **Then** only matches in that Kingdom count (one match gives the card at
   once).
4. **Given** no Player has the Player Name (in the given Kingdom), **When** a Member runs `/player` with
   it, **Then** only they see that no Player has exactly that name, with a hint that the name must be
   complete and that a uid always works.
5. **Given** a Member runs `/player` with both a uid and a name, or with neither, **When** Neil answers,
   **Then** only they see that exactly one of uid or name is needed, and no Game API request is made.
6. **Given** a pick list was posted for one Member, **When** another Member uses it, **Then** only that
   other Member sees a note to run `/player` themselves, and nothing is looked up.

---

### User Story 2 - See an Alliance Roster and look up its members (Priority: P1)

A Member runs `/alliance` (by Kingdom and tag as before, or by the Alliance's full name) and sees the card
with the whole Alliance Roster: each Player's Alliance Rank, Player Name and uid. A select menu below the
card, paged 25 Players at a time, opens any listed Player's card.

**Why this priority**: the roster is how Members find each other's uids, and it prepares the Onboarding
Interview, where Members confirm who they are.

**Independent Test**: in automated tests with a recorded Alliance answer (rosters of 1, 25, 26 and 100
Players); on the test server, `/alliance kingdom:1 alliance:NML` and `/alliance name:No Man's Land`.

**Acceptance Scenarios**:

1. **Given** an Alliance exists, **When** a Member runs `/alliance` with its Kingdom and tag, **Then** the
   card lists every Player of the Alliance Roster with Alliance Rank, Player Name and uid, highest rank
   first, then by Player Name.
2. **Given** an Alliance exists, **When** a Member runs `/alliance` with its exact full name (any letter
   case), without a Kingdom, **Then** they see the same card.
3. **Given** several Alliances share the full name, **When** a Member runs `/alliance` with it, **Then**
   they see a pick list naming each match's Kingdom, tag and name, and picking one shows that Alliance's
   card.
4. **Given** the Alliance Roster has more than 25 Players, **When** the card is shown, **Then** the select
   menu shows 25 Players at a time and page buttons move between pages; the list on the card shows all
   Players.
5. **Given** the card's select menu, **When** the Member who ran `/alliance` picks a Player, **Then** that
   Player's card is shown (from the cache when fresh, otherwise one Game API request).
6. **Given** a Member runs `/alliance` with a part of the name, the tag instead of the name, or a Kingdom
   together with a name, **When** Neil answers, **Then** only they see how to call `/alliance` (Kingdom and
   tag, or the exact full name) and that approximate names are not supported.
7. **Given** a Player in the roster has no Alliance Rank, **When** the card is shown, **Then** that Player
   is listed as rank unknown, after R1.

---

### User Story 3 - Lookups leave the Quota Reserve for Onboarding Interviews (Priority: P2)

Lookups (`/player`, `/alliance` and picks from their lists) stop when only the Quota Reserve is left of the
Daily Quota, so new Members can still be interviewed later that day. Officers see the reserve on `/quota`.

**Why this priority**: the Onboarding Interview (slice 005) depends on it; with no Interview yet it only
caps lookups 100 requests earlier.

**Independent Test**: in automated tests, let the fake Game API report 101, 100 and 0 remaining requests
and count lookup requests; on the test server, `/quota` shows the reserve.

**Acceptance Scenarios**:

1. **Given** more than 100 requests remain today, **When** a Member looks something up, **Then** Neil asks
   the Game API as before.
2. **Given** 100 or fewer requests remain today, **When** a Member looks up something not cached, **Then**
   Neil does not ask the Game API and only that Member sees that lookups are paused for today because the
   rest is kept for new Members, and that they work again at 00:00 UTC.
3. **Given** 100 or fewer requests remain, **When** a Member looks up something cached, even older than 10
   minutes, **Then** they get the card with its "as of" time.
4. **Given** an Officer runs `/quota`, **When** Neil answers, **Then** they also see the Quota Reserve and
   how many requests lookups may still use today.
5. **Given** a request is made for an Onboarding Interview (a purpose the client accepts from this slice
   on), **When** 100 or fewer requests remain, **Then** Neil still asks the Game API until the Daily Quota
   is spent.

### Edge Cases

- A Player Name with spaces, emoji or characters that must be encoded in a URL: looked up exactly as typed,
  apart from surrounding spaces.
- More than 25 Players share a Player Name: the pick list shows the first 25 (by Kingdom number) and says
  that a Kingdom narrows the search.
- A pick list or select menu is used after Discord no longer lets Neil answer it (15 minutes): the Member
  is told to run the command again.
- The picked Player no longer exists or the Game API fails: the same messages as a uid lookup.
- A name lookup answers with a "could not prepare" failure (the Game API's 502 for unknown uids): treated
  like a uid lookup's "maybe unknown".
- The Alliance Roster is empty or the Game API omits some rows: the card says so; the select menu is left
  out when there is nobody to pick.
- The Quota Reserve is configured larger than the reported limit: lookups never ask the Game API; Neil
  logs a warning at startup.
- A name lookup and a uid lookup of the same Player: each is cached under its own key; both cost one
  request the first time.
- A Member's own answer with a pick list costs one request (the "several matches" answer); each pick costs
  one more unless cached.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `/player` MUST accept exactly one of a uid or a Player Name, and an optional Kingdom used only
  with a Player Name; otherwise it MUST explain the options to the caller only and make no Game API
  request.
- **FR-002**: A Player Name lookup MUST match the complete name, ignoring letter case and surrounding
  spaces; with a Kingdom, only that Kingdom.
- **FR-003**: When a Player Name matches several Players, Neil MUST show a pick list of up to 25 matches,
  each with Kingdom and Player Name, and show the picked Player's card.
- **FR-004**: `/alliance` MUST accept either a Kingdom and tag, or an exact full Alliance name without a
  Kingdom; otherwise it MUST explain the options to the caller only and make no Game API request.
- **FR-005**: When a full Alliance name matches several Alliances, Neil MUST show a pick list of up to 25
  matches, each with Kingdom, tag and name, and show the picked Alliance's card.
- **FR-006**: The Alliance card MUST list the whole Alliance Roster with each Player's Alliance Rank (or
  unknown), Player Name and uid, ordered R5 to R1, then unknown, then by Player Name.
- **FR-007**: The Alliance card MUST offer a select menu of its roster, 25 Players per page with page
  buttons when the roster is longer, that shows the picked Player's card.
- **FR-008**: Pick lists, select menus and page buttons MUST answer only the Member who ran the command;
  anyone else MUST get a short note, visible only to them, and nothing is looked up.
- **FR-009**: Name lookups and match lists MUST be cached and counted like uid lookups (slice 003), keyed
  by the normalised name and Kingdom.
- **FR-010**: Lookups MUST NOT send a Game API request when the requests remaining today are at or below
  the Quota Reserve; they MUST serve a cached answer when one exists, otherwise tell the caller only that
  lookups are paused for today, why, and when they resume (00:00 UTC and the time left).
- **FR-011**: The Quota Reserve MUST be configuration, a whole number of requests, default 100; Neil MUST
  refuse to start if it is negative or not a number.
- **FR-012**: The Game API client MUST take the purpose of each request (lookup or Onboarding Interview);
  only Onboarding Interview requests may use the Quota Reserve.
- **FR-013**: `/quota` MUST also show the Quota Reserve and the requests left for lookups today.
- **FR-014**: Only the Game API endpoints verified in GAME-API.md may be used; approximate name matching is
  out of scope.

### Key Entities

- **Player Name**: a Player's in-game nickname; not unique; matched exactly, ignoring letter case.
- **Name match**: one entry of a "several matches" answer: uid, Kingdom and Player Name (or, for
  Alliances, Kingdom, tag and name).
- **Alliance Roster**: the Alliance's Players with uid, Player Name and Alliance Rank.
- **Quota Reserve**: the last 100 (configurable) requests of the Daily Quota, for Onboarding Interviews
  only.
- **Request purpose**: lookup or Onboarding Interview; decides whether the Quota Reserve may be used.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member who knows only a Player's complete name reaches that Player's card in at most two
  steps (command, then one pick) and under 20 seconds.
- **SC-002**: A Member can read any Player's uid from their Alliance's card without another command.
- **SC-003**: Lookups never bring the requests remaining today below the Quota Reserve (verified in
  automated tests); requests for an Onboarding Interview still can.
- **SC-004**: A lookup refused for the Quota Reserve tells the Member when lookups work again, from the
  message alone.
- **SC-005**: Nobody but the Member who ran a command can trigger a Game API request through its pick lists.

## Assumptions

- The Game API's "several matches" answer for Players and Alliances lists uid (or Alliance id), Kingdom and
  name (and tag); verified for Players (2026-10-30), assumed alike for Alliances and checked with a
  recorded answer in the plan.
- Alliance name lookup gives no Kingdom option: the endpoint has none, and the Kingdom-and-tag form covers
  that case.
- A roster of up to 100 Players fits on one card; if not, the list continues in further fields or messages
  (plan decides). The select menu pages are the only paged part.
- Picks reuse slice 003's cache: a Player picked from a roster costs one request unless cached. Roster
  rows are not turned into Player cards (slice 003's assumption stands).
- The Quota Reserve is measured against the Game API's reported remaining requests, with Neil's own count
  as before; the reserve does not change with the tier.
- Nothing uses the Onboarding Interview purpose yet besides tests; slice 005 is its first user.
- The test-server check (name lookup with several Kingdoms, roster select menu, `/quota` with the reserve)
  is a manual step recorded in `tasks.md`.
