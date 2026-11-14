# Feature Specification: Act on fresh game data

**Feature Branch**: `031-act-on-fresh-game-data`

**Created**: 2026-11-14

**Status**: Draft

**Input**: The Last Asylum Tracker (the Game API) changed on 2026-11-14. It now answers at once from its own copy of a
Player or Alliance and refreshes that copy in the background. The copy is normally up to 60 minutes old, but a real call
on 2026-11-14 got one about 44 hours old. Before, nothing was older than 10 minutes. Every answer now says how old its
data is, and a request can ask for live data instead, at the same quota cost. The user's decision (2026-11-14): **fresh
only where it matters.** Neil asks for live data when it acts on what it reads (Link, Rank, nicknames and roles, the
Daily Sync, Booty Call, the Recommended Player). For lookups that only show data (`/player`, `/alliance`, REAPER, the
Alliance Overview, picks), it takes the tracker's copy and shows how old it really is. Not live yet: no backwards
compatibility.

## Clarifications

### Session 2026-11-14

- Q: How should Neil ask now that the tracker can serve old copies? → A: fresh only where it matters (live data when
  Neil acts; the tracker's copy, with its real age, when Neil only shows).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Neil acts only on current game data (Priority: P1)

When Neil gives roles, sets a nickname, links a Member, opens a Rank Approval, runs the Daily Sync, mentions Members in
a Booty Call or recommends a Player, it uses what the game shows now, not a copy from yesterday.

**Why this priority**: a stale copy gives wrong roles and ranks, links on outdated In-game Proof, misses a Member who
just changed Alliance, and mentions Members as online who left hours ago. That is the harm the API change brings.

**Independent Test**: automated with a fake tracker: each acting lookup asks for live data; a cached copy older than
Neil's cache window is not used for acting.

**Acceptance Scenarios**:

1. **Given** the tracker holds a 44-hour-old copy of a Player, **When** a Member gives In-game Proof in the Interview,
   **Then** Neil checks it against live data.
2. **Given** a Linked Member who changed Alliance an hour ago, **When** the Daily Sync or a nickname-and-roles read runs,
   **Then** the Member gets the new Alliance's role and nickname.
3. **Given** a `/booty` call, **When** Neil reads the caller's Alliance roster, **Then** who is online in the game comes
   from live data.
4. **Given** a Recommended Player is asked for by name in the Interview, **When** Neil finds them, **Then** it uses live
   data.
5. **Given** Neil looked a Player up for a card 5 minutes ago from a 2-hour-old copy, **When** an acting lookup needs
   that Player, **Then** Neil asks again for live data instead of using its own cache.
6. **Given** Neil fetched live data for a Player 5 minutes ago, **When** an acting lookup needs that Player, **Then**
   Neil answers from its own cache without a request.

---

### User Story 2 - Members see how old the data on a card is (Priority: P2)

A Member who runs `/player`, `/alliance`, REAPER or the Alliance Overview gets an answer fast from the tracker's copy,
and the card's "as of" time says when the game sent that data, not when Neil asked.

**Why this priority**: showing lookups don't change anything on the server, so speed and quota matter more than
freshness, but an honest time is needed so nobody trusts a two-day-old power or position as current.

**Independent Test**: automated: a found answer whose copy is 2 hours old shows "as of" 2 hours before the lookup.

**Acceptance Scenarios**:

1. **Given** the tracker answers `/player` with a copy 7,200 s old, **When** the card is shown at 14:00 UTC, **Then**
   its footer reads "as of 12:00 UTC".
2. **Given** a copy older than today in UTC, **When** the card is shown, **Then** the footer shows the day and month as
   it already does for older data.
3. **Given** REAPER reads an Exile from a 3-hour-old copy, **When** it records the Exile's position, **Then** the
   position is recorded as read 3 hours ago.
4. **Given** a showing lookup, **When** Neil asks the tracker, **Then** it does not ask for live data.

---

### User Story 3 - The project knows the new API (Priority: P3)

`documentation/GAME-API.md` records what the update changed, as verified by real calls.

**Why this priority**: the next change to the client must start from facts, not the outdated "10 minutes" note.

**Independent Test**: review of the document.

**Acceptance Scenarios**:

1. **Given** GAME-API.md, **When** a developer reads Freshness, **Then** it states the 60-minute window, the 44-hour copy
   seen, the age and refresh fields, live requests and their cost, and the cache header values.

### Edge Cases

- The tracker sends no age (an older answer shape, or a field missing): the data is treated as fetched at the moment
  Neil got it, as today.
- A negative or non-numeric age: treated as missing.
- A live request fails (502, 503, 504, timeout): handled exactly as a failed request today, including the fallback to a
  stale cached copy when the quota is spent or reserved; Neil does not retry without live data.
- A name lookup for an acting purpose that ends in several matches (409): unchanged.
- An acting lookup and a showing lookup for the same Player at the same time: they may share one live request, never
  one non-live request.
- The Daily Quota spent: an acting lookup may still fall back to the stale cached copy as today; the age it shows is
  that copy's real age.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST ask the tracker for live data for every lookup it acts on: In-game Proof and the Link (also an
  Officer Link and the corrections flow), the Rank and Rank Approval, nickname-and-roles reads, the Daily Sync's Player
  and roster reads, the Booty Call's roster read, and the Recommended Player's name lookup.
