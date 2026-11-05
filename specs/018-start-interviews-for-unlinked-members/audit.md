# Audit: slice 018

`spec-auditor` against `spec.md`, 2026-11-05 (task T009). All scenarios are covered except these; no scope creep.

| # | Gap | Outcome |
|---|-----|---------|
| 1 | `invisible` is not tested at the adapter | T015 |
| 2 | Online to dnd and idle to dnd are not tested at the adapter | T015 |
| 3 | An Interview abandoned while online: no test | T015 |
| 4 | Linked between coming online and the start: no test, no re-check after the await | Left: the window is one role change, and the store allows one open Interview |
| 5 | `starting` does not cover `joinMember` and `/interview` | T012 (review 2) |
| 6 | A presence update during the startup check: no connect-level test | T015 |
| 7 | A failed read in the listing is not logged | T011 (review 4) |
| 8 | Offline at startup, then coming online: no end-to-end test | T015 |

Definition of Done 2 stays open until T010, the manual check on the test server.
