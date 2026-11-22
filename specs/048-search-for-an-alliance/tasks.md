# Tasks: Search for an alliance

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Tests**: TDD is mandatory (constitution II): every task that changes behaviour starts with a failing test.

## Phase 1: Foundational

- [ ] T001 [P] `src/domain/alliance-search.ts` (+ test): `parseAllianceSearch` (`[REB]`, `[REB] Rebirth`, `  reb `,
  empty, 41 characters, `[]`), `exactKnownAlliance` (tag and name, case and punctuation ignored, only the given
  Kingdom, tag before name, forgotten ones left out), `matchesIn` (only pickable matches of the Kingdom).
- [x] T002 [P] Recording every Kingdom: `startup.ts` hook (+ test: an Alliance of Kingdom 1 is stored, a blank tag or
  name is not); `src/game-api/client.ts` (+ test: a fresh ambiguous `findAlliance` answer tells the hook of each match
  with Kingdom, tag and name; a cached one does not; a match without a tag is skipped).

## Phase 2: User Stories 1 and 2

- [ ] T003 `commands.ts` (+ test): `/alliance` has `search` (required, max 40, autocomplete) and `kingdom`; no `name`
  or `tag`.
- [ ] T004 `alliance-autocomplete.ts` (+ test): suggestions only from the Kingdom typed in `kingdom`, else the Home
  Kingdom; value `[TAG]`, label `[TAG] Name`; nothing typed gives that Kingdom's most recently seen. `client.ts` passes
  the Home Kingdom.
- [ ] T005 `lookup.ts` / `lookup-cards.ts` (+ test): the resolution of plan step 4: `[TAG]` → one tag request in K;
  text equal to a Known Alliance of K → one tag request; name answer found in K → card; found in another Kingdom →
  not found in K; ambiguous with one match in K → second tag request and card; several → pick list of K's only; none →
  close Known Alliances of K or the not-found text naming the text and K; invalid text or Kingdom answered at once.

## Phase 3: Polish

- [ ] T006 City Rotation and NaP still suggest Home Kingdom Alliances only, with a Kingdom 1 Known Alliance stored
  (+ test where missing).
- [ ] T007 GAME-API.md (name lookup matches tags across Kingdoms), ROADMAP row 048, STATUS.
- [ ] T008 Smoke test on test Neil through Neil Police (NEIL-POLICE.md section 3a): after the deploy and restart, the
  console and `#neil-log` show no errors and `/alliance` is registered with `search` and `kingdom`. Running the command
  needs a Member's account, so the search itself is covered by tests and the #330 server (ADR 29).
