---
description: "Task list for slice 014, Find the closest Exile (REAPER)"
---

# Tasks: Find the closest Exile (REAPER)

**Input**: [spec.md](spec.md), [plan.md](plan.md) (decisions D1–D9), [data-model.md](data-model.md),
[contracts/reaper-command.md](contracts/reaper-command.md). TDD per task (`test-first` → `implementer`).

## Tasks

- [x] **T001** [US1–4] Domain `src/domain/exile.ts` (D1): `Exile`, `exileReasonOf` (trimmed, 1–200), `mayChangeReaper`
  (R5 + Home Kingdom only), `distance`, `rankExiles` (other Kingdom, shielded, caller's uid and no-position dropped;
  distance order, ties by earlier `addedAt`; counts left out).
- [x] **T002** [US2] Shield (D2): `PlayerDetails.shielded` read leniently from `shielding` in `src/game-api/schemas.ts`
  (non-zero → true, 0 → false, missing or unreadable → undefined); recorded fixtures stay green.
- [x] **T003** [US1–4] Storage (D3): migration 11 (`reaper` table, data-model.md) and `src/storage/reaper-store.ts`:
  `add` (`added`/`already`), `remove` (`removed`/`not-an-exile`), `all` (newest first), `inKingdom`, `find`, `refresh`;
  survives reopening; bad rows refused by zod.
- [x] **T004** [US1, US3] Editor check (D3): `editorOf(memberId)` from the Link's rank and the Applied State's
  `alliance_kingdom`; R5 by Game API or Rank Approval in the Home Kingdom → may; R4, other Kingdom, unknown rank, no
  Alliance, no Link → may not.
- [x] **T005** [US1–4] Command (contract): `/reaper` with `closest`, `list`, `add`, `remove` in `src/discord/commands.ts`;
  texts in `src/discord/reaper-texts.ts`.
- [x] **T006** [US1] `add` in `src/discord/reaper.ts` (D5, D8): refusal before any request; bad reason refused; found
  → stored with position, private confirmation, log line with the R5; already an Exile; not found; 409 → pick list
  with the `exile` choice carrying the reason (`pick-sessions.ts`, `pick.ts`); quota spent → usual message.
- [x] **T007** [US2] `closest` (D4, D6): origin from the Linked Player or x/y (x without y refused; no Link and no x/y
  asks for them; no Link with x/y → Home Kingdom); reads at most 4 at a time with `lookup`; 3 closest with card,
  coordinates, distance, reason, date, shield note; stale positions marked; quota refusal mid-read uses stored
  positions; spent with no stored position → quota message; none in Kingdom; rows refreshed; adder never shown.
- [x] **T008** [US2, US4] Paging (D6): `src/discord/reaper-pages.ts` memory-only sessions (15 min, 500, owner only);
  `closest all:true` 3 per page by distance; `list` 8 per page newest first, empty text; page buttons redraw without
  a request; expired session message.
- [ ] **T009** [US3] `remove` (D7, D8): autocomplete from REAPER without a request; removed → confirmation and log
  line; unknown → "not an Exile"; refusal for non-editors.
- [ ] **T010** [US1–4] Wiring: `client.ts` routes `/reaper`, its autocomplete and `reaper:` buttons; `main.ts` builds
  `ReaperStore`; command registered.
- [ ] **T011** Docs (D9): GAME-API.md (`shielding` read), TEST-RUN.md REAPER section, STATUS, ROADMAP row 014.
- [ ] **T012** `bot-reviewer` on the slice diff; findings into `review.md`; fix must/should items.
- [ ] **T013** `spec-auditor` against spec.md; findings into `audit.md`; close gaps.
- [ ] **T014** Manual check collected in TEST-RUN.md (REAPER), run later by the user.
