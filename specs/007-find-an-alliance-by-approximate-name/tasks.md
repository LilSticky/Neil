---
description: "Task list for slice 007, Find an alliance by approximate name"
---

# Tasks: Find an alliance by approximate name

**Input**: [spec.md](spec.md). TDD per task (`test-first` → `implementer`); no network, `:memory:` stores.

## Plan (short)

- Domain `src/domain/alliance-match.ts`: `normalise(text)` (lower case, accents and everything but letters/digits
  removed); `matchAlliances(query, known, now, limit = 25)` ranking per FR-003 (exact > prefix > part > near spelling
  with Damerau-Levenshtein ≤ 1 for normalised queries of 4–7 characters, ≤ 2 from 8; queries < 3 characters: prefixes
  only; tag before name; then last seen; Alliances older than 30 days left out).
- Storage migration 6 `known_alliance(kingdom, tag, name, last_seen, PRIMARY KEY(kingdom, tag))`;
  `src/storage/known-alliance-store.ts`: `seen(alliance, at)`, `all(now)` (≤ 30 days), `forget(now)`.
- Game API client: optional `onAllianceSeen(kingdom, tag, name)` hook called for every fresh answer that holds an
  Alliance (Player with Alliance, Alliance lookup); the composition root filters the Home Kingdom and stores.
- Discord: `/alliance` `name` and `tag` options get `setAutocomplete(true)`; `client.ts` routes autocomplete to
  `src/discord/alliance-autocomplete.ts`; `lookup.ts` not-found by name → pick list from `matchAlliances` (reuse the
  slice 004 pick sessions/menu, kind "alliance"), pick → `getAlliance(homeKingdom, tag, "lookup")`; tag without
  Kingdom → Home Kingdom.

## Tasks

- [x] T001 [P] Test `src/domain/alliance-match.test.ts`: normalise; every FR-003 rank, the spec's examples (`man`,
  `no mans`, `No Mna's Land`), 1–2 letter queries prefix only, ties by last seen, 30-day cut, limit 25. Implement.
- [x] T002 [P] Test `src/storage/database.test.ts` + `known-alliance-store.test.ts`: migration 6, v5 upgrade, `seen`
  upsert (new name replaces), `all(now)` leaves out > 30 days, `forget(now)` deletes them. Implement.
- [x] T003 Test `src/game-api/client.test.ts`: `onAllianceSeen` called once per fresh Player-with-Alliance and Alliance
  answer, not for cache hits, not for players without Alliance; a throwing hook never fails the lookup. Implement.
- [x] T004 Test `src/discord/alliance-autocomplete.test.ts` + `commands.test.ts`: options autocomplete; focused
  `name` → choices `{name: "[TAG] Name", value: full name}`, `tag` → value tag; empty → most recent; ≤ 25; names cut to
  100; no Game API call; errors answer an empty list. Implement + route in `client.ts`.
- [x] T005 Test `src/discord/lookup.test.ts` + `pick.test.ts`: `/alliance name:` not found → private pick list of
  close Known Alliances (escaped `[TAG] Name`); pick → `getAlliance(home, tag, "lookup")` and the usual card; no close
  match → old not-found text; `tag:` without kingdom → Home Kingdom. Implement.
- [x] T006 Wiring: composition root stores Home Kingdom sightings, `forget` at startup (test in startup/connect tests).
- [x] T007 Docs: TEST-RUN.md §6c (collected cases), GAME-API.md note, ROADMAP (007 row), STATUS.
- [ ] T008 `bot-reviewer` → `review.md`; fix must/should. T009 `spec-auditor` → `audit.md`.
- [ ] T010 Manual check: collected in TEST-RUN.md §6c, run later by the user.
