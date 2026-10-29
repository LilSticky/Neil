# Feature Specification: Look up a player

**Feature Branch**: `002-look-up-a-player`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Slice 002 'Look up a player': any Member runs `/player` with a player uid and
sees a profile card with the Player's nick, kingdom, power, level, alliance (tag and name) and Alliance
Rank (R1–R5, or unknown when no roster row); and `/alliance` with kingdom + alliance tag/name to see the
Alliance card (name, tag, kingdom, power, member count/capacity, leader). Uses only the verified Game API
endpoints through the Game API client (auth, User-Agent, schema validation, error mapping), with recorded
fixtures for tests. Caching and quota budgeting are slice 003, out of scope here."

## Clarifications

### Session 2026-10-29

- Q: Are Kingdom, Alliance and Alliance Rank confirmed dictionary terms? → A: Yes, as proposed in
  discovery; Member, Player and Game API are confirmed too.
- Q: Who may run `/player` and `/alliance`? → A: Any Member. The data is public in the tracker; protecting
  the daily quota is slice 003.
- Q: Who sees the answer? → A: The card is visible to the whole channel; error messages only to the
  Member who ran the command.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Look up a Player by uid (Priority: P1)

A Member runs `/player` with a Player's uid and sees a profile card in the channel: the Player's name,
Kingdom, power, sanctuary level, Alliance (tag and name) and Alliance Rank.

**Why this priority**: reading one Player by uid is exactly what the Onboarding Interview (slice 004) and
the nickname and roles (slice 005) depend on. It proves the Game API connection end to end.

**Independent Test**: run `/player` with a known uid on the test server and compare the card with the
tracker's data for that Player; in automated tests, with recorded Game API answers.

**Acceptance Scenarios**:

1. **Given** a Player in an Alliance whose roster lists them, **When** a Member runs `/player` with that
   uid, **Then** the channel sees a card with the Player's name, uid, Kingdom, power, sanctuary level,
   Alliance tag and name, and Alliance Rank (R1–R5).
2. **Given** a Player whose Alliance roster has no row for them, **When** a Member looks them up,
   **Then** the card shows the Alliance and states the Alliance Rank as unknown.
3. **Given** a Player in no Alliance, **When** a Member looks them up, **Then** the card says the Player
   has no Alliance and shows no Alliance Rank.
4. **Given** a uid the Game API does not know, **When** a Member looks it up, **Then** only that Member
   sees a message that no Player has this uid.
5. **Given** an input that is not a uid (letters, empty, negative), **When** a Member runs `/player`,
   **Then** only that Member sees a message explaining what a uid looks like and how to find it in the
   game, and the Game API is not asked.

---

### User Story 2 - Look up an Alliance (Priority: P2)

A Member runs `/alliance` with a Kingdom number and an Alliance tag (or name) and sees an Alliance card:
name, tag, Kingdom, power, members out of capacity, and leader.

**Why this priority**: useful for Officers checking an Alliance, but nothing later in the roadmap depends
on it the way slice 004 depends on `/player`.

**Independent Test**: run `/alliance` with Kingdom 1 and tag `NML` on the test server and compare with
the tracker; in automated tests, with recorded Game API answers.

**Acceptance Scenarios**:

1. **Given** an Alliance exists in a Kingdom, **When** a Member runs `/alliance` with that Kingdom and
   its tag, **Then** the channel sees a card with the Alliance's name, tag, Kingdom, power, member count
   and capacity, and leader's name.
2. **Given** no Alliance with that tag or name in that Kingdom, **When** a Member looks it up, **Then**
   only that Member sees a message that no such Alliance was found in that Kingdom.
3. **Given** the tag or name matches more than one Alliance, **When** a Member looks it up, **Then** only
   that Member sees the matches (tag and name) so they can try again with a more exact value.
4. **Given** a Kingdom that is not a positive whole number, **When** a Member runs `/alliance`, **Then**
   only that Member sees an explanation, and the Game API is not asked.

---

### User Story 3 - Clear messages when the Game API cannot answer (Priority: P1)

When the Game API refuses, is busy, is slow or answers with something unexpected, the Member gets a
short, honest message instead of silence or a crash, and the operator finds the reason in Neil's log.

**Why this priority**: a third-party API will fail sometimes; every later slice relies on the client
failing safely.

**Independent Test**: in automated tests, feed each failure (refused key, daily limit, busy, slow,
malformed answer) to the lookup and read the message.

**Acceptance Scenarios**:

1. **Given** the daily quota is spent, **When** a Member looks anything up, **Then** they are told
   lookups are unavailable until the quota resets at 00:00 UTC.
2. **Given** the Game API is busy, times out or cannot prepare the profile, **When** a Member looks
   something up, **Then** they are told to try again in a moment.
