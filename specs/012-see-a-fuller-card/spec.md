# Feature Specification: See a fuller card

**Feature Branch**: `012-see-a-fuller-card` (stacked on `011-correct-a-link`)

**Created**: 2026-11-02

**Status**: Draft

**Input**: User request (2026-11-02): "include whatever is confirmed and stable [from the Game API]. Also try to make
the card visually pleasing and easy to read." Field selection and pictures approved by the user the same day.

## Clarifications

### Session 2026-11-02 (discovery)

- Q: Which Game API fields count as "confirmed and stable"? → A: those present with the same type and a clear meaning
  in all live samples taken on 2026-11-02 (4 Player answers, 2 Alliance answers) and in the recorded fixtures. Left
  out: gender and skin names (often empty), shield fields (always 0, meaning unclear), power breakdown (always empty),
  history (only power changes seen), the always-empty `ranks`, bulletin and declaration (always empty), `live`
  (meaning unknown), and the tracker's own first/last seen times.
- Q: Which groups go on the cards? → A: all four (user, 2026-11-02): Player stats (Kills, VIP Level, Likes, Last Online,
  Language), Player Location, Alliance stats (Alliance Level with XP, Gift Level, Kingdom Might Rank, Language) and
  Join Requirements.
- Q: Pictures from the tracker? → A: yes: the Player's avatar, the Alliance badge and the Kingdom badge.
- Q: Dictionary? → A: Kills, VIP Level, Likes, Last Online, Language, Location, Alliance Level, Gift Level, Kingdom
  Might Rank and Join Requirements are added (approved with the field groups, 2026-11-02).

### Session 2026-11-03 (test run feedback)

- Q: A Player without a Last Online? → A: is online now (user, 2026-11-03): the Player card reads "Online now", and
  the Alliance Overview counts and shows such a member as online.
- Q: The Alliance Overview's look? → A: like the Alliance card (user, 2026-11-03): accent color, Kingdom author line
  with badge, Alliance badge, totals and online counts as a 3-column grid, the Top lists side by side, Might in the
  member table rows. It was out of scope before; now US3.
- Q: The Overview's member table? → A: sorted by Might, with buttons to sort by the other columns, as a card with real
  columns (user, 2026-11-03): a monospace table in a code block (US4). "Power" is renamed Might everywhere (dictionary,
  2026-11-03).
- The "Unknown interaction" on the roster's Next button came from two Neils (local and Wispbyte) answering one press;
  no change (TEST-RUN.md 0.6 already says to stop Neil on Wispbyte).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member sees a fuller Player card (Priority: P1)

A Member runs `/player` (by name or uid, or picks one from a pick list). The card shows, besides what it shows today
(name, Kingdom, Might, sanctuary level, Alliance, Alliance Rank), the Player's Kills, VIP Level, Likes, Last Online,
Language and Location, with the Player's avatar as a picture and the Kingdom's badge beside the Kingdom. Related
values sit together in a clear grid, so the card reads at a glance.

**Why this priority**: `/player` is the most-used lookup; every value is already in the answer Neil gets, so it costs
no Daily Quota.

**Independent Test**: automated: the Player card built from the recorded Player answer shows every new value, the
pictures and the accent color, within Discord's limits; an answer missing any new field still gives a card.

**Acceptance Scenarios**:

1. **Given** a Player answer with all new fields, **When** the card is built, **Then** it shows Kills and Likes with
   thousands separators, VIP Level as a number, Last Online as a time ago ("3 days ago"), Language as a language name
   ("Japanese" for `ja`), Location as `X:807 Y:846`, the avatar as the card's picture and the Kingdom badge beside
   "Kingdom #1".
2. **Given** a Player answer where a new field is missing, empty or of the wrong type, **Then** that value is left off
   the card and everything else shows as before; the lookup never fails because of it.
3. **Given** a Player in no Alliance, **Then** the card shows "No alliance" and no Alliance Rank, as today.
4. **Given** a Player name or a value containing Discord formatting, **Then** it shows as plain text (escaped), as today.

---

### User Story 2 - A Member sees a fuller Alliance card (Priority: P1)

