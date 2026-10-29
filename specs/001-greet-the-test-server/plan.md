# Implementation Plan: Greet the test server

**Branch**: `001-greet-the-test-server` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-greet-the-test-server/spec.md`

## Summary

Neil connects to Discord with validated configuration, answers a temporary `/ping` privately on the test
server (latency, version, start record), and runs on Wispbyte as the production bot (test server only).
CI checks every pull request and push; a green `main` is built and committed to a `deploy` branch that
Wispbyte pulls on every start. A start record in SQLite shows through `/ping` whether Wispbyte keeps the
data folder across restarts and redeploys. Details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (strict, ES modules) on Node.js 24 LTS

**Primary Dependencies**: discord.js (current major), zod; dev: typescript, tsx, vitest, eslint +
typescript-eslint

**Storage**: SQLite file `DATA_DIR/neil.db` via `node:sqlite` (ADR 5), start record only

**Testing**: Vitest; fakes for the Discord interaction port; real `node:sqlite` against a temp folder
for the storage adapter

**Target Platform**: Wispbyte (Pterodactyl-style panel, Linux container, 512 MB on the free plan);
Windows for development

**Project Type**: single-process Discord bot

**Performance Goals**: `/ping` answered within 3 s (Discord's interaction window); startup failure within 5 s

**Constraints**: least privilege (`Guilds` intent, permissions `0`); only green `main` deploys; no
secrets in logs; fits in 512 MB

**Scale/Scope**: one guild (the test server), one command

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Domain-driven slicing | Slice named by capability; no new domain terms (Configuration, Start record, Build info are technical) | Pass |
| II. TDD | Every `src/` file test-first; config, `recordStart`, `renderPingReply`, start-record store, ping handler, startup sequence all unit-tested; Discord via fakes | Pass |
| III. Framework-free domain | `recordStart` in `src/domain/` is pure (time passed in); discord.js only in `src/discord/`, `node:sqlite` only in `src/storage/` | Pass |
| IV. Respect the Game API | Not touched in this slice | N/A |
| V. Least privilege | `Guilds` intent only, permissions `0`, token only from env, never logged; no Member-affecting actions | Pass |
| VI. Context never gets lost | STATUS/ROADMAP per change; Wispbyte setup and persistence result in `documentation/HOSTING.md`; ADR 5 superseded if persistence fails | Pass |
| VII. Small vertical slices | Usable end to end on the test server; four small stories | Pass |
| Constraints | Node 24, strict TS, ESM, IDs in config, built in CI and deployed from `main` | Pass |

Post-design re-check (after Phase 1): unchanged, all pass. `GuildMembers` from ADR 6 is deferred to
slice 004 (least privilege now; ADR 6 states the eventual set, not a slice-001 requirement).

## Project Structure

### Documentation (this feature)

```text
specs/001-greet-the-test-server/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ping-command.md
│   └── configuration.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── start-record.ts          # StartRecord type, recordStart()
├── discord/
│   ├── client.ts                # discord.js client, Guilds intent, login, shutdown
│   ├── commands.ts              # command definitions (ping)
│   ├── ping.ts                  # renderPingReply(), ping interaction handler
│   └── __fakes__/               # fake interaction
├── storage/
│   ├── database.ts              # open neil.db, run migrations
│   └── start-record-store.ts    # load/save start record, zod-validated
├── build-info.ts                # read build-info.json or "dev"
├── config.ts                    # env → Configuration (zod), all errors collected
└── main.ts                      # composition root: config → storage → start record → client
scripts/
└── register-commands.ts         # npm run commands:register
.github/workflows/
└── ci.yml                       # checks on PR/push; deploy job on green main → deploy branch
documentation/
└── HOSTING.md                   # Wispbyte setup, restart/redeploy, persistence result
```

Tests sit next to their files (`*.test.ts`), as the `tdd` skill describes. Root files: `package.json`,
`package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `vitest.config.ts`,
`.nvmrc`, updated `env.example` and `.gitignore` (`data/`, `dist/`, `.env.production` already covered by `.env.*`).

**Structure Decision**: the layout planned in AGENTS.md, created now; only the folders this slice needs.

## Manual steps for the user

These need the user's accounts; tasks.md lists them where they block:

1. Create the production bot application in the Discord developer portal; invite both bots to the test
   server (scopes `bot applications.commands`, permissions `0`).
2. On the Wispbyte server: choose the Node.js 24 image, enter the Server Configuration values from
   research R1, and upload `.env` with the production bot's settings (research R8).
3. Optionally create a panel API key for automatic restarts and add it as a GitHub secret.

## Complexity Tracking

None: no constitution violations.