3. **Given** the Game API rejects Neil's key, **When** a Member looks something up, **Then** they are
   told lookups are not working right now, and the log records an authentication problem without the
   key.
4. **Given** the Game API answers with data Neil cannot read (missing or wrong fields), **When** a Member
   looks something up, **Then** they get the "not working right now" message and the log records what
   did not match, and no half-filled card is shown.

### Edge Cases

- The Game API takes longer than Discord allows for a first answer: Neil acknowledges the command at
  once and edits in the card or the error when the Game API answers or gives up.
- Very long Player or Alliance names, or names with Discord formatting characters (`*`, `_`, `` ` ``,
  `@`): shown as plain text, never as formatting or mentions.
- Very large numbers (power in the billions): shown with thousands separators.
- The roster lists the Player with an unexpected rank label: treated as an unknown Alliance Rank.
- Alliance names with spaces: accepted; the Kingdom and the tag or name are passed to the Game API
  safely encoded.
- Leading or trailing spaces around a uid or tag are ignored.
- The Game API returns a different Player or Kingdom than asked for: treated as data Neil cannot read.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST offer `/player` with one required option, the Player's uid.
- **FR-002**: Neil MUST offer `/alliance` with two required options: the Kingdom number and the
  Alliance's tag or name.
- **FR-003**: Neil MUST validate the options before asking the Game API and MUST NOT spend quota on
  invalid input.
- **FR-004**: The Player card MUST show the Player's name, uid, Kingdom, power, sanctuary level, Alliance
  (tag and name, or "no Alliance") and Alliance Rank (R1–R5 or unknown).
- **FR-005**: The Alliance Rank MUST come from the Player's row in their Alliance's roster; without a
  row, or with an unrecognised label, it MUST be shown as unknown.
- **FR-006**: The Alliance card MUST show name, tag, Kingdom, power, member count and capacity, and the
  leader's name.
- **FR-007**: Cards MUST be visible in the channel; every error message MUST be visible only to the
  Member who ran the command.
- **FR-008**: Each failure the Game API can report (not found, more than one match, key rejected, daily
  limit reached, busy, could not prepare, too slow) MUST lead to its own Member-facing message as given
  in User Stories 1–3.
- **FR-009**: Every answer from the Game API MUST be checked against the expected shape before it is
  shown; an answer that does not match MUST be treated as a failure.
- **FR-010**: Neil MUST talk to the Game API only through one client that sends the key and a normal
  User-Agent, and uses only the endpoints verified in `GAME-API.md`.
- **FR-011**: Requests to the Game API MUST give up after a bounded time so the Member always gets an
  answer.
- **FR-012**: Neither the key nor any Member input MUST appear unescaped in a card, and the key MUST
  never appear in logs.
- **FR-013**: Both commands MUST be available to every Member of the configured server.
- **FR-014**: Automated tests MUST use recorded Game API answers, not the live Game API.

### Key Entities

- **Player**: a character in the game, found by uid; has a name, Kingdom, power, sanctuary level, and
  optionally an Alliance and an Alliance Rank.
- **Kingdom**: a game server, identified by its number.
- **Alliance**: a group of Players in one Kingdom with a tag and a name; has power, member count,
  capacity, a leader and a roster.
- **Alliance Rank**: R1–R5, a Player's rank in their Alliance, or unknown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Member who runs `/player` with a valid uid sees the card or a clear error within
  10 seconds, every time.
- **SC-002**: For a recorded sample Player, every value on the card matches the tracker's data.
- **SC-003**: Each documented Game API failure, and a malformed answer, produces its intended message in
  automated tests, with no crash and no half-filled card.
- **SC-004**: Invalid input never costs a Game API request (verified in automated tests).
- **SC-005**: A Member can find out how to get a uid from the error message alone, without asking an
  Officer.

## Assumptions

- Every lookup costs one request of the daily quota (2,000 per UTC day); with the bot only on the test
  server, that is fine until slice 003 adds a cache, a reserve and `/quota`.
- The verified endpoints are `GET /players/{uid}` and `GET /alliances/{kingdom}/{alliance}`; the
  alliance endpoint accepts a tag, and the plan checks whether full names with spaces work (open
  question in `GAME-API.md`) while recording fixtures.
- "Too slow" means about 8 seconds per Game API request, so the edited reply still arrives within
  SC-001.
- Numbers are formatted in English (`1,234,567`); the Discord texts are English like `/ping`.
- Images (avatars, flags) from the tracker are not shown in this slice.
- Commands are registered for the configured test server only, as in slice 001.
- The test-server check (a real `/player` and `/alliance`) is a manual step recorded in `tasks.md`
  (Definition of Done).
