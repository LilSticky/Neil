# Implementation Plan: Set up the server

**Branch**: `020-set-up-the-server` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/020-set-up-the-server/spec.md`

## Summary

`npm run server:setup` reads `server-layout.json`, reads the server over Discord's REST API, and prints a Setup plan. With
`--apply` it carries the plan out. A pure domain function compares layout and server; a thin adapter does the reading and
writing. Separately, Neil's Alliance roles change from `NML` to `[NML]`, so the script can recognise them.

## Technical Context

**Language/Version**: TypeScript strict, Node (as the project)

**Primary Dependencies**: discord.js (`REST`, `Routes`, `PermissionsBitField` only in the script's adapter), zod

**Storage**: none new. No migration: Applied State keeps its old names and is replaced at the next apply (R5)

**Testing**: Vitest; a fake `SetupServer` port, no real Discord

**Target Platform**: the owner's PC, or wherever `.env` holds the token

**Project Type**: CLI script beside the bot

**Performance Goals**: none; about 60 channels, within discord.js's built-in REST rate limiting

**Constraints**: no gateway login (Neil may be running on Wispbyte); dry run by default; a real run needs Administrator

**Scale/Scope**: one server per run; about 50 roles, 60 channels plus 3 per Alliance

## Constitution Check

| Principle | Result |
|-----------|--------|
| I Domain-Driven Slicing | Pass: named after the capability; terms from the dictionary. Alliance Duel and Kingdom vs Kingdom are added with the user's meaning |
| II/III Domain and TDD | Pass: planning is pure in `src/domain/`, tests first |
| IV Game API | Pass: the script doesn't use it |
| **V Least Privilege** | **Deviation, justified**: the script runs with temporary Administrator, the user's decision. ADR 12 records it and principle V gains the exception (constitution 1.1.0). Limits: dry run needs no Administrator, the report ends with the reminder to take it off, and running Neil gains no channel rights (FR-016). Renaming a role uses Manage Roles, which Neil holds |
| VI Documentation | Pass: guides, STATUS, ROADMAP, DICTIONARY in the slice |

Rechecked after design: unchanged.

## Project Structure

```text
specs/020-set-up-the-server/   plan, research, data-model, quickstart, contracts/cli.md, tasks
server-layout.json             the shipped Server Layout
scripts/setup-server.ts        entry: arguments, env, printing
src/domain/server-layout.ts    the layout's types and expansion to wanted categories and channels
src/domain/setup-plan.ts       planSetup(layout, server) -> Setup plan
src/discord/server-setup.ts    zod parsing of the file, REST port, read, apply, report text
src/domain/managed-roles.ts    allianceRoleName, isManagedRoleName, rolesFor
src/discord/member-roles.ts    rename of a plain Alliance role
```

**Structure Decision**: the existing domain-and-adapters layout; the entry sits with `register-commands.ts`.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| Temporary Administrator (V) | The user's decision: one permission for the owner to give and take | Listing the exact permissions was offered and declined |
