---
description: "Task list for slice 012, See a fuller card"
---

# Tasks: See a fuller card

**Input**: [spec.md](spec.md), Game API stability check in [GAME-API.md](../../documentation/GAME-API.md). TDD per
task (`test-first` → `implementer`). No new Game API request (FR-008).

## Plan (short)

- Domain `src/domain/player.ts` (types only, all new values `T | undefined` = the Game gave none readable):
  - `PlayerProfile` gains `readonly details?: PlayerDetails` with `kills`, `vipLevel`, `likes`, `lastOnlineAt: Date`,
    `language: string` (the code), `location: { x: number; y: number }`, `avatarPath`, `kingdomBadgePath`.
    Optional, so Players built elsewhere (Daily Sync roster, Interview store, fixtures) need no change.
  - `Alliance` gains `readonly details?: AllianceDetails` with `level`, `xp`, `giftLevel`, `kingdomPowerRank`,
    `language`, `joinRequirements: { open: boolean; minimumPower: number; minimumSanctuaryLevel: number }`,
    `badgePath`, `kingdomBadgePath`.
  - `RosterEntry` gains `readonly power?: number`.
- Game API `src/game-api/schemas.ts` + `client.ts`: read the new fields leniently (`.nullish().catch(undefined)` per
  field; a bad value never fails the body). Numbers: non-negative integers (`x`, `y` too). `rank` is `{ rank: int ≥ 1 }`
  (score ignored). `join` needs `auto: boolean`, `power` and `castle_level` non-negative integers, else
  undefined. Language: non-empty string, else undefined. A picture path is kept only when it matches
  `^/static/[A-Za-z0-9_\-/]+\.(png|jpe?g|webp|gif)$` (no `..`); else undefined. Player paths: `avatar_url`,
  `server_badge_url`; Alliance: `badge_url`, `server_badge_url`. Roster rows: `power`.
- Discord `src/discord/lookup-cards.ts`:
  - Helpers (exported, tested): `timeAgo(moment, now)`: "just now" (< 1 min or in the future), "N min ago",
    "N h ago", "1 day ago" / "N days ago" (≥ 24 h; days also beyond a year). `compactNumber(n)`: below 1,000 as is,
    else K/M/B with at most one decimal, ".0" dropped, unit chosen after rounding (999,950 → "1M"; 27,626,362 →
    "27.6M"; 1,000 → "1K"). `languageName(code)`: English name (`ja` → "Japanese") via `Intl.DisplayNames`; a code it
    cannot name (throws or returns the code) → the code in capitals. `trackerPicture(path)`:
    `https://lastasylumtracker.com` + path. `joinRequirementsText(j)`: "Open to all" / "By application", then
    " · min. <compact> power" and " · min. sanctuary level N" for minimums above 0.
  - Accent color `CARD_COLOR = 0xB33A3A` on both cards. `author: { name: "Kingdom #N", icon_url? }` replaces the
    Kingdom field; `thumbnail` = avatar / badge when known.
  - Player card: description `Last online <timeAgo>` when known. Fields, inline, in this order, each only when known:
    Power · Kills · Likes / Sanctuary level · VIP Level · Language / Alliance · Alliance Rank · Location
    (`X:807 Y:846`). Full numbers with thousands separators. Alliance and Alliance Rank as today.
  - Alliance card: description = Join Requirements text when known. Fields, inline: Power · Kingdom Power Rank
    (`#24 in Kingdom #1`) · Members / Leader · Alliance Level (`Level 4 · 8,881,750 XP`; `Level 4` without XP) ·
    Gift Level / Language; then the roster section as today, with rows `Name · 27.6M` when the power is known.
  - `embedCharacters` also counts the author name and the description (Discord counts both).

## Tasks

- [x] **T001** Domain types and Game API reading (FR-005, FR-008). Tests in `src/game-api/schemas.test.ts` and
  `client.test.ts`: the recorded `player-in-alliance.json` gives every Player detail (kills 4420, VIP 4, likes 110,
  language `en`, location 807/846, last online 1793154302, avatar `/static/avatars/head_90002.png`, kingdom badge
  `/static/kingdom/badge_1.png`); `alliance.json` gives level 4, XP 8,829,850, gift level 6, rank 25, language `ja`,
  join open/0/0, badge `/static/alliance/badge_103.png`, and roster power per row. For each new field: missing, null,
  wrong type or (paths) a non-`/static/` or `..` path → that value undefined, body still accepted, today's values
  unchanged.
