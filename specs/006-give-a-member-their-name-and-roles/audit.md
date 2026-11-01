# Audit: slice 006 (T013)

Diff `7302e75..HEAD`. Typecheck clean, 1313 tests in 47 files pass, `lint --quiet` clean.
Tasks T001-T010 ticked and present in code; T011-T014 open (expected). T014 (test-server check) is planned in
tasks.md but not yet recorded in TEST-RUN.md (part of T011): **not recorded yet**.

## Acceptance scenarios

| Criterion | Test(s) | Status |
|---|---|---|
| US1-1 `[TAG] Name` + 4 roles | member-name.test (tag alone R<4), managed-roles.test (Home Kingdom Player), name-and-roles.test "sets the nickname and gives exactly..." | covered |
| US1-2 R4/R5 in brackets | member-name.test "shows the rank from a Rank Approval for R4", "adds the Kingdom ... R4 and R5" | covered |
| US1-3 Guest: ` \| #K`, no Alliance/rank role | managed-roles.test Guest; name-and-roles.test Guest | covered |
| US1-4 no Alliance | member-name.test, managed-roles.test, name-and-roles.test | covered |
| US1-5 unknown rank, later Rank Approval | member-name/managed-roles unknown rank; rank-approval.test "approved rank gives ... new rank"; name-and-roles onRankApproved | covered |
| US1-6 32-char cut | member-name.test (3 cut tests) | covered |
| US1-7 create role (no perms, not hoisted/mentionable), logged | member-roles.test create + concurrent; name-and-roles.test "logs ... roles created" | covered |
| US1-8 remove stale Managed Roles, never others | managed-roles planApply; member-roles.test; name-and-roles.test "removes ... last applied", "leaves a role that is not a Managed Role alone" | covered |
| US2-1 startup apply, lookup purpose | name-and-roles.test atStartup; connect.test | covered |
| US2-2 quota stop, how many left | name-and-roles.test test.each quota-spent / reserve-kept | covered |
| US2-3 not on server, no lookup | name-and-roles.test atStartup | covered |
| US2-4 Player not found, logged, left | name-and-roles.test | covered |
| US3-1 owner / hierarchy skipped, logged with reason | member-roles.test owner, hierarchy, 50013; name-and-roles-texts.test; name-and-roles.test "logs a step Discord refuses" | covered |
| US3-2 missing permission at startup, still starts | role-permissions.test; connect.test | covered |
| US3-3 role with permissions refused and logged | member-roles.test (refused); log text "grants permissions" in texts | partial: no test in name-and-roles.test shows the log line end to end |

## Edge cases

| Case | Test | Status |
|---|---|---|
| Empty Player Name: nickname unchanged, roles given | member-name.test, name-and-roles.test | covered |
| Markdown/mentions in name: plain text | none (nickname is plain by Discord; no allowedMentions concern in a nickname) | missing (low risk) |
| Same tag in other Kingdom: no role | managed-roles.test Guest | covered |
| Level 0/missing: no bracket | troop-bracket.test, managed-roles.test | covered |
| Restart mid-apply: idempotent | applied-store (incomplete listed), name-and-roles "nothing changed" | covered |
| Concurrent same new role: created once | member-roles.test | covered |
| 250-role limit: logged, rest applies | member-roles.test role limit | covered |
| Alliance tag change, own nickname change | out of scope (no code) | n/a |

## Functional requirements and success criteria

| ID | Test(s) | Status |
|---|---|---|
| FR-001 no extra request | name-and-roles.test "with no Game API request"; interview.test | covered |
| FR-002 | member-name.test | covered |
| FR-003 | managed-roles.test Guest | covered |
| FR-004 | managed-roles.test, rank-approval.test | covered |
| FR-005 | managed-roles.test | covered |
| FR-006 configurable table | troop-bracket.test, config.test | covered |
| FR-007 | member-roles.test (create, refuse with permissions) | covered |
| FR-008 | member-roles.test, name-and-roles.test | covered |
| FR-009 | name-and-roles.test atStartup, connect.test | covered |
| FR-010 applied record, failed = not successful | applied-store.test, name-and-roles.test complete/not complete | covered |
| FR-011 | member-roles.test, name-and-roles.test, role-permissions.test | covered |
| FR-012 log per change and per created role | name-and-roles.test, name-and-roles-texts.test | covered |
| FR-013 HOME_KINGDOM required | config.test | covered (checked at config load at startup) |
| FR-014 no re-sync/unlink | no code for it | n/a |
| SC-001 within 10 s | no timing test; apply is called inline on Link | partial (acceptable, manual) |
| SC-002 | atStartup + log of leftovers/permissions | covered |
| SC-003 only Managed Roles touched | member-roles.test, name-and-roles.test | covered |
| SC-004 never stops Neil | "never throws" tests in member-roles, name-and-roles, role-permissions, interview, rank-approval | covered |

## Tests covering nothing in the spec

None found. Support files (fakes, schema-v4 fixture, migration 5 test) serve T005/T006.

## Gaps

1. US3-3: no end-to-end test that the "role must lose its permissions" log line is posted by name-and-roles.
2. Edge case markdown/mention in Player Name: no test.
3. SC-001 timing: no test.
4. T011 docs and the TEST-RUN.md test-server check (T014) are not yet written.
