---
description: "Task list for slice 002, Look up a player"
---

# Tasks: Look up a player

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: required. TDD is mandatory (constitution II): every `src/` task is a pair, a failing test first
(`test-first` agent), then the code that makes it green (`implementer`). Tests sit next to their files as
`*.test.ts`. No test touches the network.

**Organization**: by user story. US1 and US3 are P1, US2 is P2. US3 (failures) is built inside the client
and the handlers of US1, so it follows US1 directly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US3 from spec.md

---

## Phase 1: Setup

- [x] T001 Write `scripts/record-fixtures.ts` (reads `.env`, `LAP_TRACKER_API_KEY`, User-Agent as in
  [contracts/game-api-client.md](contracts/game-api-client.md#requests), 60 s timeout; writes the raw 200/4xx bodies
  of `GET /players/145563254785`, `GET /players/1`, `GET /alliances/1/NML`, `GET /alliances/1/ZZZQX` to
  `src/game-api/__fixtures__/` as `player-in-alliance.json`, `player-not-found.json`, `alliance.json`,
  `alliance-not-found.json`; prints status and `x-ratelimit-remaining`; never prints the key). Run it; if the tracker
  answers 504 again (research R1), commit the script only and note it in STATUS, then continue with T002 and
  retry before T009. *Done 2026-10-29: player, alliance and alliance-404 recorded (trimmed); `GET /players/1`
  answered 502, so `player-not-found.json` does not exist and the player 404 is tested with an inline body
  (see `src/game-api/__fixtures__/README.md`). SC-002 end to end: `src/discord/recorded-cards.test.ts`.*
- [x] T002 [P] Add `LAP_TRACKER_API_KEY` to the startup secrets: test in `src/config.test.ts` (required, non-empty;
  `Configuration.gameApiKey`; the value never appears in the error) and `src/startup.test.ts` (the key is redacted
  like the token), then implement in `src/config.ts` and `src/startup.ts`; move the key in `env.example` out of the
  "from slice 002" block

---

## Phase 2: Foundational (domain)

- [x] T003 [P] Test `src/domain/lookup-input.test.ts`: `parseUid` accepts "1–20 digits" after trimming
  (`" 145563254785 "` → `"145563254785"`), rejects empty, letters, `-1`, 21 digits; `parseKingdom` accepts a
  "whole number 1–9999", rejects 0, 10000, 1.5; `parseAllianceKey` trims and accepts "1–40 characters", rejects
  empty/whitespace and 41 characters; each returns `{ ok: true, value } | { ok: false }`
- [x] T004 [P] Implement `src/domain/lookup-input.ts` (branded `Uid`, `KingdomNumber`, `AllianceKey`)
- [x] T005 [P] Test `src/domain/alliance-rank.test.ts`: `rankFromRoster(uid, roster)` gives the row's `rank_label`
  for `R1`–`R5`; `unknown` for a missing row, `null` label or any other label (e.g. `"R6"`, `"leader"`)
- [x] T006 [P] Implement `src/domain/alliance-rank.ts` and the types in `src/domain/player.ts` (`Player` with the
  union "no Alliance ⇒ no Alliance Rank", `Alliance`, `AllianceRank`, `LookupResult<T>`, `Match`) as in
  [data-model.md](data-model.md)

**Checkpoint**: domain green, no I/O imports in `src/domain/`.

---

## Phase 3: User Story 1 - Look up a Player by uid (P1) 🎯 MVP

**Goal**: `/player uid` shows a public Player card.

**Independent test**: `/player uid:145563254785` on the test server shows the card (quickstart steps 2–4).

- [x] T007 [US1] Test `src/game-api/schemas.test.ts`: the player schema parses `player-in-alliance.json`
  (or, until T001 has recorded it, a fixture built from the verified fields in `GAME-API.md`, marked as such in
  `src/game-api/__fixtures__/README.md`) and rejects a body missing `uid`, `nick`, `kid`, `power` or `lv`;
  `alliance_members[].rank_label` may be `null`; extra fields are allowed
- [x] T008 [US1] Implement the player schema in `src/game-api/schemas.ts`
- [x] T009 [US1] Test `src/game-api/client.test.ts` with a fake `fetch`: `getPlayer` sends `GET {base}/players/{uid}`
  with `Authorization: Bearer …`, `User-Agent: Neil/{version} (+https://github.com/LilSticky/Neil)`, a timeout signal;
  200 → `found` with the mapped `Player` (name, uid, Kingdom, power, sanctuary level, Alliance tag and name,
  Alliance Rank from the roster); `aid` 0/null → no Alliance and no rank; 404 → `not-found`; a 200 for another
  uid → `unavailable/unexpected`
- [x] T010 [US1] Implement `GameApiClient.getPlayer` in `src/game-api/client.ts`
- [x] T011 [P] [US1] Test `src/discord/lookup-cards.test.ts`: `renderPlayerCard(player)` gives the embed of
  [contracts/lookup-commands.md](contracts/lookup-commands.md#player-card-embed) (power `1,234,567`, `No alliance`
  without the rank field, `Unknown` rank); names with `*_\`@` are escaped; the messages table texts, with
  `{uid}` escaped
- [x] T012 [P] [US1] Implement `src/discord/lookup-cards.ts`
- [x] T013 [US1] Add `player` to `src/discord/commands.ts` (test in `src/discord/commands.test.ts`: name,
  description, required string option `uid`, max length 32, guild-only context, per the contract)
- [x] T014 [US1] Test `src/discord/lookup.test.ts` with a fake lookup interaction (`src/discord/__fakes__/`)
  and a fake client: invalid uid → ephemeral help text, no defer, client not called; valid → `deferReply()`, then
  `editReply({ embeds: [card], allowedMentions: { parse: [] } })`; `not-found` → `deleteReply()` + ephemeral
  `followUp`; a rejecting Discord call is logged, not thrown
- [x] T015 [US1] Implement `handlePlayer` in `src/discord/lookup.ts` and the fake in `src/discord/__fakes__/`
- [x] T016 [US1] Route commands by name in `src/discord/client.ts` (test: `player` reaches its handler, `ping`
  still works) and wire `GameApiClient` in `src/startup.ts` / `src/main.ts` (test in `src/startup.test.ts`: the
  client is built with the configured key and passed to `connect`)
- [ ] T017 [US1] **Manual check on the test server** (quickstart steps 1–4); record the result here

**Checkpoint**: MVP: `/player` works on the test server.

---

## Phase 4: User Story 3 - Clear messages when the Game API cannot answer (P1)

**Goal**: every failure gives its own private message; the log has the reason, never the key.

**Independent test**: `src/game-api/client.test.ts` and `src/discord/lookup.test.ts` cover every row of the
status mapping.

- [x] T018 [US3] Test in `src/game-api/client.test.ts`: 429 → `quota-spent`; 502, 503, 504 (plain-text body
  `error code: 504`), abort/timeout, network error → `try-again`; 401, 403 → `unavailable/auth`; 500, 418 and a
  200 failing validation → `unavailable/unexpected`; `logError` gets path and status (and zod issue paths), and
  the key appears in no logged line
- [x] T019 [US3] Implement the mapping and logging in `src/game-api/client.ts`
- [x] T020 [US3] Test in `src/discord/lookup.test.ts`: `quota-spent`, `try-again`, `unavailable` each give the
  contract's ephemeral text and never a card
- [x] T021 [US3] Implement in `src/discord/lookup.ts`

---

## Phase 5: User Story 2 - Look up an Alliance (P2)

**Goal**: `/alliance kingdom alliance` shows a public Alliance card.

**Independent test**: `/alliance kingdom:1 alliance:NML` on the test server (quickstart steps 5–6).

- [x] T022 [US2] Test and implement the alliance schema in `src/game-api/schemas.ts` (`alliance.json`; rejects
  a body missing `abbr`, `name`, `sid`, `power`, `member_count`, `capacity`; `leader_name` may be null) and a
  409 `matches` schema (hand-written fixture, research R9)
- [x] T023 [US2] Test in `src/game-api/client.test.ts`: `getAlliance` sends `GET {base}/alliances/{kingdom}/{encodeURIComponent(key)}`
  (a key with a space is encoded); 200 → `found` `Alliance`; 404 → `not-found`; 409 → `ambiguous` with matches; a
  200 for another Kingdom (`sid`) → `unavailable/unexpected`
- [x] T024 [US2] Implement `GameApiClient.getAlliance`
- [x] T025 [P] [US2] Test and implement `renderAllianceCard` and the alliance messages in
  `src/discord/lookup-cards.ts` (members `12/100`, `Unknown` leader, escaped names, ambiguous list)
- [x] T026 [US2] Add `alliance` to `src/discord/commands.ts` (integer `kingdom` "min 1, max 9999", string
  `alliance` "max length 40", both required) with its test
- [x] T027 [US2] Test and implement `handleAlliance` in `src/discord/lookup.ts` (invalid kingdom/key → ephemeral,
  no call; found → card; not-found / ambiguous → ephemeral) and route it in `src/discord/client.ts`
- [ ] T028 [US2] **Manual check on the test server** (quickstart steps 5–6); record the result here

---

## Phase 6: Polish

- [x] T029 `bot-reviewer` over `src/game-api/` and `src/discord/`; fixes via `implementer`
- [x] T030 Update `documentation/GAME-API.md` from the recorded fixtures (patron status, headers on 200s,
  names with spaces) and close its answered open questions
- [ ] T031 `spec-auditor` against spec.md; STATUS, ROADMAP (`done`), ready-to-merge PR (`Closes` the slice issue)
- [ ] T032 Add `LAP_TRACKER_API_KEY` in the Wispbyte panel before the merge deploys (manual, user), merge,
  restart, and repeat T017/T028 against Wispbyte

## Dependencies

- T001 before T009 for the real fixture (T007 may start on a built fixture). T002 before T016.
- Phase 2 before Phases 3–5. US1 before US3 (same files). US2 after US3 (reuses client mapping and handlers).

## Parallel examples

- T003/T004 with T005/T006 (different domain files).
- T011/T012 (cards) while T009/T010 (client) run.

## Implementation strategy

MVP = Phases 1–3 (`/player` on the test server). Then US3 hardens it, US2 adds `/alliance`, Phase 6 closes
the slice.
