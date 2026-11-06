# Implementation Plan: No Rank Approval for Guests

**Branch**: `023-no-rank-approval-for-guests` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

`pendingApprovalFor` in `src/discord/interview.ts` decides whether a Link opens a Rank Approval, for both the Interview Link and
the Officer Link. It also needs to know the Player and the Home Kingdom, and returns nothing for a Guest. With no draft stored,
the existing path closes the thread.

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24 LTS

**Storage**: `neil.db`, unchanged. No migration: nothing is live.

**Testing**: Vitest, with fakes at the adapter boundary

**Scale/Scope**: two adapters and the composition root, their tests, the guides

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what happens for a Guest. Uses Guest and Rank Approval as in the dictionary. |
| II. TDD | The tests come first. |
| III. Framework-Free Domain | The rule is pure and sits with `needsRankApproval`. |
| IV. Respect the Game API | No new calls. |
| V. Least Privilege | Nobody gains anything; a ping to a Guest leader goes away. |
| VI. Context Never Gets Lost | STATUS, ROADMAP, DICTIONARY and the guides change in this slice. |
| VII. Small Vertical Slices | One PR. |

Passes. No ADR: a rule change, not an architecture change.

## Decisions

- **One decision point**: both Links already go through `pendingApprovalFor`, so the Guest rule lives there and not in each caller.
- **`/rank` is untouched**: it doesn't go through `pendingApprovalFor`.
- **A pending Rank Approval is not cancelled** when its Member becomes a Guest: that case doesn't justify new code now.
