# Implementation Plan: See what Neil can do

**Branch**: `027-see-what-neil-can-do` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

## Summary

A new `/help` command. `help-texts.ts` turns the REST payloads in `commands.ts` into lines, and `help.ts` answers privately, in the
shape of `usage.ts`.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24 LTS

**Storage**: none. No migration.

**Testing**: Vitest, with a fake interaction

**Scale/Scope**: one new command, two new files, a switch case and a handler in `client.ts`, the guides

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what a Member can do. No new term. |
| II. TDD | The tests come first. |
| III. Framework-Free Domain | No domain rule: the lines are presentation, in `src/discord/`. Officer check reuses `isOfficer`. |
| IV. Respect the Game API | No calls. |
| V. Least Privilege | Private answer, no new data, no permissions; Officer commands stay hidden from Members. |
| VI. Context Never Gets Lost | STATUS, ROADMAP and the guides change in this slice. |
| VII. Small Vertical Slices | One PR. |

Passes. No ADR.

## Decisions

- **`helpReply(commands, { officer })`** takes the payloads as an argument, so tests can pass a new command (scenario 6).
- **An Officer command** is one whose `default_member_permissions` is `"0"`, the existing `HIDDEN_FROM_MEMBERS`.
- **One line per command or subcommand**: `` `/reaper closest [x] [y] [all]` — The 3 closest Exiles… ``. The purpose is the description.
- **An embed, not `content`**: its 4096-character description leaves room as commands are added; 2000 would be close for an Officer.
  A test holds the Officer answer under the limit.
- **Officer commands go in their own section**, after the Member list.
- **`handleHelp(interaction, context)`** mirrors `handleUsage`: a failed reply is logged, never thrown.
