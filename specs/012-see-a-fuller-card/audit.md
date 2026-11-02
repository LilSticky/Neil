# Audit: slice 012 "See a fuller card"

Auditor: `spec-auditor`, branch `012-see-a-fuller-card` (stacked on 011), 2026-11-03.

## Results

- `npm run typecheck`, `npm run test` (59 files, 1979 tests), `npm run lint -- --quiet`: pass.
- Test-server check: **not yet run** (TEST-RUN.md §6h written, T006 waits for the user).

## Coverage

Every acceptance scenario (US1-1 to US1-4, US2-1 to US2-5), FR-001 to FR-007 and SC-001/SC-002 has tests in
`src/discord/lookup-cards.test.ts`, `src/game-api/schemas.test.ts` and `src/game-api/client.test.ts`.

- FR-008 / SC-003 (no extra request): no dedicated test; holds by design (only existing answers are parsed, no new
  call site). Checked manually in TEST-RUN 6h.6.
- SC-004: manual, TEST-RUN 6h.2.
- Edge case Location 0:0 shown as given: no explicit test (minor; no code treats 0 specially).

## Tasks

T001–T005 done (T005 ticked after the audit started); T006 open for the user.

## Outside the spec

- `src/storage/interview-store.ts` stores no Player details (review S1): protects stored data, keeps ADR 7.
- `src/domain/picture-path.ts`: shared picture-path rule for FR-004 (review C1).
