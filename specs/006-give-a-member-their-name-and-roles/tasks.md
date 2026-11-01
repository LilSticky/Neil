---
description: "Task list for slice 006, Give a member their name and roles"
---

# Tasks: Give a member their name and roles

**Input**: [spec.md](spec.md), [plan.md](plan.md), [ADR 8](../../documentation/adr/0008-neil-creates-managed-roles.md)

**Tests**: required (constitution II). Each `src/` task: failing test first (`test-first`), then `implementer`. No
test touches the network or the real Discord; stores use `:memory:`.

## Phase 1: Setup

- [x] T001 Test then implement config in `src/config.test.ts` / `src/config.ts`: `HOME_KINGDOM` required kingdom
  number (1–9999); `TROOP_BRACKET_LEVELS` optional, default `1,3,6,10,14,17,20,24,27,30`, strictly increasing whole
  numbers ≥ 1, 1–10 entries (`Configuration.homeKingdom`, `troopBracketLevels`). Add both to `env.example`.

## Phase 2: Domain

- [x] T002 [P] Test `src/domain/troop-bracket.test.ts`: `bracketFor(level, levels)` → `T1`…`T10` per the default table
  (1–2 T1, 3–5 T2, …, 30+ T10), `undefined` for 0 or a level below the first. Implement `src/domain/troop-bracket.ts`.
- [x] T003 [P] Test `src/domain/member-name.test.ts`: `nicknameFor(player, rank, homeKingdom)` per spec FR-002 and
  US1 1–6 (`[NML] Rogue`, `[NML|R4] Rogue`, `[ABC|R5] Rogue | #331`, `Rogue | #331`, `Rogue`, unknown rank → no rank,
  cut to 32 keeping tag/rank/kingdom, empty Player Name → `undefined`). Implement `src/domain/member-name.ts`.
- [x] T004 Test `src/domain/managed-roles.test.ts`: `rolesFor(player, rankOnLink, homeKingdom, levels)` (Home
  Kingdom Alliance → tag; rank role only for a known rank in a Home Kingdom Alliance; `#<kingdom>` always; bracket
  when known); `isManagedRoleName(name)` recognises `R1`–`R5`, `#<n>`, `T1`–`T10` and a given set of Alliance tags;
  `planApply(heldManaged, wanted)` → `{add, remove}`. Implement `src/domain/managed-roles.ts`.

## Phase 3: Storage

- [ ] T005 Test `src/storage/database.test.ts` + `applied-store.test.ts`: migration 5 creates `applied` (member_id PK,
  nickname, roles_json, applied_at, complete); a version-4 db upgrades; `record`/`get` round-trip;
  `linkedWithoutCompleteApply()` lists Links with no row or `complete = 0`; deleting a Link's row with the Link.
  Implement `src/storage/applied-store.ts`, migration 5.

## Phase 4: User Story 1 - A Linked Member gets their name and roles (P1)

- [ ] T006 Test `src/discord/member-roles.test.ts` with a fake guild: finds roles by exact name; creates a missing
  role once (no permissions, not hoisted, not mentionable), also for two concurrent applies; refuses an existing role
  with permissions (skipped with reason); adds missing, removes unwanted Managed Roles, never touches other roles;
  sets the nickname; per-step errors (50013 Missing Permissions, owner, hierarchy) become `skipped` entries.
  Implement `src/discord/member-roles.ts`.
- [ ] T007 Test `src/discord/name-and-roles.test.ts`: `onLinked` computes wanted name and roles (domain), applies,
  records the applied state (`complete` only without skips), posts one log line (nickname, roles added/removed,
  created roles, skipped with reasons), never throws; `onRankApproved` re-applies with the approved rank. Log texts
  in `src/discord/name-and-roles-texts.ts` (+ test). Implement.
- [ ] T008 Test `src/discord/interview.test.ts` + `rank-approval.test.ts`: after a Link (card confirm and chosen-uid
  path) `onLinked` is called with the Player and the rank on the Link; after a Rank Approval `onRankApproved`; a
  failing apply does not affect the Link or the thread messages. Implement the wiring.

## Phase 5: User Story 2 - Startup apply (P2)

- [ ] T009 Test `name-and-roles.test.ts`: `atStartup()` takes `linkedWithoutCompleteApply()`, skips Members not on the
  server (no lookup), looks each up with `getPlayer(uid, "lookup")`, stops at a quota stop and logs how many are left,
  logs a not-found Player and leaves it. Implement; call from `connect` after the channel check (`client.ts`).

## Phase 6: User Story 3 - Permissions (P2)

- [ ] T010 Test `src/discord/onboarding-channels.test.ts` (or a new `role-permissions.test.ts`): at startup a missing
  Manage Roles / Manage Nicknames is logged to the log channel and Neil still starts. Implement.

## Phase 7: Polish

- [ ] T011 Docs: HOSTING.md (Manage Roles, Manage Nicknames, Neil's role above Managed Roles and below Officers,
  `HOME_KINGDOM`, `TROOP_BRACKET_LEVELS`), TEST-RUN.md section for 006, ADR index, STATUS, ROADMAP.
- [ ] T012 `bot-reviewer` on the slice diff → `review.md`; fix must/should.
- [ ] T013 `spec-auditor` → `audit.md`; close gaps.
- [ ] T014 Manual test-server check: collected in TEST-RUN.md, run later by the user.

## Dependencies

T001 before T007, T009. T002, T003 ∥; T004 after T002. T005 before T007. T006 before T007. T007 before T008, T009.
T010 any time after T001. Polish last.
