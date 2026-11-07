# Audit: Keep the thread until it closes

`spec-auditor`, 2026-11-07. Typecheck, lint and tests pass (92 files, 2956 tests). Scenarios 1 to 8 and the failed deletion each have
a test.

- Minor, left: the edge cases of an Unlink and of a Member leaving have no test on the role. Their behaviour doesn't change.
- T009 (manual check) is open, so Definition of Done 2 is open.