- [x] **T002** Card helpers (FR-003, FR-004, FR-006, edge cases). Tests in `src/discord/lookup-cards.test.ts`:
  `timeAgo`, `compactNumber`, `languageName`, `trackerPicture`, `joinRequirementsText` as in the plan, with the
  boundaries (59 s, 60 min, 24 h, future, 999, 1,000, 999,950, unknown code `xx`).
- [x] **T003** Player card (US1, FR-001, FR-004, FR-006, FR-007). Tests in `lookup-cards.test.ts`: full details →
  author, thumbnail, color, description and fields in the plan's order; each detail missing → only it left off; no
  `details` → today's values (Kingdom in the author line); no alliance → "No alliance", no Alliance Rank; escaped texts.
  Update existing assertions on the Kingdom field.
- [x] **T004** Alliance card (US2, FR-002, FR-003, FR-007). Tests in `lookup-cards.test.ts` (and `recorded-cards.test.ts`
  if it renders cards): full details → author, thumbnail, color, description, fields; roster rows with power; a
  25-row page of 100-character names with power stays ≤ 6,000 characters and every field ≤ 1,024; details missing →
  today's card; same values on every page.
- [x] **T005** Docs: TEST-RUN.md §6h (manual check: `/player DrLOL`, `/alliance NML`, pictures, a Player without
  alliance), ROADMAP row 012, STATUS.
- [x] **T007** Online now without a Last Online (FR-009). Domain `src/domain/alliance-overview.ts`: export
  `isOnlineNow(entry)` = `online === true || lastOnlineAt === undefined`, used by `onlineNow` and `onlineLast24h`.
  Tests in `alliance-overview.test.ts` (online flag false/undefined with no time → online; with a time → as before)
  and `lookup-cards.test.ts`: Player card with `details` but no `lastOnlineAt` → description "Online now"; without
  `details` → no description. `overview-texts.test.ts`: such a row reads "online".
- [x] **T008** Alliance Overview with the card's look (US3, FR-010). `overview-texts.ts` reuses `CARD_COLOR`,
  `kingdomAuthor`, `thumbnailOf`, `compactNumber` (export what is needed from `lookup-cards.ts`). Overview embed:
  color, author, thumbnail; fields inline in rows of three: Weekly Activity · Daily Honor · Daily Tech /
  Online now · Online in the last 24 hours · No data / Top Weekly Activity · Top Daily Honor · Top Daily Tech /
  Least Active (not inline). Table embed: same color; rows `Name · 27.6M · figures · seen` (power left out when
  unknown). Tests in `overview-texts.test.ts`; existing limit tests still pass with power on 25 rows of long names.
- [x] **T009** Docs: TEST-RUN.md §6h rows for the Overview look and Online now; STATUS.
- [ ] **T010** Sorted member table (US4, FR-011).
  - Domain `alliance-overview.ts`: `type TableSort = "might" | "weeklyActivity" | "dailyHonor" | "dailyTech" |
    "lastOnline"`; `tablePage(roster, sort, page)`. Figures: highest first, no value last, ties by name. Last Online:
    `lastSeen` online first, then most recent `at` first, ties by name.
  - `overview-texts.ts`: custom id `overview:{session}:{sort}:{page}` (sort as a short key: `m`, `w`, `h`, `t`, `l`);
    the old `overview:{session}:{page}` still parses (sort Might); `overview:{session}:label` stays the disabled label.
    `renderOverview(alliance, fetchedAt, now, sessionId, page, sort = "might")`. Table embed: color, Kingdom author (no
    thumbnail: it would narrow the table), title `Members · sorted by <Might|Weekly Activity|Daily Honor|Daily Tech|Last
    Online>`, description = one ```` ``` ```` code block: header `#  Name           Might  Weekly  Honor   Tech  Last`
    and rows right-aligned: rank (place in the sorted roster), name cut to 14 characters (with "…") padded, Might /
    figures via `compactNumber` ("–" when missing), Last Online `online` / `5m` / `3h` / `2d`. Backticks in names are
    replaced with `ˋ` so the block cannot break; no markdown escaping inside the block. Footer `Page N of M`.
    Components: row 1 five sort buttons (the active one Primary, others Secondary; ids `overview:{session}:{sort}:0`),
    row 2 Previous / label / Next (only when more than one page). Rows still cut to Discord's limits.
  - `pick.ts` `handleOverview` passes the parsed sort. Tests: `alliance-overview.test.ts`, `overview-texts.test.ts`,
    `pick.test.ts` (a sort press updates in place, owner only).
- [ ] **T011** Docs: TEST-RUN.md §6h rows for sorting and the table; STATUS.
- [ ] **T006** Manual check on the test server (TEST-RUN.md §6h, SC-004). Waits for the user.
