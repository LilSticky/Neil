# Implementation Plan: Onboarding in steps

**Branch**: `025-onboarding-in-steps` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md) | **Issue**: [#73](https://github.com/LilSticky/Neil/issues/73)

## Summary

Replace the four-menu Preferences message with four steps shown one at a time, in the Interview thread after the Link and with
`/channels`. The thread stays open until the Member finishes or the Interview times out. Rewrite the Interview's main texts in the
Liaison voice. No new storage, command or role.

Research and contracts are short, so they live here, as in recent slices. There is no data model change.

## Technical Context

**Language/Version**: TypeScript, strict, Node (as the repository)

**Primary Dependencies**: discord.js

**Storage**: none new; stored Preferences and the existing Preferences prompt are the only record, no migration

**Testing**: Vitest, with fakes at the Discord boundary

**Target Platform**: Wispbyte (ADR 6)

**Project Type**: Discord bot

**Constraints**: message content up to 2000 characters; select option description up to 100; custom id up to 100

**Scale/Scope**: 2 text modules, 1 handler

## Constitution Check

- I. Domain language: no dictionary change; "step" is a plain word here. Pass.
- II. TDD: every task below starts with a failing test. Pass.
- III. Framework-free domain: step order is a pure list in `src/domain/preferences.ts`. Pass.
- IV. Game API: no new call; the steps read stored data only. Pass.
- V. Least privilege: no new permission, role or intent. Pass.
- VI. Status and docs: STATUS, ROADMAP and TEST-RUN are updated. Pass.

## Decisions

### D1. Steps hold no state

The step lives in the custom id, the answers in the store. An old button shows that step from stored answers, so nothing goes stale.
Rejected: a stored current step, which would need a migration.

### D2. Custom ids

Select menus keep `pref:{question}:{memberId}`. A new button form `pref:go:{step}:{memberId}` shows a step, used by Next, Skip and
Back. `pref:done:{memberId}` stays. A select press re-renders the same step.

### D3. Next and Skip are one button

A step shows **Skip** while its question is unanswered and **Next** once answered; both go to the next step and change nothing. The
last step shows **Done** instead. Back is on every step but the first.

### D4. The thread stays open

The existing Preferences prompt already keeps the thread until Done or the sweeper's timeout, and already defers to a pending Rank
Approval. The steps reuse it. Slice 024 was changed at the user's word so that this stays, and owns how the Member keeps sight of
the thread once Linked (#66). Rebase on it before Phase B and re-read this decision.

Done deletes the thread at once, so a finishing message there is never read. The Experience step therefore carries the guides line
and the `/channels` note itself; the finishing message only stays on screen for `/channels` or a pending Rank Approval.

### D5. Explanations live in the adapter

Interest explanations are Discord text, so they go in `preferences-texts.ts`, as option descriptions of at most 100 characters.
Who is offered what stays in `interestOptions`.

### D6. Interview texts

`LINK_NOTE` stays for lookups. Only the texts in FR-012 change; buttons, custom ids, pings and log lines do not. Existing tests that
match exact wording are updated with the text.

## Project Structure

```text
src/domain/preferences.ts             # step order, next and previous step
src/discord/preferences-texts.ts      # step messages, finishing message
src/discord/preferences-choices.ts    # go press, select press re-renders its step, /channels starts at Languages
src/discord/preferences-after-link.ts # posts the Languages step
src/discord/interview-texts.ts        # Liaison voice (independent of slice 024)
```

## Order

Phase A (now, on this branch): Interview texts. Phase B (after slice 024 merges and this branch is rebased): everything else.

## Validation

Automated: `npm run test`, `npm run lint`, `npm run typecheck`. Manual: a new TEST-RUN.md section: Link on the test server, walk the
steps in the thread, let a second Member time out, then run `/channels`.

## Complexity Tracking

None.