A Member runs `/alliance` (by tag, name, suggestion or pick list). The card shows, besides today's values (tag, name,
Kingdom, Might, Members, Leader, roster), the Alliance Level with its XP, the Gift Level, the Kingdom Might Rank, the
Language and the Join Requirements, with the Alliance badge as a picture and the Kingdom badge beside the Kingdom.
Each roster row also shows the member's Might in short form (27.6M), so the strongest members stand out.

**Why this priority**: as US1; the Alliance card is what Officers and recruits look at to judge an Alliance.

**Independent Test**: automated: the Alliance card built from the recorded Alliance answer shows the new values, the
pictures and the Might on each roster row, stays within Discord's limits on every roster page, and an answer missing
any new field still gives a card.

**Acceptance Scenarios**:

1. **Given** an Alliance answer with all new fields, **When** the card is built, **Then** it shows "Level 4 · 8,881,750
   XP", Gift Level 6, "#24 in Kingdom #1", "Japanese" and the Join Requirements, and the badge as the card's picture.
2. **Given** Join Requirements that let anyone join with no minimum, **Then** they read "Open to all"; **given** joining
   needs an application, **Then** "By application"; **given** a minimum Might or sanctuary level above 0, **Then**
   each minimum is added ("min. 10M Might", "min. sanctuary level 15"); a minimum of 0 is not shown.
3. **Given** a roster row with a Might, **Then** the row reads "Name · 27.6M"; **given** none, **Then** just the name.
4. **Given** an Alliance answer where a new field is missing or unreadable, **Then** that value is left off and the
   card shows as before; the lookup never fails because of it.
