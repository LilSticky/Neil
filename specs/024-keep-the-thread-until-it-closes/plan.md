# Implementation Plan: Keep the thread until it closes

**Branch**: `024-keep-the-thread-until-it-closes` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

The Onboarding Role stops following the Link alone: it now also follows the Interview thread. Each place that closes a thread after
a Link takes the role off first, and the startup sweep leaves it on a Member whose thread is open.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24 LTS

**Storage**: `neil.db`, unchanged. No migration: `preference_prompt` and pending Rank Approvals already say which threads are open.

**Testing**: Vitest, with fakes at the adapter boundary

**Scale/Scope**: one domain rule, six adapter call sites, their tests, the guides

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what a Member keeps. Dictionary change decided by the user. |
| II. TDD | The tests change first. |
| III. Framework-Free Domain | `wantsOnboardingRole` stays pure, with one more input. |
| IV. Respect the Game API | No new calls. |
| V. Least Privilege | The role has no permissions. A Member sees `#onboarding` a little longer, nothing more. |
| VI. Context Never Gets Lost | STATUS, ROADMAP, DICTIONARY and the guides change in this slice. |
| VII. Small Vertical Slices | One PR. |

Passes. No ADR: this changes one role's timing, not the architecture.

## Decisions

- **Domain rule**: `wantsOnboardingRole({ bot, linked, threadOpen })` is `!bot && (!linked || threadOpen)`.
- **Thread open** means an open Preferences message (`preferences.prompt`) or a pending Rank Approval (`links.pendingFor`). The
  Onboarding Role service gets this as a dep; the Doctor Role's sweep doesn't change.
- **The call sites**: `finishLink` (`interview.ts`), `finishOfficerLink` and `/rank` (`corrections.ts`), `deleteApprovalThread`
  (`rank-approval.ts`), `finish` (`preferences-choices.ts`), `closeExpiredPreference` (`interview-sweeper.ts`).
- **The role comes off just before the thread is deleted**: `takeOff` never throws, so a failed deletion is retried as today, and
  a second `takeOff` changes nothing.
- **No change at Unlink or when a Member leaves**: an Unlinked Member wants the role, and a Member who left has none.
