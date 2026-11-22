# Feature Specification: Search for an alliance

**Feature Branch**: `048-search-for-an-alliance`

**Created**: 2026-11-22

**Status**: Draft

**Input**: User description: "Neil has a bug in alliance search: the tag argument only works with the full alliance
name. Build a search command that handles the arguments for the Game API request instead of mapping them straight
together. Default is searching by name. Suggestions filtered to the criteria are fine: with kingdom 330 set, only 330
results show."

## Clarifications

### Session 2026-11-22

- Q: The bug? → A: typing `REB` in `tag` showed `[REB] Rebirth` in the box. Discord shows a picked suggestion's label,
  not its value; two options (`name`, `tag`) that each suggest `[TAG] Name` make this look like the tag was replaced
  by the name. The Game API itself finds `REB` in Kingdom 330 by tag, in any letter case (checked 2026-11-22).
- Q: Options? → A: one `search` text and an optional `kingdom`; Neil decides how to ask the Game API.
- Q: Which Alliances does Neil remember? → A: every Kingdom's, from any fresh Game API answer (was: Home Kingdom only,
  slice 007).
- Q: No Kingdom given? → A: the Home Kingdom; suggestions and results only from it.
- Found 2026-11-22: the Game API's name lookup now matches tags as well as full names, across all Kingdoms
  (`name/REB` gave an ambiguous list of `REB` Alliances in many Kingdoms, each with Kingdom, tag and name). There is
  still no partial-name search.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search an Alliance in a Kingdom (Priority: P1)

A Member types `/alliance search:<text>`, optionally with `kingdom:<number>`. Neil reads the text as an Alliance name
by default, but a tag works too. Only Alliances of that Kingdom (the Home Kingdom when none is given) are shown: a
single match is shown as the usual Alliance card, several as a private pick list.

**Why this priority**: it is the command; today it fails Members who know only a tag or part of a name.

**Independent Test**: automated, with a fake Game API: `/alliance search:Rebirth` and `/alliance search:REB` both
show the card of `[REB] Rebirth` (Kingdom 330); `/alliance search:REB kingdom:1` shows no Kingdom 330 Alliance.

**Acceptance Scenarios**:

1. **Given** no Kingdom, **When** a Member searches a full name of a Home Kingdom Alliance, **Then** its card is shown.
2. **Given** no Kingdom, **When** a Member searches a Home Kingdom Alliance's tag (any letter case), **Then** its card
   is shown.
3. **Given** `kingdom:K`, **When** the Game API's answer holds Alliances of several Kingdoms, **Then** only those of K
   count: one is shown as a card, several as a private pick list, none as "not found in Kingdom K".
4. **Given** the text matches a Known Alliance of K exactly (tag or name, case and punctuation ignored), **When**
   sent, **Then** Neil looks it up by tag in K directly.
5. **Given** nothing of K is found, **When** close Known Alliances of K exist, **Then** the Member privately gets a
   pick list of them (as in slice 007); otherwise the not-found answer names the text and K.
6. **Given** an empty or too long text, or an invalid Kingdom, **When** sent, **Then** the Member is told privately
   at once and nothing is asked of the Game API.

---

### User Story 2 - Suggestions for the chosen Kingdom (Priority: P1)

While typing in `search`, Discord suggests Known Alliances of the chosen Kingdom (the Home Kingdom when `kingdom` is
empty), labelled `[TAG] Name`. Picking one makes the lookup exact.

**Why this priority**: suggestions are free (no Daily Quota) and stop Members from guessing names.

**Independent Test**: automated: Known Alliances `[REB] Rebirth` (330) and `[NML] No Man's Land` (1); with
`kingdom:1` typed, `n` suggests only `[NML] No Man's Land`; with no Kingdom, `re` suggests only `[REB] Rebirth`;
picking `[REB] Rebirth` and sending looks up `REB` in 330 with one request.

**Acceptance Scenarios**:

1. **Given** `kingdom` is set, **When** the Member types in `search`, **Then** only Known Alliances of that Kingdom are
   suggested (up to 25, best first, slice 007 matching).
2. **Given** `kingdom` is empty, **When** typing, **Then** only Home Kingdom Known Alliances are suggested.
3. **Given** nothing typed yet, **When** `search` is focused, **Then** that Kingdom's most recently seen Known
   Alliances are suggested.
