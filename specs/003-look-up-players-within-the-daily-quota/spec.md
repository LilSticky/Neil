# Feature Specification: Look up players within the daily quota

**Feature Branch**: `003-look-up-players-within-the-daily-quota`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Slice 003 'Look up players within the daily quota' (ROADMAP): lets lookups
keep working all day. Repeated `/player` and `/alliance` lookups are served from a cache (at least 10
minutes, the tracker's own freshness window); concurrent lookups of the same key share one request. Neil
counts Game API usage per UTC day in persistent storage and trusts the Game API's own figures over its
own count, so restarts cannot overspend. When the quota is spent or after a 429, Neil serves cached data
where it can, otherwise tells the Member clearly that the Daily Quota is spent and when it resets
(00:00 UTC). 503/504 retry with capped exponential backoff and jitter. Officers can run `/quota` to see
used/remaining/limit and reset time."

## Clarifications

### Session 2026-10-30

- Q: Who may run `/quota`? → A: Officers, meaning Members with the configured Moderator or King role
  (the same roles as for Rank Approval). Dictionary: Officer = a Member with the Moderator or King role.
- Q: Which quota shares does this slice build, given there is no background sync yet? → A: None. This
  slice counts, caches and stops at the Daily Quota. The Quota Reserve (for Onboarding Interviews) comes
  with slice 004; a background-sync share with the sync slice.
- Q: Dictionary terms? → A: Daily Quota and Quota Reserve approved (Quota Reserve is used from slice 004).
- Q: Should a card say how old its data is? → A: Yes, every card shows "as of HH:MM UTC", the time the
  data was fetched from the Game API, whether it came from the cache or not.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Repeated lookups cost nothing (Priority: P1)

A Member looks up a Player or Alliance that someone looked up a few minutes ago and gets the same card at
once, without Neil spending any of the Daily Quota. The card says when its data was fetched.

**Why this priority**: the tracker itself refreshes a profile only every 10 minutes, so a second request
inside that window buys nothing. Caching is the cheapest way to keep lookups working all day, and the
Onboarding Interview (slice 004) will look up the same Player more than once.

**Independent Test**: in automated tests with a fake clock and a fake Game API, look up the same uid
twice within 10 minutes and count Game API requests; on the test server, run `/player` twice with the
same uid and compare the "as of" time.

**Acceptance Scenarios**:

1. **Given** a Player was looked up less than 10 minutes ago, **When** a Member runs `/player` with the
   same uid, **Then** the card appears without a new Game API request and shows the same "as of" time.
2. **Given** an Alliance was looked up less than 10 minutes ago, **When** a Member runs `/alliance` with
   the same Kingdom and the same tag in any letter case or with surrounding spaces, **Then** no new Game
   API request is made.
3. **Given** a Player was looked up more than 10 minutes ago, **When** a Member looks them up again,
   **Then** Neil asks the Game API again and the card shows the new "as of" time.
4. **Given** two Members look up the same uid at the same moment, **When** neither answer is cached yet,
   **Then** Neil makes one Game API request and both Members get the card.
5. **Given** a `/player` lookup returned the Player's whole Alliance roster, **When** a Member then looks
   up another Player of that roster, **Then** Neil still asks the Game API (only the requested Player's
   profile counts as cached; see Assumptions).

---

### User Story 2 - Clear answer when the Daily Quota is spent (Priority: P1)

When the Daily Quota is used up, Neil stops asking the Game API until 00:00 UTC. A Member still gets the
card if it is in the cache; otherwise they are told the Daily Quota is spent and when lookups work again.
A restart of Neil does not reset this.

**Why this priority**: constitution IV. Neil must never overspend, including after restarts, before it
can join the production server (STATUS, known broken).

**Independent Test**: in automated tests, let the fake Game API report the Daily Quota as spent (through
its quota figures or a 429), then look up cached and uncached keys, restart the client on the same
storage, and count requests.

**Acceptance Scenarios**:

1. **Given** the Game API's figures say no requests remain today, **When** a Member looks up a key that
   is not cached, **Then** Neil does not ask the Game API and only that Member sees: lookups are paused
   because the Daily Quota is spent, and they work again at 00:00 UTC (with the time left until then).
2. **Given** the Game API answered 429, **When** any further lookup arrives before 00:00 UTC, **Then**
   Neil does not ask the Game API again that day.
3. **Given** the Daily Quota is spent, **When** a Member looks up a key that is in the cache, even an
   entry older than 10 minutes, **Then** they get the card with its "as of" time.
4. **Given** the Daily Quota is spent and Neil restarts, **When** a Member looks something up, **Then**
   Neil still does not ask the Game API until 00:00 UTC.
5. **Given** it is 00:00 UTC or later on the next day, **When** a Member looks something up, **Then** Neil
   asks the Game API again.

---

### User Story 3 - Officers see the Daily Quota (Priority: P2)

An Officer runs `/quota` and sees how many Game API requests Neil used today, how many remain, the Daily
Quota's limit, and when it resets.

**Why this priority**: lets Officers judge whether lookups are safe and notice runaway use, but lookups
work without it.

**Independent Test**: on the test server, run `/quota` as a Member with and without the Moderator or King
role; in automated tests, with a fake quota counter.

**Acceptance Scenarios**:

1. **Given** a Member with the Moderator or King role, **When** they run `/quota`, **Then** only they see
   used, remaining and limit for today, the reset time (00:00 UTC) and the time left until it, and when
   those figures were last confirmed by the Game API.
2. **Given** a Member without either role, **When** they run `/quota`, **Then** only they see that
   `/quota` is for Officers, and nothing about the Daily Quota.
3. **Given** `/quota` is run, **When** Neil answers, **Then** no Game API request is made (it shows
   Neil's own count).
4. **Given** Neil has made no Game API request yet today, **When** an Officer runs `/quota`, **Then**
   they see 0 used and the limit last reported by the Game API, marked as not yet confirmed today.

---

### User Story 4 - Short Game API hiccups are retried (Priority: P3)

When the Game API answers "busy" or "took too long", Neil tries again a few times with growing pauses
before telling the Member to try later, so brief outages are invisible.

**Why this priority**: improves reliability, but every retry costs quota, so it is bounded and lowest
priority.

**Independent Test**: in automated tests with a fake clock, let the fake Game API answer 503 then 200,
and 504 every time, and count requests and pauses.

**Acceptance Scenarios**:

1. **Given** the Game API answers 503 once and then the card, **When** a Member looks something up,
   **Then** they get the card.
2. **Given** the Game API answers 503 or 504 every time, **When** a Member looks something up, **Then**
   Neil makes at most 3 requests in total, waits a growing, slightly random pause between them, and the
   Member gets the "try again in a moment" message within the time Discord allows.
3. **Given** the Game API answers 502 (its answer for an unknown uid), 404, 401 or 429, **When** a Member
   looks something up, **Then** Neil does not retry.

### Edge Cases

- The Game API's figures (headers or the `quota` in the body) disagree with Neil's count: Neil takes the
  Game API's figures. A response without figures (404, 504) counts as one request in Neil's own count.
- Failed requests (404, 502, 504) also cost quota and are counted.
- The Game API reports a different limit than before (patron tier changed): Neil uses the new limit.
- A lookup is in flight at 00:00 UTC: it is counted on the day the Game API reports; Neil's count resets
  at 00:00 UTC.
- A failed lookup (404, 502, malformed answer) is not cached; the next lookup asks again.
- A cached "not found" is not kept, so a newly created Player can be found at once.
- Neil's storage cannot be read at startup: Neil refuses to start rather than run without a count.
- The cache is lost on restart; the count is not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST keep each successful Player and Alliance answer from the Game API for at least
  10 minutes (configurable, never shorter than 10 minutes) and serve repeated lookups of the same key
  from it without a Game API request.
- **FR-002**: Lookup keys MUST be normalised: a Player by uid; an Alliance by Kingdom and tag, ignoring
  letter case and surrounding spaces.
- **FR-003**: Concurrent lookups of the same key MUST share one Game API request.
- **FR-004**: Every card MUST show the time its data was fetched from the Game API ("as of HH:MM UTC").
- **FR-005**: Neil MUST count every Game API request per UTC day, including failed ones, in storage that
  survives restarts and redeploys.
- **FR-006**: Whenever a Game API answer carries quota figures (remaining, limit), Neil MUST adopt them
  over its own count.
- **FR-007**: Neil MUST NOT send a Game API request when the Daily Quota is spent for the current UTC
  day, or after a 429 on that day, until 00:00 UTC.
- **FR-008**: With the Daily Quota spent, Neil MUST serve a cached answer for the requested key if one
  exists, even past its freshness window; otherwise it MUST tell only the requesting Member that the
  Daily Quota is spent and when it resets (00:00 UTC and the time left).
- **FR-009**: On 503 or 504, Neil MUST retry with growing, jittered pauses, at most 3 requests per
  lookup in total, and only while the Daily Quota allows; all other failures MUST NOT be retried.
- **FR-010**: Neil MUST offer `/quota`, answered only to the caller, showing used, remaining and limit
  for the current UTC day, the reset time and the time left, and when the figures were last confirmed
  by the Game API; it MUST NOT make a Game API request.
- **FR-011**: Only Officers (Members with the configured Moderator or King role) MUST be able to see
  the Daily Quota through `/quota`; others get a short refusal, visible only to them.
- **FR-012**: The Moderator and King role IDs MUST be configuration; Neil MUST refuse to start if they
  are missing or invalid.
- **FR-013**: All quota and cache behaviour MUST live in the one Game API client; no other code may call
  the Game API (constitution IV).
- **FR-014**: Automated tests MUST use a fake clock and a fake Game API; none may wait in real time.

### Key Entities

- **Daily Quota**: the number of Game API requests Neil may make per UTC day; has a limit (reported by the
  Game API), a used count, a remaining count, the day it belongs to, whether it was spent by a 429, and
  when the Game API last confirmed it. Resets at 00:00 UTC.
- **Cached answer**: a Player or Alliance answer with the time it was fetched and its lookup key.
- **Officer**: a Member with the Moderator or King role.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A second lookup of the same Player or Alliance within 10 minutes costs no Game API request
  (verified in automated tests) and answers in under 2 seconds.
- **SC-002**: Neil never sends a Game API request after the Daily Quota is known to be spent for the day,
  including across a restart (verified in automated tests).
- **SC-003**: Neil's count after a restart equals its count before it.
- **SC-004**: A Member who hits the spent Daily Quota can tell from the message alone when lookups work
  again.
- **SC-005**: A single 503 or 504 does not reach the Member; no lookup costs more than 3 requests.
- **SC-006**: An Officer can read today's remaining Daily Quota with one command, without spending any.

## Assumptions

- The Daily Quota's limit is what the Game API last reported (2,000 for our patron key); before any
  report, Neil assumes 1,000, the free tier, to stay safe.
- Only the requested key is cached: a `/player` answer's roster is not used to answer other Players
  (simplest, and their profile fields would be missing). Rosters may be reused in a later slice.
- The cache lives in memory; losing it on restart costs at most one request per key. The count is
  persisted (ADR 5, SQLite).
- Retry pauses start around 1 second and double, with jitter. A whole lookup, retries included, gives up
  after 20 seconds (slice 002's SC-001), so a retry is only made if there is time left for it.
- No Quota Reserve and no per-purpose shares in this slice (Clarifications); ADR 4's shares arrive when
  there is a second purpose.
- `/quota` is registered like the other commands, for the configured server only; visibility is checked
  by Neil, not by Discord command permissions, so the role check is testable.
- The test-server check (repeated `/player`, `/quota` with and without the role) is a manual step recorded
  in `tasks.md`.
