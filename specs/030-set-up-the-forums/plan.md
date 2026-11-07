# Implementation Plan: Set up the forums

**Branch**: `030-set-up-the-forums` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/030-set-up-the-forums/spec.md`

## Summary

Each forum in `server-layout.json` gains a `forum` block: its tags, its default reaction and its how-to text. The setup
script reads the forums' tags, reactions and Neil's how-to posts, and plans what is missing or different: tags, reaction,
@everyone's Send Messages deny (Discord's recommended permission), and one pinned "How to post in #<forum>" post by Neil,
edited in place on later runs. Everything stays inside the owner's setup script (ADR 12); Neil at runtime is unchanged.

## Technical Context

**Language/Version**: TypeScript (strict), Node 24

**Primary Dependencies**: discord.js 14 (REST only in the script), zod 4

**Storage**: none (the script reads Discord, as in slice 029)

**Testing**: Vitest, with `FakeSetupServer` and the fake `SetupRest`

**Target Platform**: the owner's machine (`npm run server:setup`)

**Project Type**: Discord bot with an owner's CLI script

**Performance Goals**: about 5 extra archived-thread reads and 1 active-thread read per run

**Constraints**: at most 20 tags of at most 20 characters; post title at most 100 and message at most 2000 characters;
no pings; idempotent; one pinned post per forum (Discord)

**Scale/Scope**: 5 forums

## Constitution Check

| Principle | Check |
|-----------|-------|
| I. Domain-Driven Slicing | Named after what the owner and Members get. The new terms (Forum Setup, How-to Post, Forum Tag) are proposed for the Dictionary before it changes. ✅ |
| II. TDD | Each change starts with a failing test: expansion and planning in `src/domain/*.test.ts`, parsing, reading, applying and the report in `server-setup.test.ts`, REST in `setup-server-rest.test.ts`. ✅ |
| III. Framework-free domain | The how-to text, tag and reaction comparison and the new steps live in `src/domain/`. HTTP stays in `setup-server-rest.ts`. ✅ |
| IV. Game API | Not touched. ✅ |
| V. Least privilege | No new runtime right. The script's writes grow (forum settings, one thread per forum, its pin) inside the same Administrator run. Posts use `allowed_mentions: none`. ✅ |
| VI. Context | STATUS, ROADMAP, SERVER-SETUP, STARTUP-GUIDE, TEST-RUN §6y updated in the slice. ✅ |

No violations.

## Project Structure

### Documentation (this feature)

```text
specs/030-set-up-the-forums/
├── spec.md
├── how-to-posts.md      # approved texts
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/cli.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
server-layout.json                 # forum blocks: tags, reaction, how-to text
src/domain/server-layout.ts        # ForumSetup type; @everyone Send deny on forums; how-to post in the expansion
src/domain/forum-how-to.ts         # the how-to post's title and text (new)
src/domain/setup-plan.ts           # forum state; set-forum-tags, set-forum-reaction, open-, edit- and pin-how-to steps
src/discord/server-setup.ts        # parse the forum block; read tags, reaction and posts; apply; report lines
src/discord/setup-server-rest.ts   # forum PATCH, thread reads, start a post, pin it, edit it
src/discord/__fakes__/setup-server.ts
documentation/SERVER-SETUP.md, STARTUP-GUIDE.md, TEST-RUN.md, STATUS.md, ROADMAP.md, DICTIONARY.md (approved)
```

**Structure Decision**: the existing slice 020/029 modules plus `forum-how-to.ts`, next to `channel-description.ts`.

## Complexity Tracking

None.
