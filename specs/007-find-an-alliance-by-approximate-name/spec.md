# Feature Specification: Find an alliance by approximate name

**Feature Branch**: `007-find-an-alliance-by-approximate-name` (stacked on `006-give-a-member-their-name-and-roles`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "Find an alliance by approximate name: a part of the name or a near spelling finds the
Alliance. The Game API matches only the exact full name or tag, so Neil must match names itself, against Alliances it
has already seen." (ROADMAP, Later.)

## Clarifications

### Session 2026-11-02

- Q: How do Members find an Alliance? → A: both: `/alliance` suggests Known Alliances while typing, and an exact
  name the Game API does not know gets a pick list of close Known Alliances.
- Q: Which Alliances does Neil remember? → A: Home Kingdom only.
- Q: Forget? → A: an Alliance not seen for 30 days is forgotten.
- Q: Dictionary? → A: Known Alliance approved (2026-11-02).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Suggestions while typing (Priority: P1)

A Member types `/alliance` and starts typing a name or tag. Discord shows up to 25 Known Alliances that match a part
of the name or tag or a near spelling, best first, as `[TAG] Name`. Picking one fills in the full name (or tag).

**Why this priority**: Members rarely know an Alliance's exact full name; suggestions cost no Daily Quota.

**Independent Test**: automated: Known Alliances `NML No Man's Land`, `NMA Night Mares`; typing `man` suggests
`[NML] No Man's Land` first; `no mans` and `No Mna's Land` find it too; no Game API request.

**Acceptance Scenarios**:

1. **Given** Known Alliances, **When** a Member types part of a name or tag in `name` or `tag`, **Then** up to 25
   matching Known Alliances are suggested, best match first, with no Game API request.
2. **Given** a near spelling (a letter missing, swapped or wrong, letter case, accents, apostrophes and spaces
   ignored), **When** typed, **Then** the Alliance is suggested.
3. **Given** nothing typed yet, **When** the option is focused, **Then** the most recently seen Known Alliances are
   suggested.
4. **Given** no Known Alliance matches, **When** typing, **Then** no suggestions are shown and the Member can still
   send any text.

---

### User Story 2 - A pick list when the exact name finds nothing (Priority: P2)

A Member sends `/alliance name:<text>` that is not an exact full name. The Game API finds nothing, so Neil shows a
private pick list of close Known Alliances; picking one shows that Alliance as usual.

**Why this priority**: autocomplete can be skipped (typing fast, pasting); the Member should still get there.

**Independent Test**: automated: `/alliance name:no mans` → Game API not found → pick list `[NML] No Man's Land`;
picking it looks up `NML` in the Home Kingdom (one request) and posts the Alliance card.

**Acceptance Scenarios**:

1. **Given** the Game API finds no Alliance by that full name, **When** close Known Alliances exist, **Then** the
   Member privately gets a pick list (up to 25, `[TAG] Name`) instead of "not found".
2. **Given** the Member picks one, **When** Neil answers, **Then** it looks the Alliance up by tag in the Home Kingdom
   (one request, lookup purpose) and shows the usual card.
3. **Given** no Known Alliance is close, **When** the Game API finds nothing, **Then** the not-found answer is as
   before.
4. **Given** `/alliance tag:<tag>` without a Kingdom, **When** sent, **Then** the Home Kingdom is used.

---

### User Story 3 - Neil learns and forgets Alliances (Priority: P2)

Every Game API answer that shows a Home Kingdom Alliance (a Player's Alliance or an Alliance looked up) makes it a
Known Alliance or refreshes it. An Alliance not seen for 30 days is forgotten.

**Independent Test**: automated: a Player lookup with an Alliance in Kingdom 330 records it; one in another Kingdom
does not; after 30 days without a sighting it is no longer suggested.

**Acceptance Scenarios**:

1. **Given** a Game API answer with a Home Kingdom Alliance, **When** it arrives, **Then** that Alliance's tag, full
   name and the time are stored (a new name for the same tag replaces the old one).
2. **Given** an Alliance of another Kingdom, **When** seen, **Then** it is not stored.
3. **Given** a Known Alliance last seen more than 30 days ago, **When** suggestions or matches are made, **Then** it is
   left out, and it is deleted at the next start.

### Edge Cases

- Two Known Alliances equally close: the more recently seen comes first.
- A tag and a name both match: a tag match outranks a name match of the same kind.
- A very short query (1 letter): only tag or name prefixes match, no near spelling.
- An autocomplete answer must arrive within Discord's 3 seconds; matching runs on stored data only.
- Alliance names with Discord markdown: suggestion and pick-list labels are plain text; the pick list's message text escapes them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST record each Home Kingdom Alliance seen in a Game API answer (Kingdom, tag, full name, last
  seen) and MUST NOT record other Kingdoms' Alliances.
- **FR-002**: `/alliance` `name` and `tag` options MUST autocomplete from Known Alliances (up to 25, best first,
  `[TAG] Name`), without Game API requests.
- **FR-003**: Matching MUST find an Alliance by a part of its name or tag and by near spelling (case, accents,
  punctuation and spaces ignored; small edit distance), ranking exact > prefix > part > near spelling, tag before
  name, then most recently seen.
- **FR-004**: When the Game API finds no Alliance by the full name sent, Neil MUST offer a private pick list of close
  Known Alliances; a pick looks the Alliance up by tag in the Home Kingdom (one request, lookup purpose).
- **FR-005**: `/alliance tag:` without a Kingdom MUST use the Home Kingdom.
- **FR-006**: Known Alliances not seen for 30 days MUST be left out of matching and deleted at startup.
- **FR-007**: Lookups stay within the Daily Quota and leave the Quota Reserve alone (slice 004).

### Key Entities

- **Known Alliance**: Kingdom (always the Home Kingdom), tag, full name, last seen. Not personal data.

## Success Criteria *(mandatory)*

- **SC-001**: A Member finds a Home Kingdom Alliance Neil has seen by typing any 3 consecutive letters of its name or
  tag.
- **SC-002**: Suggestions cost no Game API request.
- **SC-003**: A misspelling with one wrong, missing or swapped letter still finds the Alliance.

## Assumptions

- Alliances are seen often enough (lookups, Interviews, the startup apply of slice 006) that Known Alliances fill up
  over days; there is no Game API list of a Kingdom's Alliances.
- The manual test-server check is collected in TEST-RUN.md and run later by the user.