4. **Given** a picked suggestion, **When** sent, **Then** Neil looks that Alliance up by Kingdom and tag (one request).
5. **Given** a picked suggestion of Kingdom A and `kingdom:B` set afterwards, **When** sent, **Then** the `kingdom`
   option wins and the picked tag is searched in B.

---

### User Story 3 - Neil remembers Alliances of every Kingdom (Priority: P2)

Every fresh Game API answer that shows an Alliance (a Player's Alliance, an Alliance looked up, or the Alliances in an
ambiguous name answer) makes it a Known Alliance or refreshes it, whatever its Kingdom.

**Independent Test**: automated: a Player lookup in Kingdom 1 records that Player's Alliance; an ambiguous name answer
records each listed Alliance with its Kingdom; after 30 days unseen they are forgotten.

**Acceptance Scenarios**:

1. **Given** a fresh answer with an Alliance of any Kingdom, **When** it arrives, **Then** Kingdom, tag, name and the
   time are stored.
2. **Given** an ambiguous name answer, **When** it arrives, **Then** each listed Alliance is stored.
3. **Given** the features that offer only Home Kingdom Alliances (City Rotation, NaP), **When** they suggest or match,
   **Then** they still offer only Home Kingdom Alliances.

### Edge Cases

- A tag that is also another Alliance's name in the same Kingdom: both are matches; several give a pick list.
- The same tag in many Kingdoms (common: `REB`): only the chosen Kingdom's counts.
- A pick-list choice is looked up by Kingdom and tag (one request each), so its card is exact.
- Alliance names with Discord markdown are plain text in labels and escaped in message text (as before).
- A copy (stale) answer still works when the Daily Quota is spent, as for every lookup (slice 004).
- Autocomplete must answer within Discord's 3 seconds: it reads stored Known Alliances only, never the Game API.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `/alliance` MUST take a required `search` text (1–40 characters) and an optional `kingdom`; the old
  `name` and `tag` options are removed (not live yet, no backwards compatibility).
- **FR-002**: Without `kingdom`, the Home Kingdom MUST be meant, for suggestions and for results.
- **FR-003**: Neil MUST read `search` as a name by default and decide the Game API request itself: a picked
  suggestion, or text equal to a Known Alliance of the Kingdom, is looked up by Kingdom and tag; any other text by
  the name lookup, which also matches tags.
- **FR-004**: Results MUST be filtered to the Kingdom: one match is a card, several a private pick list (up to 25,
  `[TAG] Name`), none the slice 007 close-Known-Alliances pick list or a not-found answer naming the text and Kingdom.
- **FR-005**: `search` MUST autocomplete from Known Alliances of the Kingdom only, labelled `[TAG] Name`, with no
  Game API request; a choice's value identifies Kingdom and tag.
- **FR-006**: Neil MUST record Alliances of every Kingdom from fresh Game API answers, including each Alliance listed
  in an ambiguous name answer; forgetting after 30 days stays.
- **FR-007**: Features that offer Home Kingdom Alliances (City Rotation, NaP) MUST keep offering only those.
- **FR-008**: Lookups stay within the Daily Quota and leave the Quota Reserve alone (slice 004); a search costs at most
  two requests (the name lookup, then a tag lookup for a single Kingdom match without its full data).

### Key Entities

- **Known Alliance** (changed): an Alliance of **any** Kingdom Neil has seen in a fresh Game API answer in the last
  30 days: Kingdom, tag, name, last seen. Dictionary change needs the user's approval.

## Success Criteria *(mandatory)*

- **SC-001**: A Member finds a Home Kingdom Alliance by its full name or its tag in one command, without naming a
  Kingdom.
- **SC-002**: With a Kingdom set, no suggestion or result from another Kingdom is shown.
- **SC-003**: Suggestions cost no Game API request; a search costs at most two.

## Assumptions

- The Game API's name lookup matching tags (seen 2026-11-22) is recorded in GAME-API.md; if it stops, a tag still
  works through Known Alliances (FR-003) and the close-match pick list.
- Smoke test on test Neil through Neil Police only what Police can arrange and read back (ADR 29); Police cannot run
  slash commands, so the command itself is covered by automated tests.
