# Audit: slice 007 (T009)

Diff `b7d2aa9..HEAD`. Typecheck, lint (--quiet) clean; tests 1394/1394 pass (50 files).

| Criterion | Covering test(s) | Status |
|---|---|---|
| US1-1 suggestions, best first, <=25 | alliance-autocomplete.test (name/tag suggest, empty <=25), alliance-match.test (limit 25) | covered |
| US1-2 near spelling, case/accents/punct ignored | alliance-match.test (normalise, `No Mna's Land`, 4-7 / 8+ edit distance); autocomplete near-spelling test | covered |
| US1-3 nothing typed -> most recent | autocomplete "most recently seen ... when nothing is typed" | covered |
| US1-4 no match -> empty list | autocomplete "answers an empty list when no Known Alliance matches" | covered |
| US2-1 pick list instead of not-found | lookup.test "opens a pick list of close Known Alliances" | covered |
| US2-2 pick -> getAlliance(home, tag, "lookup"), one request | pick.test "looks the Alliance up by its tag in the Home Kingdom" | covered |
| US2-3 no close match -> old not-found | lookup.test "keeps the not-found text" | covered |
| US2-4 tag without Kingdom -> Home Kingdom | lookup.test "with a tag and no Kingdom" (+ not-found naming Home Kingdom) | covered |
| US3-1 record tag/name/time, new name replaces | known-alliance-store.test, startup.test "records a Home Kingdom Alliance", client.test onAllianceSeen | covered |
| US3-2 other Kingdom not stored | startup.test "does not record an Alliance of another Kingdom" | covered |
| US3-3 >30 days left out, deleted at start | store.test (all/forget), match.test 30-day cut, startup.test "forgets ... when Neil starts" | covered |
| Edge: ties by recency; tag before name | match.test ranking tests | covered |
| Edge: 1-letter query prefix only | match.test short queries | covered |
| Edge: 3s autocomplete, stored data only | handler reads store only; no timing test | partial (structural) |
| Edge: markdown (labels plain, pick list escaped) | lookup.test "escapes Discord markdown"; autocomplete 100-char cut | covered |
| FR-001 | store.test, startup.test, client.test hook, database.test migration 6 | covered |
| FR-002 | commands.test (autocomplete options), client.test routing, autocomplete.test | covered (no explicit "no Game API call" assertion) |
| FR-003 | match.test | covered |
| FR-004 | lookup.test + pick.test | covered |
| FR-005 | lookup.test | covered |
| FR-006 | store.test, match.test, startup.test | covered |
| FR-007 Quota/Reserve | pick uses "lookup" purpose (asserted); no new quota test, relies on slice 004 | partial |
| SC-001 any 3 consecutive letters | match.test "3 letter query takes prefixes and parts" | covered |
| SC-002 no Game API request | autocomplete handler has no client; not asserted | partial (structural) |
| SC-003 one wrong/missing/swapped letter | match.test 4-7 letters | covered (3-letter names get no near spelling by design) |

## Tasks
T001-T007 ticked and present in code. T008 (review.md) and T010 (manual, TEST-RUN.md 6c) open as planned; T009 is this audit.
Test-server check: recorded as collected in TEST-RUN.md 6c (T010 pending, user runs later).

## Scope creep
None found.
