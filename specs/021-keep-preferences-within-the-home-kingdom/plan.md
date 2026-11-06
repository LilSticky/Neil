# Implementation Plan: Keep Preferences within the Home Kingdom

**Branch**: `021-keep-preferences-within-the-home-kingdom` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/021-keep-preferences-within-the-home-kingdom/spec.md`

## Summary

Guests get no Preferences message and no Preference Roles. At a Link, Neil reads the Player's Kingdom directly. Everywhere
else it reads the Applied State: the Managed Roles last applied include `#<kingdom>`, so no new column, migration or Game API
call is needed. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript strict, Node.js 24 LTS

**Primary Dependencies**: discord.js

**Storage**: `neil.db`, unchanged (no migration)

**Testing**: Vitest, with fakes at the adapter boundary

**Target Platform**: Wispbyte

**Project Type**: Discord bot

**Performance Goals**: no extra Game API calls (SC-004)

**Constraints**: fail closed: no Preference Role for a Member whose Kingdom Neil doesn't know

**Scale/Scope**: about 8 source files, no new command

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after a capability. Dictionary wording goes to the user first (T011). |
| II. TDD | Every code task is red, then green. |
| III. Framework-Free Domain | The Kingdom rules are pure functions in `src/domain/preferences.ts`. |
| IV. Respect the Game API | No new calls: the Applied State is local. |
| V. Least Privilege | Fewer roles for Guests. Role changes are logged as before. No new stored data, so no ADR. |
| VI. Context Never Gets Lost | STATUS and ROADMAP change in this slice. |
| VII. Small Vertical Slices | One PR, usable on the test server. |

Passes before and after design.

## Project Structure

### Documentation (this feature)

```text
specs/021-keep-preferences-within-the-home-kingdom/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/guest-refusal.md
└── tasks.md
```

### Source Code (repository root)

```text
src/domain/preferences.ts             # Kingdom rules
src/discord/preferences.ts            # apply: gate on the Applied State
src/discord/preferences-after-link.ts # no message for a Guest; reports whether it posted
src/discord/preferences-choices.ts    # refusal on /channels and select menus
src/discord/preferences-texts.ts      # the refusal text
src/discord/interview.ts              # thread deleted when nothing was posted
src/discord/corrections.ts            # no /channels note for a Guest
src/discord/client.ts                 # wiring
```

**Structure Decision**: existing layout, no new files in `src/`.
