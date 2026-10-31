---
description: "Task list for slice 004, Find a player by name or alliance"
---

# Tasks: Find a player by name or alliance

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/commands.md](contracts/commands.md), [quickstart.md](quickstart.md)

**Tests**: required. TDD is mandatory (constitution II): every `src/` task is a pair, a failing test first
(`test-first` agent), then the code that makes it green (`implementer`). Tests sit next to their files as
`*.test.ts`. No test touches the network or waits in real time.

**Organization**: by user story. US1 and US2 are P1, US3 is P2. Phase 2 (purpose on every request, pick
sessions, roster in the domain) is shared by all three.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup (configuration)

- [x] T001 Test then implement config in `src/config.test.ts` / `src/config.ts`: `GAME_API_QUOTA_RESERVE` optional,
  "whole number ≥ 0", default 100 (`Configuration.quotaReserve: number`); an invalid value is reported without
  echoing it. Add it to `env.example` (commented, with the default).

---

## Phase 2: Foundational (domain and client plumbing)

- [x] T002 [P] Test `src/domain/daily-quota.test.ts`: `canSendFor(q, "lookup", 100)` true at remaining 101, false at
  100 and 0; `canSendFor(q, "onboarding-interview", 100)` true at remaining 1, false when `canSend` is false;
  `leftForLookups(q, 100)` = max(0, remaining − 100). Implement in `src/domain/daily-quota.ts`
  (`type RequestPurpose = "lookup" | "onboarding-interview"`).
- [x] T003 [P] Test `src/domain/lookup-input.test.ts`: `parsePlayerName` trims; accepts 1–32 characters incl. spaces,
  emoji and `'`; rejects empty, 33 characters, and only dots. Implement the `PlayerName` brand in
  `src/domain/lookup-input.ts`.
- [x] T004 [P] Test `src/domain/alliance-rank.test.ts`: `rankFromLabel` maps "R1"–"R5", anything else and null to
  unknown; `sortRoster` orders R5, R4, R3, R2, R1, unknown, then name case-insensitively, then uid, without
  changing its input. Implement in `src/domain/alliance-rank.ts`; `rankFromRoster` uses `rankFromLabel`.
- [x] T005 [P] Test `src/domain/player.test.ts`: `pickablePlayerMatch` needs `uid` and `kingdom`;
  `pickableAllianceMatch` needs `tag` and `kingdom`; `orderMatches` sorts by Kingdom then name, keeps at most 25 and
  reports how many were left out. Implement in `src/domain/player.ts`, plus `RosterEntry`
  (`uid`, `name`, `allianceRank`), `Alliance.roster`, and the `LookupResult` kind `reserve-kept` (`resetsAt`).
- [x] T006 Test `src/game-api/quota-keeper.test.ts`: keeper with `reserve: 100`; `tryCount("lookup")` refuses with
  reason `"reserve"` at remaining ≤ 100 and saves nothing; `tryCount("onboarding-interview")` still counts;
  refusal reason `"spent"` when `canSend` is false. Implement in `src/game-api/quota-keeper.ts`.
- [x] T007 Test in `src/game-api/client.test.ts`: every public method takes a required `purpose`; a lookup refused
  for the reserve makes no fetch and returns `reserve-kept` with `resetsAt` = next 00:00 UTC; a stale cache entry is
  served instead when there is one; retries stop when the purpose may no longer send. Implement in
  `src/game-api/client.ts`; `src/discord/lookup.ts` passes `"lookup"`; wire `config.quotaReserve` through
  `src/startup.ts` / `src/main.ts`, with a startup warning when the reserve is at or above the stored limit.
- [x] T008 [P] Test `src/discord/pick-sessions.test.ts` (fake clock): `open` returns an id ≤ 16 characters;
  `get(id, now)` gives the session before 15 minutes and `"expired"` at or after, and for an unknown id; more than
  500 sessions drop the oldest; `isOwner`; `pageOf(entries, page)` gives 25 per page, clamps the page;
  `pageCount`; custom ids `pick:{id}:select` and `pick:{id}:page:{n}` round-trip through `parseCustomId`, anything
  else gives `undefined`. Implement `src/discord/pick-sessions.ts`.

**Checkpoint**: everything green; Discord behaviour unchanged apart from the reserve refusal, which T007 answers with the quota-spent text until T022 gives it its own.

---

## Phase 3: User Story 1 - Look up a Player by Player Name (P1) 🎯 MVP

