# Implementation Plan: Give a member their name and roles

**Branch**: `006-give-a-member-their-name-and-roles` (stacked on 005) | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

## Summary

On every Link (and after a Rank Approval) Neil computes, in the domain, the Member's nickname and the set of Managed
Roles that fit the Player, then a Discord adapter makes the Member match it: it finds or creates each Managed Role
by name, adds the missing ones, removes Managed Roles that no longer fit, sets the nickname, and reports what it
could not do. The result is stored per Link (migration 5) and logged. At startup the same apply runs for Linked
Members without a successful apply, with one lookup each.

## Technical context

TypeScript (strict), discord.js 14, node:sqlite (ADR 5), Vitest. New Discord permissions: Manage Roles, Manage
Nicknames, and the Guild Members intent (already on from slice 005). Decision on creating roles: [ADR 8](../../documentation/adr/0008-neil-creates-managed-roles.md).

## Constitution check

- I Ubiquitous language: Managed Role, Home Kingdom, Guest, Troop Bracket approved 2026-11-01. ✅
- II TDD: every `src/` task is a test-first pair. ✅
- III Domain free of discord.js: nickname, bracket and role-set rules in `src/domain/`. ✅
- IV Game API only through the quota-keeping client: the startup apply uses `getPlayer(uid, "lookup")`. ✅
- V Personal data: the applied state (nickname, role names, time) is personal data → ADR 8 extends ADR 7's retention. ✅
- Least privilege: Neil never gives a role that grants permissions; never touches non-Managed Roles. ✅

## Design

- `src/domain/member-name.ts`: `nicknameFor(player, allianceRank, homeKingdom): string | undefined` (FR-002).
- `src/domain/troop-bracket.ts`: `parseBracketTable(text)`, `bracketFor(level, table)` (FR-006).
- `src/domain/managed-roles.ts`: `ManagedRoleName` (kinds alliance / rank / kingdom / bracket), `rolesFor(player,
  rankOnLink, homeKingdom, table)`, `isManagedRoleName(name, …)` to recognise Managed Roles a Member holds,
  `planApply(current Managed Role names, wanted) → {add, remove}`.
- `src/config.ts`: `HOME_KINGDOM` (required, kingdom number), `TROOP_BRACKET_LEVELS` (optional, default
  `1,3,6,10,14,17,20,24,27,30`).
- `src/storage/database.ts` migration 5: table `applied` (member_id PK → link, nickname, roles_json, applied_at,
  complete INTEGER). `src/storage/applied-store.ts`: `record`, `get`, `linkedWithoutCompleteApply()`.
- `src/discord/member-roles.ts`: `GuildRolesLike`/`GuildMemberLike` ports; `applyNameAndRoles(member, wanted)` →
  `ApplyReport {added, removed, created, nickname, skipped: {what, reason}[]}`. Finds roles by exact name; creates a
  missing one (no permissions, not hoisted, not mentionable); refuses an existing role with permissions; catches
  hierarchy/permission errors per step (FR-011). Role creation is serialised per name (edge case).
- `src/discord/name-and-roles.ts`: `onLinked(memberId, player, rank)`, `onRankApproved(memberId)`, `atStartup()`;
  logs via the existing log channel (FR-012); records the applied state.
- Wiring: interview.ts `finishLink` and rank-approval.ts approve call `onLinked` / `onRankApproved` after the Link is
  stored (never failing the Link); `connect` runs `atStartup()` after the channels check; a startup permission check
  logs missing Manage Roles / Manage Nicknames instead of refusing to start (US3-2).

## Project structure

```text
src/domain/{member-name,troop-bracket,managed-roles}.ts (+ tests)
src/storage/applied-store.ts, database.ts (migration 5)
src/discord/{member-roles,name-and-roles}.ts, interview.ts, rank-approval.ts, client.ts
src/config.ts, env.example
documentation/HOSTING.md (Neil's role position, permissions), TEST-RUN.md (006 section)
```