5. **Given** the roster page turns with the roster menu (slice 004, fix #19), **Then** the new values stay the same on
   every page and the card still fits Discord's limits.

---

### User Story 3 - A Member sees an Alliance Overview that looks like the card (Priority: P2)

A Member presses Overview on an Alliance card. The private Alliance Overview carries the card's look: accent color,
"Kingdom #N" with the Kingdom badge, the Alliance badge as the picture, the totals and online counts in a 3-column grid,
the three Top lists side by side, and each member table row with the member's Might in short form.

**Independent Test**: automated: the Overview built from a roster with details shows color, author, thumbnail, inline
fields and Might on rows, and stays within Discord's limits on every page.

**Acceptance Scenarios**:

1. **Given** an Alliance with details, **When** the Overview is built, **Then** it has the card's color, author line and
   badge thumbnail, and the totals, online counts and Top lists are inline fields.
2. **Given** a member with a Might, **Then** the table row reads `Name · 27.6M · …`; **given** none, the Might is left out.
3. **Given** an Alliance without details, **Then** the Overview still shows, with "Kingdom #N" and no pictures.
4. **Given** a member without a Last Online, **Then** the table shows them "online" and they count in Online now and
   Online in the last 24 hours.

---

### User Story 4 - A Member sorts the Alliance Overview's member table (Priority: P2)

The member table is a card of its own under the overview: the card's color, the Kingdom author line, the title
"Members · sorted by <column>", and one monospace table with real columns: #, Name, Might, Weekly, Honor, Tech, Last
Online. It is sorted by Might first. A row of buttons sorts it by Might, Weekly Activity, Daily Honor, Daily Tech or Last
Online; the page buttons keep the sort.

**Acceptance Scenarios**:

1. **Given** an Overview is opened, **Then** the table is sorted by Might, highest first, members without Might last.
2. **Given** the Member presses "Daily Honor", **Then** the table shows page 1 sorted by Daily Honor (highest first, no
   data last), the pressed button is highlighted, and Previous/Next keep that sort.
3. **Given** "Last Online", **Then** members online now come first, then the most recently online.
4. **Given** a name with a backtick, a long name or a missing value, **Then** the columns stay aligned (names cut to a
   fixed width, "–" for a missing value) and the code block is never broken.
5. **Given** a page button sent before this change (no sort in its id), **Then** it still turns the page, sorted by Might.

---

### Edge Cases

- A picture path that is missing, empty or not a tracker `/static/` path: that picture is left out; Neil never puts
  any other address on a card.
- The tracker is down when Discord fetches a picture: Discord shows the card without it; Neil does nothing.
- Last Online in the future or under a minute ago (clock skew): "just now". Older than a year: still a time ago in days.
- An unknown Language code: shown as the code in capitals ("XX"); an empty one is left out.
- No Last Online (missing, 0 or unreadable): the Player is online now ("Online now" on the Player card).
- Location 0:0 is shown as given (its meaning is not known).
- Long names with Might added to roster rows: the roster section still keeps to Discord's field and card limits (rows
  that do not fit are counted in the "and N more" note, as today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Player card MUST show, when the Game API gives them: Kills, VIP Level, Likes, Last Online (time ago),
  Language (language name) and Location (`X:<x> Y:<y>`), next to today's values.
- **FR-002**: The Alliance card MUST show, when the Game API gives them: Alliance Level with XP, Gift Level, Kingdom
  Might Rank, Language and Join Requirements, next to today's values.
- **FR-003**: Each Alliance card roster row MUST show the member's Might in short form (K, M, B, one decimal at most)
  when the Game API gives it.
- **FR-004**: Cards MUST show the Player's avatar (Player card) or the Alliance badge (Alliance card) as the picture,
  and the Kingdom badge beside the Kingdom, built only from the tracker's own address and a `/static/` path from the
  answer; any other path is ignored.
- **FR-005**: Every new value MUST be read leniently: a missing, empty or wrongly typed value leaves only that value
  off the card; it never makes a lookup fail and never changes the values shown today.
- **FR-006**: Cards MUST use a consistent accent color and group related values (identity, strength, activity,
  membership) in a readable grid; numbers use thousands separators (short form only on roster rows).
- **FR-007**: Cards MUST stay within Discord's limits (field value 1,024, card 6,000 characters) on every roster page,
  and every Game API text MUST be escaped, as today.
- **FR-008**: The slice MUST NOT add any Game API request; all values come from answers Neil already gets.
- **FR-009**: A Player or roster member without a Last Online MUST be treated as online now: "Online now" on the
  Player card; "online" in the Alliance Overview table and counted in its online counts.
- **FR-011**: The Alliance Overview's member table MUST be a monospace table (one code block) with the columns #, Name,
  Might, Weekly, Honor, Tech, Last (Last Online), sorted by Might by default, with buttons to sort by each figure column; only
  the Member who pressed Overview may sort it, and sorting asks the Game API nothing.
- **FR-010**: The Alliance Overview MUST use the Alliance card's look (FR-004, FR-006) and show Might in short form on
  each member table row, within Discord's limits (FR-007).

### Key Entities

- **Player** (extended): Kills, VIP Level, Likes, Last Online, Language, Location, avatar and Kingdom badge pictures.
- **Alliance** (extended): Alliance Level and XP, Gift Level, Kingdom Might Rank, Language, Join Requirements, badge
  and Kingdom badge pictures.
- **Alliance Roster** entry (extended): the member's Might.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Player card built from a full answer shows all 6 new Player values and both pictures; an Alliance card
  shows all 5 new Alliance values, both pictures and a Might on every roster row.
- **SC-002**: 0 lookups fail because a new field is missing or malformed (tested for each new field).
- **SC-003**: The daily Game API request count for the same lookups is unchanged.
- **SC-004**: On the test server, a Member reads a Player's Might, Alliance and Last Online from the card in under 5
  seconds (manual check, TEST-RUN.md).

## Assumptions

- The tracker serves the pictures at `https://lastasylumtracker.com/static/…` (checked 2026-11-02: 200, PNG).
- `rank.rank` in the Alliance answer is the Alliance's power rank in its Kingdom (its score equalled the Alliance's
  power in both samples).
- `join.castle_level` is the minimum sanctuary level; `join.auto: true` means anyone may join without an application.
- `last_online_at` on the Player answer is the Player's last time online in the game (it matched the roster's value).
- The Onboarding Interview's confirmation card is out of scope; it keeps its look. (The Alliance Overview was out of
  scope until 2026-11-03; now US3.)
