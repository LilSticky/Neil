# Implementation Plan: Choose Recruitment instead of Trading

**Branch**: `022-choose-recruitment-instead-of-trading` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

Replace the `trading` entry of `INTERESTS` in `src/domain/preferences.ts` with `recruitment` / `Recruitment`, in the same
place. Everything else follows from that list: the menu, role names, stored-value validation and accepted menu values.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24 LTS

**Storage**: `neil.db`, unchanged. No migration: nobody holds Trading, and the store already drops unknown answers.

**Testing**: Vitest, with fakes at the adapter boundary

**Scale/Scope**: one source file, its tests, the guides

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after a capability. Recruitment approved by the user and in the dictionary. |
| II. TDD | The tests change first, then the list. |
| III. Framework-Free Domain | The change is in `src/domain/`. |
| IV. Respect the Game API | No calls. |
| V. Least Privilege | One role swapped for another, no permissions. No new kind of stored data. |
| VI. Context Never Gets Lost | STATUS, ROADMAP and the guides change in this slice. |
| VII. Small Vertical Slices | One PR. |

Passes. No ADR: this is a change of content, not of architecture.

## Decisions

- **The key is `recruitment`, the role `Recruitment`**, in Trading's place in the list, so the menu order stays.
- **`Trading` is not kept as a retired role name**: the user deletes the role by hand, so Neil needs no code for it.