**Independent test**: one match → card; several → private pick list → card; no match → private text.

- [x] T009 [P] [US1] Record fixtures in `src/game-api/__fixtures__/`: `player-by-name.json` (a copy of
  `player-in-alliance.json` is fine), `players-ambiguous.json` (409 body with `matches` of `uid`, `server`, `name`,
  as GAME-API.md documents for `drlol`); note them in the fixtures README.
- [x] T010 [US1] Test in `src/game-api/client.test.ts`: `findPlayer(name, undefined, "lookup")` calls
  `/players/name/{encoded name}`, with a Kingdom `/players/{kingdom}/{encoded name}`; 200 → `found` Player; 409 →
  `ambiguous` with matches; 404 → `not-found`; 502 → `not-prepared`; " DrLol " and "drlol" share one cache entry
  (`player-name:{kingdom|*}:{lower name}`), a match list is cached too, failures are not; concurrent calls share one
  fetch. Implement `findPlayer` in `src/game-api/client.ts`.
- [x] T011 [US1] Test then implement the `/player` definition in `src/discord/commands.ts`: options `uid` (string ≤ 32),
  `name` (string ≤ 32), `kingdom` (integer 1–9999), all optional; description `Look up a player by uid or name`.
- [x] T012 [P] [US1] Test `src/discord/lookup-cards.test.ts`: texts from
  [contracts/commands.md](contracts/commands.md#player) (option combination, invalid name, not found with and without
  Kingdom, not prepared) and the private pick list (`Several players are named …`, ≤ 25 options labelled
  `{name} · kingdom #{k}`, the "first 25" note). Implement in `src/discord/lookup-cards.ts`.
- [x] T013 [US1] Test `src/discord/lookup.test.ts` (fake interaction; `getString(name, false)` may return null):
  both or neither of uid and name → private text, no API call; uid with kingdom → uid flow; name → `findPlayer` with
  the Kingdom; `ambiguous` → placeholder removed and the private pick list sent, a session opened for the caller.
  Implement in `src/discord/lookup.ts`.
- [x] T014 [US1] Test `src/discord/pick.test.ts` (fake component interaction: `customId`, `user.id`, `values`,
  `update`, `deferUpdate`, `followUp`, `reply`): non-owner → private note, no API call (spec 1.6, SC-005); expired or
  unknown session → `This menu has expired. Run the command again.`; owner picks a Player match → private message
  updated to `Showing …` without components, `getPlayer(uid, "lookup")`, public card as follow-up; a failure → the
  uid texts privately. Implement `src/discord/pick.ts`.
- [x] T015 [US1] Test then implement routing in `src/discord/client.ts`: string-select and button interactions whose
  custom id starts with `pick:` go to the pick handler; `connect` builds one `PickSessions` (clock injected) shared by
  the lookups and the pick handler.

**Checkpoint**: `/player name:drlol` works on the test server.

---

## Phase 4: User Story 2 - See an Alliance Roster and look up its members (P1)

**Independent test**: card lists all members by rank with uids; menu pages through them; pick → Player card.

- [x] T016 [P] [US2] Test `src/game-api/schemas.test.ts`: `allianceBodySchema` reads `members[]` (`uid`, `nick_name`
  nullish, `rank_label` nullable); a row without a uid is dropped; a missing `members` gives an empty roster. Add a
  recorded `alliance-by-name.json` and a hand-written `alliances-ambiguous.json` (409, `matches` with `server`,
  `tag`, `name`) to the fixtures. Implement in `src/game-api/schemas.ts`.
- [x] T017 [US2] Test in `src/game-api/client.test.ts`: `getAlliance` maps the roster (`nick_name` null → "Unknown",
  ranks via `rankFromLabel`); `findAlliance(name, "lookup")` calls `/alliances/name/{encoded name}`, 200 → `found`,
  409 → `ambiguous`, 404 → `not-found`, 502 → `try-again`; cached by lower-cased name. Implement in
  `src/game-api/client.ts`.
- [x] T018 [US2] Test then implement the `/alliance` definition in `src/discord/commands.ts`: options `kingdom`
  (integer 1–9999), `alliance` (tag, string ≤ 40), `name` (full name, string ≤ 40), all optional.
