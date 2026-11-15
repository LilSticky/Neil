# Feature Specification: Show how old game data is

**Feature Branch**: `032-show-how-old-game-data-is`

**Created**: 2026-11-15

**Status**: Draft

**Input**: Issue [#100](https://github.com/LilSticky/Neil/issues/100). Measured on 2026-11-14 (GAME-API.md › Freshness › Two
clocks): Neil's game data is only as new as the tracker's last re-read of the Kingdom's map, which someone starts with the
**Update Map** button on the site (`https://lastasylumtracker.com/map?kid=<kingdom>`, 30-minute cooldown per Kingdom and per
IP). The tracker's answer age (`age_seconds`) and live requests (`?fresh=1`) only concern its copy of an answer, so slice
031's "as of" time and its live requests rest on the wrong clock. The user's decisions (2026-11-14):

1. Player cards show the Player's `map_updated_at` (the last time a map re-read changed that Player) as "as of".
2. Neil stops asking for live data everywhere it does today (slice 031's acting lookups); they take the tracker's copy.
3. Every lookup card (`/player`, `/alliance`, picks, Alliance Overview, REAPER) whose data is older than 5 minutes carries
   a hint: use Update Map on the Kingdom's map page and wait until it has finished, with the link to that page.
4. Such cards carry a button that repeats the same lookup with a live request, skipping both caches, to read the data
   after the update. It counts like any lookup against the Member's Daily Allowance.
5. Alliance answers have no map time: `/alliance` cards and the Alliance Overview show no "as of" and always carry the
   hint and the button.
6. Not the Interview, corrections, Daily Sync or Booty Call replies.

Not live yet: no backwards compatibility.

## Clarifications

### Session 2026-11-14

- Q: What should an `/alliance` card (and the Alliance Overview) show as "as of"? → A: no time; always the hint and the
  button, since the age is unknown.
- Q: Which replies get the "as of", the hint and the button? → A: all lookup cards (`/player`, `/alliance`, picks,
  Alliance Overview, REAPER); not the Interview, corrections, Daily Sync or Booty Call.
- Q: A dictionary term for the tracker's map re-read? → A: Map Refresh (added to DICTIONARY.md).
- Q: The button's label? → A: "🔄 Look again".
- Q: A Look again press on `/reaper closest` re-reads every Exile live; who pays? → A: the presser: each live read counts
  against their Daily Allowance like `/player` (review finding, 2026-11-15).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Player card says when the game data last changed (Priority: P1)

A Member runs `/player` and the card's footer gives the moment the tracker's map re-read last changed that Player, not
the moment the tracker copied its answer.

**Why this priority**: today a card can say "as of 03:01 UTC" for Might and a position that are much older. Members
plan duels and REAPER hits on those numbers.

**Independent Test**: automated with a fake tracker: a Player whose map time is 12:59 UTC and whose answer copy is 8
seconds old shows "as of 12:59 UTC".

**Acceptance Scenarios**:

1. **Given** a Player whose map time is 22:13 UTC, **When** a Member looks them up at 22:57 UTC, **Then** the footer reads
   "as of 22:13 UTC", whatever the answer copy's age.
2. **Given** a map time on an earlier UTC day, **When** the card is shown, **Then** the footer shows day and month as it
   does today.
3. **Given** REAPER records an Exile's position, **When** it stores the reading, **Then** the reading's time is the
   Player's map time.
4. **Given** an answer without a usable map time, **When** the card is shown, **Then** it shows no "as of" and is treated
   as older than 5 minutes.

---

### User Story 2 - An old card tells the Member how to get current data (Priority: P1)

When a lookup card's data is older than 5 minutes, or its age is unknown, the card tells the Member to use Update Map on
the Kingdom's map page, wait until it has finished, and then press the card's button to look again. The button reads the
data live, past Neil's cache and the tracker's copy.

**Why this priority**: Neil cannot start a map re-read itself (the tracker refuses scripted requests), so the only way to
current data is the Member using the site. The Member needs the link and the steps in the reply.

**Independent Test**: automated: a card with a 44-minute-old map time carries the hint with the link for its Kingdom and
the button; a card with a 2-minute-old map time carries neither; pressing the button makes one live request and shows the
new card.

**Acceptance Scenarios**:

1. **Given** a `/player` card for a Player in Kingdom 330 whose map time is 44 minutes old, **When** it is shown, **Then**
   it says to use Update Map on `https://lastasylumtracker.com/map?kid=330`, wait until it has finished, and then press
   the button.
2. **Given** a Player whose map time is 2 minutes old, **When** the card is shown, **Then** it has no hint and no button.
3. **Given** any `/alliance` card or Alliance Overview, **When** it is shown, **Then** it has no "as of", and carries the
   hint (with the Alliance's Kingdom) and the button.
4. **Given** a card with the button, **When** the Member who asked presses it, **Then** Neil makes one live request for
   the same Player or Alliance, counts it against that Member's Daily Allowance, and replaces the card with the new one
   (with its own hint and button if still old).
5. **Given** the Member's Daily Allowance is used up, **When** they press the button, **Then** Neil refuses as it refuses
   any lookup over the allowance, and the old card stays.
6. **Given** a REAPER reply or a pick that shows a Player, **When** the data is older than 5 minutes, **Then** it carries
   the hint and the button like a `/player` card.

---

### User Story 3 - Neil stops paying for live requests that bring nothing new (Priority: P2)

The Link, corrections, the Interview, nickname and roles, the Daily Sync, the Booty Call and the Recommended Player take
the tracker's copy instead of a live request.

**Why this priority**: a live request costs the same as a copy and, as measured, brings the same game data. Only the
button of User Story 2 asks live, because then the Member has just refreshed the map.

**Independent Test**: automated: none of these flows asks the tracker for live data.

**Acceptance Scenarios**:

1. **Given** an In-game Proof in the Interview, **When** Neil reads the Player, **Then** it does not ask for live data.
2. **Given** the Daily Sync, **When** it reads Players and rosters, **Then** it does not ask for live data.
3. **Given** a Booty Call, **When** Neil reads the roster, **Then** it does not ask for live data.
4. **Given** these flows, **When** Neil answers from its own cache, **Then** any cached entry within the cache window is
   used, as for showing lookups.

### Edge Cases

- The map time is in the future (clock skew): treated as "now" (not older than 5 minutes).
- The map time is missing, zero, negative or not a number: no "as of", and the hint and button are shown.
- A Player without a Kingdom number: the hint links the tracker's map page without a Kingdom.
- Someone other than the Member who asked presses the button: refused the way other card buttons refuse other Members.
- The button is pressed long after the lookup (the cooldown and the refresh can take over 30 minutes): it still works; it needs no state, also after a restart.
- The live request fails (502, 503, 504, timeout): reported as any failed lookup; the old card stays.
- A paged `/alliance` card (roster pages): the button reloads the Alliance and shows the first page.
- A name lookup that now finds several Players (409): handled as the original command handles it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A Player's "as of" time MUST be the Player's map time from the tracker (`map_updated_at`), not the answer
  copy's age.
- **FR-002**: Alliance answers (the `/alliance` card and the Alliance Overview) MUST NOT show an "as of" time.
- **FR-003**: Cards that show a Player (`/player`, its picks, REAPER) MUST use the Player's map time as "as of";
  REAPER MUST store it as the reading's time.
- **FR-004**: A lookup card MUST carry the Update Map hint and the button when its data is older than 5 minutes at the
  moment it is shown, when its map time is unknown, or when it shows an Alliance.
- **FR-005**: The hint MUST name Update Map, link the tracker's map page of the data's Kingdom
  (`https://lastasylumtracker.com/map?kid=<kingdom>`), and say to wait until it has finished before pressing the button.
- **FR-006**: The button MUST repeat the card's lookup for the same Player or Alliance with a live request that skips
  Neil's cache and the tracker's copy, and replace the card with the result.
- **FR-007**: A button press MUST count as one lookup against the presser's Daily Allowance and the Daily Quota, and MUST
  be refused like any lookup when the allowance or the Quota Reserve forbids it.
- **FR-008**: Only the Member who ran the lookup MAY use the button.
- **FR-008a**: A press on `/reaper closest` MUST charge each live Exile read to the presser's Daily Allowance; reads
  refused by the allowance or the Quota Reserve stop, and the Exiles not read keep their stored positions. It keeps the
  answer's paging (`all`).
- **FR-008b**: A live lookup refused by the Daily Quota or the Quota Reserve MUST be refused, not answered from Neil's
  stale cache.
- **FR-009**: Neil MUST NOT ask the tracker for live data anywhere except the button.
- **FR-010**: Neil's own cache MUST answer every lookup except the button from any entry within the cache window
  (`GAME_API_CACHE_MINUTES`); the live/copy distinction of slice 031 goes.
- **FR-011**: The Interview, corrections, Daily Sync and Booty Call replies MUST NOT carry the hint or the button.
- **FR-012**: GAME-API.md MUST say how Neil uses `map_updated_at` and the live request after this slice.

### Key Entities

- **Map time**: the moment the tracker's re-read of a Kingdom's map last changed a Player's record (`map_updated_at`);
  the best known age of a Player's game data (an upper bound).
- **Map Refresh** (DICTIONARY.md): the tracker re-reading a whole Kingdom's map; only the Update Map button on its site
  starts one.
- **Look again** (button label "🔄 Look again", not a term): the card button that repeats a lookup live after a Map Refresh.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Player card shows the Player's map time to the minute; no card shows the answer copy's time.
- **SC-002**: 100% of lookup cards with data older than 5 minutes or of unknown age carry the hint, the right Kingdom
  link and the button; no card with data 5 minutes old or newer carries them.
- **SC-003**: Outside button presses, Neil makes no live requests (verifiable in the request log).
- **SC-004**: A Member who uses Update Map, waits for it to finish and presses the button sees the refreshed data in
  one step, at the cost of one request.

## Assumptions

- `map_updated_at` is present on player answers (verified 2026-11-14 on Kingdom 330) and is Unix seconds, fractional.
- Alliance answers have no map time; `updated_at` is the lookup moment (verified 2026-11-14 on Ratz, Kingdom 330).
- A live request still costs one request like a copy (slice 031, unchanged).
- The 5-minute threshold is fixed in code, not configuration.
- The hint is short text plus the link on the card; wording follows Neil's voice (plain instructions).
- No migration: REAPER's stored reading time keeps its column, only its value's source changes.
- Neil does not read the tracker's website endpoints (the Kingdom's last refresh time), which are not the documented API.