- **FR-002**: Neil MUST NOT ask for live data for lookups that only show data: `/player`, `/alliance`, their picks,
  REAPER (`/reaper add` and `/reaper closest`) and the Alliance Overview.
- **FR-003**: Every found answer MUST carry when the game sent its data: the moment Neil received it minus the
  tracker's age in seconds; with no usable age, the moment Neil received it.
- **FR-004**: Cards and stored readings (the "as of" footer, the Alliance Overview, REAPER's read time) MUST use the time
  the game sent the data.
- **FR-005**: An acting lookup MUST NOT be answered from Neil's own cache unless the cached data was sent by the game
  within Neil's cache window (`GAME_API_CACHE_MINUTES`); otherwise it asks for live data.
- **FR-006**: A showing lookup MAY be answered from any cached entry within the cache window, live or not.
- **FR-007**: The quota and Daily Allowance cost of a request MUST stay as it is: one request per call, live or not.
- **FR-008**: GAME-API.md MUST record the update: answers from the tracker's copy (60-minute window, a 44-hour copy
  seen), top-level `age_seconds`, `refreshing`, `cached`, `cache_seconds` 3600, live requests with `?fresh=1` (same
  cost), the cache header values `hit`, `stale`, `miss`, `live`, gzip-compressed answers, and the 2,000 daily limit.

### Key Entities

- **Data age**: how long before Neil got an answer the game sent its data; 0 for live data.
- **Acting lookup / showing lookup**: whether Neil changes something on the server (or mentions Members) from the
  answer, or only shows it to the caller.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No role, nickname, Link, Rank Approval or Booty Call mention is ever based on game data older than Neil's
  cache window (10 minutes by default), unless the quota forced a fallback.
- **SC-002**: Every card shows an "as of" time within one minute of when the game sent its data.
- **SC-003**: The daily request count for the same activity does not rise.
- **SC-004**: Showing lookups answer as fast as the tracker's copy allows (no wait for live data).

## Assumptions

- The tracker's new fields are at the top level of player and alliance answers (verified on `/players/{uid}`
  2026-11-14; alliance answers assumed the same, checked during the slice).
- A live request answers within Neil's existing 15 s timeout (documented 1–2 s, measured 0.12 s).
- No new dictionary term is needed: "acting" and "showing" describe the existing purposes; the card's "as of" wording
  stays.
- Neil's cache window stays at `GAME_API_CACHE_MINUTES` (default 10).
- Node's fetch already accepts gzip; nothing to do for compression.
- No migration, no new command, no Discord text change beyond the time the footer shows.