- [x] T019 [P] [US2] Test `src/discord/lookup-cards.test.ts` per [contracts/commands.md](contracts/commands.md#alliance-card):
  roster fields by rank (`R5`, `R5 (cont.)` past 1,024 characters), rows `{name} · {uid}` escaped; 100 long rows stay
  under 6,000 characters with `… and {n} more, see the menu below`; empty roster → `The tracker lists no members.`;
  roster components (select `Look up a member…` with ≤ 25 options `{rank} · {name}` / `uid {uid}`; page row only past
  25); the alliance pick list and the `/alliance` texts. Implement in `src/discord/lookup-cards.ts`.
- [x] T020 [US2] Test `src/discord/lookup.test.ts`: kingdom + tag → `getAlliance`; name alone → `findAlliance`; any
  other combination → private text, no API call; a found Alliance with members → public card with the roster menu
  and a roster session for the caller; `ambiguous` (tag or name) → private alliance pick list. Implement in
  `src/discord/lookup.ts`.
- [x] T021 [US2] Test `src/discord/pick.test.ts`: page buttons update the message to that page, no API call;
  non-owner page or pick → private note; owner picks a roster member → `getPlayer(uid, "lookup")` and the card as a
  public reply, the Alliance card unchanged; owner picks an Alliance match → `getAlliance(kingdom, tag, "lookup")`
  and the card publicly. Implement in `src/discord/pick.ts`.

**Checkpoint**: `/alliance kingdom:1 alliance:NML` and `/alliance name:No Man's Land` show the roster.

---

## Phase 5: User Story 3 - Lookups leave the Quota Reserve for Onboarding Interviews (P2)

**Independent test**: 101 remaining → fetch; 100 → refusal text or stale card; `/quota` shows the reserve.

- [x] T022 [P] [US3] Test `src/discord/lookup-cards.test.ts` and `src/discord/lookup.test.ts`: `reserve-kept` gives
  `Lookups are paused for today: the rest of the Daily Quota is kept for interviewing new members. They work again at 00:00 UTC (in 3 h 12 min).`
  privately, for `/player`, `/alliance` and picks. Implement in `src/discord/lookup-cards.ts`, `lookup.ts`, `pick.ts`.
- [x] T023 [US3] Test `src/discord/quota.test.ts`: the Officer reply gains
  `Quota Reserve: 100 (for Onboarding Interviews) · Left for lookups: 25` after the used line; no request. Implement in
  `src/discord/quota.ts` (context gains `quotaReserve`) and pass it from `src/discord/client.ts`.

---

## Phase 6: Polish

- [x] T024 `bot-reviewer` over `src/game-api/`, `src/discord/`, `src/domain/`; fixes via `implementer`
  *Done 2026-10-30: 2 must fix, 1 should fix, 4 nits; all but #6 fixed ([review.md](review.md)).*
- [x] T028 Test then implement the startup warning when the Quota Reserve is at or above the stored limit (spec edge
  case; split from T007, as `StartupDeps` has no warning seam yet) in `src/startup.test.ts` / `src/startup.ts`
- [x] T025 Update GAME-API.md if an alliance-name 409 or a name 502 behaves other than assumed (research R3)
  *Nothing new learned in automated work; revisit after T026 if the test server shows otherwise.*
- [x] T026 **Manual check on the test server** ([quickstart.md](quickstart.md#on-the-test-server)) after
  `npm run commands:register` (user); record the result here
  *Done 2026-10-31 by the user, Neil run locally: the first `/player name:drlol` failed as unavailable (the real 409
  nests `matches` under `detail`); fixed in f245de6 with the recorded body, then every quickstart step passed.*
- [x] T027 `spec-auditor` against spec.md; STATUS, ROADMAP (`done`); PR (`Closes` the slice issue)

## Dependencies

- T001 before T007. T002 before T006 before T007. T005 before T007, T010, T017. T003 before T010.
- T007 before every client and handler task. T008 before T013, T014, T020, T021.
- US1: T009 → T010 → T013 → T014 → T015; T011, T012 in parallel with T010.
- US2 after T015 (routing and sessions in place): T016 → T017 → T020 → T021; T018, T019 in parallel.
- US3: T022 after T013 and T020; T023 after T001.

## Parallel examples

- T002, T003, T004, T005, T008 (different files) together.
- T011 and T012 alongside T010; T018 and T019 alongside T017.

## Implementation strategy

MVP = Phases 1–3: name lookups with the pick list, and every lookup already stops at the Quota Reserve (T007).
Then the roster (US2) and the reserve texts and `/quota` line (US3); Phase 6 closes the slice.
