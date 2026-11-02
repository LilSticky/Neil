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
  Language), Player Location, Alliance stats (Alliance Level with XP, Gift Level, Kingdom Power Rank, Language) and
  Join Requirements.
- Q: Pictures from the tracker? → A: yes: the Player's avatar, the Alliance badge and the Kingdom badge.
- Q: Dictionary? → A: Kills, VIP Level, Likes, Last Online, Language, Location, Alliance Level, Gift Level, Kingdom
  Power Rank and Join Requirements are added (approved with the field groups, 2026-11-02).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Member sees a fuller Player card (Priority: P1)

A Member runs `/player` (by name or uid, or picks one from a pick list). The card shows, besides what it shows today
(name, Kingdom, Power, sanctuary level, Alliance, Alliance Rank), the Player's Kills, VIP Level, Likes, Last Online,
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
Kingdom, Power, Members, Leader, roster), the Alliance Level with its XP, the Gift Level, the Kingdom Power Rank, the
Language and the Join Requirements, with the Alliance badge as a picture and the Kingdom badge beside the Kingdom.
Each roster row also shows the member's power in short form (27.6M), so the strongest members stand out.

**Why this priority**: as US1; the Alliance card is what Officers and recruits look at to judge an Alliance.

**Independent Test**: automated: the Alliance card built from the recorded Alliance answer shows the new values, the
pictures and the power on each roster row, stays within Discord's limits on every roster page, and an answer missing
any new field still gives a card.

**Acceptance Scenarios**:

1. **Given** an Alliance answer with all new fields, **When** the card is built, **Then** it shows "Level 4 · 8,881,750
   XP", Gift Level 6, "#24 in Kingdom #1", "Japanese" and the Join Requirements, and the badge as the card's picture.
2. **Given** Join Requirements that let anyone join with no minimum, **Then** they read "Open to all"; **given** joining
   needs an application, **Then** "By application"; **given** a minimum power or sanctuary level above 0, **Then**
   each minimum is added ("min. 10M power", "min. sanctuary level 15"); a minimum of 0 is not shown.
3. **Given** a roster row with a power, **Then** the row reads "Name · 27.6M"; **given** none, **Then** just the name.
4. **Given** an Alliance answer where a new field is missing or unreadable, **Then** that value is left off and the
   card shows as before; the lookup never fails because of it.
5. **Given** the roster page turns with the roster menu (slice 004, fix #19), **Then** the new values stay the same on
   every page and the card still fits Discord's limits.

---

### Edge Cases

- A picture path that is missing, empty or not a tracker `/static/` path: that picture is left out; Neil never puts
  any other address on a card.
- The tracker is down when Discord fetches a picture: Discord shows the card without it; Neil does nothing.
- Last Online in the future or under a minute ago (clock skew): "just now". Older than a year: still a time ago in days.
- An unknown Language code: shown as the code in capitals ("XX"); an empty one is left out.
- Location 0:0 is shown as given (its meaning is not known).
- Long names with power added to roster rows: the roster section still keeps to Discord's field and card limits (rows
  that do not fit are counted in the "and N more" note, as today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Player card MUST show, when the Game API gives them: Kills, VIP Level, Likes, Last Online (time ago),
  Language (language name) and Location (`X:<x> Y:<y>`), next to today's values.
- **FR-002**: The Alliance card MUST show, when the Game API gives them: Alliance Level with XP, Gift Level, Kingdom
  Power Rank, Language and Join Requirements, next to today's values.
- **FR-003**: Each Alliance card roster row MUST show the member's power in short form (K, M, B, one decimal at most)
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

### Key Entities

- **Player** (extended): Kills, VIP Level, Likes, Last Online, Language, Location, avatar and Kingdom badge pictures.
- **Alliance** (extended): Alliance Level and XP, Gift Level, Kingdom Power Rank, Language, Join Requirements, badge
  and Kingdom badge pictures.
- **Alliance Roster** entry (extended): the member's power.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Player card built from a full answer shows all 6 new Player values and both pictures; an Alliance card
  shows all 5 new Alliance values, both pictures and a power on every roster row.
- **SC-002**: 0 lookups fail because a new field is missing or malformed (tested for each new field).
- **SC-003**: The daily Game API request count for the same lookups is unchanged.
- **SC-004**: On the test server, a Member reads a Player's power, Alliance and Last Online from the card in under 5
  seconds (manual check, TEST-RUN.md).

## Assumptions

- The tracker serves the pictures at `https://lastasylumtracker.com/static/…` (checked 2026-11-02: 200, PNG).
- `rank.rank` in the Alliance answer is the Alliance's power rank in its Kingdom (its score equalled the Alliance's
  power in both samples).
- `join.castle_level` is the minimum sanctuary level; `join.auto: true` means anyone may join without an application.
- `last_online_at` on the Player answer is the Player's last time online in the game (it matched the roster's value).
- The Onboarding Interview's confirmation card and the Alliance Overview are out of scope; they keep their look.
