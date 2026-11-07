# Implementation Plan: Rework the Server Layout

**Branch**: `029-rework-the-server-layout` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-rework-the-server-layout/spec.md`

## Summary

The shipped `server-layout.json` gets the user's eight changes, and the setup script learns to write a channel's
description: a topic, and one pinned message from Neil that adds who sees the channel and who posts, built from the
layout's permissions. `#rules` and `#guest-rules` add the approved code of conduct. Translated announcement copies are
generated from a `translations` list. All of it stays inside the owner's setup script (ADR 12); Neil at runtime is
unchanged.

## Technical Context

**Language/Version**: TypeScript (strict), Node 24

**Primary Dependencies**: discord.js 14 (REST only in the script), zod 4

**Storage**: none (the script reads Discord; research R3)

**Testing**: Vitest, with the existing `FakeSetupServer` and a fake `SetupRest`

**Target Platform**: the owner's machine (`npm run server:setup`)

**Project Type**: Discord bot with an owner's CLI script

**Performance Goals**: a full run on an empty server within a few minutes (about 70 extra pin reads, research R8)

**Constraints**: topic ≤ 1024, message ≤ 2000 characters; no pings; idempotent

**Scale/Scope**: about 75 channels

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what a Member and the owner get. New layout words (`description`, `codeOfConduct`, `translations`) are file fields, not domain terms; Dictionary updates are the category entries the merge changes (Home Kingdom information, Recruitment), proposed to the user before editing. ✅ |
| II. TDD | Every change starts with a failing test: domain expansion and planning in `src/domain/*.test.ts`, parsing, applying and the report in `server-setup.test.ts`, REST in `setup-server-rest.test.ts`, the shipped file in its own tests. ✅ |
| III. Framework-free domain | Expansion, access line, message text and the new steps live in `src/domain/`; HTTP stays in `setup-server-rest.ts`. ✅ |
| IV. Game API | Not touched. ✅ |
| V. Least privilege | No new runtime right. The script's writes grow (topics, messages, pins) inside the same Administrator run (research R9, ADR 12). Messages use `allowed_mentions: none`. ✅ |
| VI. Context | STATUS, ROADMAP, SERVER-SETUP §3, STARTUP-GUIDE, TEST-RUN §6v updated in the slice. ✅ |

No violations.

## Project Structure

### Documentation (this feature)

```text
specs/029-rework-the-server-layout/
├── spec.md
├── code-of-conduct.md   # approved texts
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/cli.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server-layout.json                 # the reworked layout, descriptions, code of conduct, translations
src/domain/server-layout.ts        # translations, copies, topic and message in the expansion, access line
src/domain/setup-plan.ts           # topic and description in the server state; set-topic, post- and edit-description
src/discord/server-setup.ts        # parse new fields, read topics and pins, apply the new steps, report lines
src/discord/setup-server-rest.ts   # topic in create/patch, pins read, post, pin, notice delete, edit
documentation/SERVER-SETUP.md, STARTUP-GUIDE.md, TEST-RUN.md, STATUS.md, ROADMAP.md, DICTIONARY.md (approved)
```

**Structure Decision**: the existing slice 020 modules; no new module unless the description text grows past a few
functions, then `src/domain/channel-description.ts`.

## Complexity Tracking

None.
