---
description: "Task list for slice 001, Greet the test server"
---

# Tasks: Greet the test server

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: required. The constitution (principle II) makes TDD mandatory: every `src/` task below is a
pair, a failing test first (`test-first` agent), then the code that makes it green (`implementer`).
Tests sit next to their files as `*.test.ts`.

**Organization**: by user story. US1 and US2 are P1, US3 and US4 are P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

**Purpose**: an empty but working TypeScript project with all checks runnable.

- [X] T001 Create `package.json` (`"type": "module"`, `"engines": { "node": ">=24" }`, scripts from
  [contracts/configuration.md](contracts/configuration.md#npm-scripts): `dev` = `tsx watch --env-file=.env src/main.ts`,
  `build` = `tsc -p tsconfig.build.json`, `start` = `node dist/main.js`, `test` = `vitest run`, `test:watch` = `vitest`,
  `lint` = `eslint .`, `typecheck` = `tsc --noEmit`, `commands:register` = `tsx scripts/register-commands.ts`),
  install `discord.js` and `zod`, dev deps `typescript`, `tsx`, `vitest`, `eslint`, `typescript-eslint`, `@types/node`;
  commit `package-lock.json`; add `.nvmrc` with `24`
- [X] T002 [P] Create `tsconfig.json` (strict, `module`/`moduleResolution` `NodeNext`, target ES2024, `noEmit`,
  includes `src`, `scripts`, configs) and `tsconfig.build.json` (extends it, emits `src/` to `dist/`, excludes `*.test.ts`
  and `__fakes__`)
- [X] T003 [P] Create `eslint.config.js` (flat config, typescript-eslint `strictTypeChecked`, ignores `dist/`) and
  `vitest.config.ts` (node environment, `src/**/*.test.ts`)
- [X] T004 [P] Update `.gitignore` (`dist/`, `data/`, `node_modules/`; `.env.*` stays ignored, `env.example` stays
  tracked) and `env.example` (add `DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID`, `DATA_DIR=./data`
  with placeholders; keep `LAP_TRACKER_API_KEY`, `HOME_KINGDOM` marked "from slice 002")
- [X] T005 Add a trivial `src/smoke.test.ts` that passes, run `npm run typecheck`, `npm run lint`, `npm run test`
  and fix the config until all three are green; delete the smoke test in T009

**Checkpoint**: `npm run typecheck`, `lint`, `test` run green on an empty project.

---

## Phase 2: Foundational

**Purpose**: CI on every pull request and push (FR-009), so every later task is checked.

- [X] T006 Create `.github/workflows/ci.yml` job `checks`: on `pull_request` and `push` to `main`; `actions/setup-node`
  with `node-version-file: .nvmrc` and npm cache; `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`,
  `npm run build`
- [X] T007 Push the branch and confirm the `checks` job runs green on the pull request (open it as a draft
  with `gh pr create --draft`, body `Refs` the slice issue)

**Checkpoint**: CI shows its result on the pull request (US3 scenario 1).

---

## Phase 3: User Story 2 - Neil refuses to start with bad configuration (P1)

**Goal**: startup validates every setting and fails with all problems named, no secret shown.

**Independent test**: `npm start` without `DISCORD_TOKEN` and `DISCORD_GUILD_ID` exits 1 and names both.

Done before US1 because US1's composition root needs the typed `Configuration`.

- [X] T008 [US2] Test `src/config.test.ts`: `loadConfig(env)` returns a `Configuration` (`discordToken`,
  `applicationId`, `guildId`, `dataDir`) for valid input; `DATA_DIR` defaults to `./data`; `DISCORD_TOKEN`
  "required, non-empty"; `DISCORD_APPLICATION_ID` and `DISCORD_GUILD_ID` "Discord snowflake (17–20 digits)";
  missing and invalid settings are **all** reported in one error, each line `- NAME: rule` as in
  [contracts/configuration.md](contracts/configuration.md#startup-output-on-invalid-configuration); the error
  text never contains the token value (use a distinctive fake token and assert it is absent)
- [X] T009 [US2] Implement `src/config.ts` with zod: `loadConfig(env: Record<string, string | undefined>)` returning
  `Configuration` or throwing `ConfigError` with the list of problems; no `process.env` access inside; delete
  `src/smoke.test.ts`
- [X] T010 [US2] Test `src/storage/data-dir.test.ts` (temp folder): `prepareDataDir(path)` creates a missing folder,
  accepts an existing writable one, and fails with `DATA_DIR: <path> is not writable` for a path that cannot be
  written (e.g. a path below a regular file)
- [X] T011 [US2] Implement `src/storage/data-dir.ts` `prepareDataDir`
- [X] T012 [US2] Test `src/startup.test.ts`: `formatStartupError(error)` prints
  `Neil cannot start, configuration is invalid:` plus the problem lines for a `ConfigError`, and a one-line
  message for other startup errors; never includes values passed as secrets
- [X] T013 [US2] Implement `src/startup.ts` `formatStartupError`

**Checkpoint**: config and data folder failures are named, complete and secret-free.

---

## Phase 4: User Story 1 - See Neil online and get an answer to `/ping` (P1) 🎯 MVP

**Goal**: Neil logs in with the `Guilds` intent and answers `/ping` privately.

**Independent test**: `npm run commands:register`, `npm run dev`, run `/ping` on the test server.

The reply's start record line comes from US4 (T034) and the real version from US3 (T036). Until then
`start` passes version `dev` and an in-memory start record of `{ firstStartedAt: now, startCount: 1 }`.

- [X] T014 [P] [US1] Test `src/discord/ping.test.ts`: `renderPingReply(input)` produces exactly the four lines
  of [contracts/ping-command.md](contracts/ping-command.md#reply); gateway `–` when the ping is unknown (`-1` or
  undefined); version `dev` without the `(built …)` part; times UTC at minute precision
- [X] T015 [US1] Implement `renderPingReply` in `src/discord/ping.ts`
- [ ] T016 [US1] Test `src/discord/ping.test.ts` (handler) with a fake interaction in `src/discord/__fakes__/interaction.ts`:
  `handlePing` replies once, ephemeral (`MessageFlags.Ephemeral`), with the rendered text, latency measured from
  `createdTimestamp` with an injected clock; a reply that throws is logged without tokens and does not rethrow
- [ ] T017 [US1] Implement `handlePing` in `src/discord/ping.ts`, typed against a narrow interaction port (only the
  fields it uses), not the full discord.js class
- [ ] T018 [P] [US1] Test `src/discord/commands.test.ts`: the command list holds exactly `ping`, description
  `Check that Neil is online`, no options, no default member permissions, contexts guild only
- [ ] T019 [US1] Implement `src/discord/commands.ts` with `SlashCommandBuilder`
- [ ] T020 [US1] Test `src/discord/client.test.ts`: `createClient()` requests intents `Guilds` only (FR-008);
  the interaction router calls `handlePing` for chat-input `ping` and ignores everything else
- [ ] T021 [US1] Implement `src/discord/client.ts` (client factory, interaction router, `login`, `destroy`)
- [ ] T022 [US1] Test `src/main.test.ts` for `start(deps)` with fakes for config, data folder, store and client:
  the order is `.env` load → config → data folder → start record → login; any failure before login prints
  `formatStartupError` to stderr and exits 1 without calling login; rejected login exits 1 without the token in
  output; `SIGINT`/`SIGTERM` destroy the client, close the database and exit 0 (FR-012)
- [ ] T023 [US1] Implement `src/main.ts`: `process.loadEnvFile('.env')` only if the file exists (process env wins,
  research R8), then `start` with real dependencies; no logic beyond composition
- [ ] T024 [US1] Implement `scripts/register-commands.ts`: reads config via `loadConfig`, `PUT` the command list to
  `/applications/{applicationId}/guilds/{guildId}/commands` with discord.js `REST`; prints count, never the token;
  add a test only if it grows logic beyond the call
- [ ] T025 [US1] **Manual (user)**: fill the local `.env` from `env.example` with Neil's values (the one bot
  application, already on the test server). Before each local run, **Stop** the Wispbyte server; **Start** it
  afterwards
- [ ] T026 [US1] **Manual check on the test server**: Wispbyte stopped, `npm run commands:register`, `npm run dev`; Neil is online,
  `/` offers `/ping` with its description, the reply arrives within 3 s, ephemeral, version `dev`. Record the date
  and result here: _not yet done_
- [ ] T027 [US2] **Manual check**: `npm start` with `DISCORD_TOKEN` and `DISCORD_GUILD_ID` removed exits 1 within
  5 s and names both, no token shown. Record here: _not yet done_

**Checkpoint**: MVP, the bot runs locally and answers `/ping`.

---

## Phase 5: User Story 4 - Know whether Neil's data survives restarts and redeploys (P2)

**Goal**: a start record in SQLite that `/ping` reports.

**Independent test**: `/ping`, restart, `/ping`: same first start, start count +1.

Placed before US3 so the deploy ships the store; the Wispbyte part of the check (T040) runs after US3.

- [X] T028 [P] [US4] Test `src/domain/start-record.test.ts`: `recordStart(undefined, now)` →
  `{ firstStartedAt: now, startCount: 1 }`; `recordStart(previous, now)` keeps `firstStartedAt` and adds 1;
  the `StartRecord` type allows only `startCount` "integer ≥ 1"
- [X] T029 [US4] Implement `src/domain/start-record.ts` (pure, time passed in, no I/O)
- [ ] T030 [US4] Test `src/storage/database.test.ts` (real `node:sqlite`, temp folder): `openDatabase(dataDir)` creates
  `neil.db`, creates `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`, applies migration 1
  `start_record(id INTEGER PRIMARY KEY CHECK (id = 1), first_started_at TEXT NOT NULL, start_count INTEGER NOT NULL
  CHECK (start_count >= 1))` in a transaction, and does not reapply it on a second open
- [ ] T031 [US4] Implement `src/storage/database.ts` with an ordered migrations list
- [ ] T032 [US4] Test `src/storage/start-record-store.test.ts`: `load()` returns `undefined` on an empty table, the
  saved record after `save()`; a corrupt row (bad timestamp, `start_count` 0 written past the check, wrong type) is
  a startup error naming the start record, never a reset (spec edge case)
- [ ] T033 [US4] Implement `src/storage/start-record-store.ts` with zod validation of the row
- [ ] T034 [US4] Wire the store into `start` in `src/main.ts` (load → `recordStart` → save before login, record passed
  to the ping handler) and extend `src/main.test.ts` first

**Checkpoint**: `/ping` locally shows "Data kept since … · start #N", and N rises with each `npm run dev` restart.

---

## Phase 6: User Story 3 - Neil runs on Wispbyte, deployed from `main` (P2)

**Goal**: a green `main` lands on the `deploy` branch; Wispbyte runs it after a restart.

**Independent test**: merge to `main`, restart in the panel, `/ping` shows the merge's short sha.

- [ ] T035 [P] [US3] Test `src/build-info.test.ts` (temp folder): `readBuildInfo(path)` returns version `dev` without
  the file; `{ version, builtAt }` for a valid file (`version` "non-empty string", `builtAt` "ISO 8601 timestamp");
  a present but invalid file is a startup error
- [ ] T036 [US3] Implement `src/build-info.ts` and pass the build info into `start` (test in `src/main.test.ts` first)
- [ ] T037 [US3] Add job `deploy` to `.github/workflows/ci.yml`: only on `push` to `main`, `needs: checks`,
  `permissions: contents: write`, `concurrency` group so deploys never overlap; builds, writes `build-info.json`
  (short sha, UTC time), strips `devDependencies` and `scripts.prepare` from `package.json`, and commits `dist/`,
  `package.json`, `package-lock.json`, `build-info.json` as one new commit on top of `origin/deploy` (never
  force-push, never include `.env` or `data/`)
- [ ] T038 [US3] Update `documentation/HOSTING.md`: Server Configuration values (research R1), settings in the panel's
  environment variables → `.env` (R8), the `deploy` branch, manual **Restart** after each deploy, `data/` as the
  persistent folder, a reinstall wiping it, stop Wispbyte before `npm run dev`
- [ ] T039 [US3] **Manual check on Wispbyte** after this branch merges: CI deploy job green, `deploy` branch has the
  build, **Restart** in the panel, `/ping`
  shows the merge's short sha within 15 minutes of the merge. Record here: _not yet done_
- [ ] T040 [US4] **Manual persistence check on Wispbyte**: `/ping` (note first start, #), Restart, `/ping` (same, #+1),
  merge any small change to redeploy, Restart, `/ping` (same, #+1). Record yes/no here and in
  `documentation/HOSTING.md`; if the first start changed, supersede ADR 5 with the `adr` skill. Record here:
  _not yet done_

**Checkpoint**: Neil is live on Wispbyte and the persistence question has an answer (SC-004).

---

## Phase 7: Polish

- [ ] T041 `bot-reviewer` over `src/` and `.github/workflows/ci.yml` (intents, permissions, secrets, boundary
  validation); fixes through `implementer`
- [ ] T042 `spec-auditor` against spec.md acceptance scenarios; close gaps
- [ ] T043 Update `documentation/STATUS.md`, `documentation/ROADMAP.md` (slice 001 done), ADRs if affected;
  mark the PR ready, squash-merge when the Definition of Done gate is green, then `housekeeper` cleanup

Note: T039 and T040 need a merged `main`. Merge when T001–T038 and T041–T043 are done and T026/T027 are
recorded; then do T039 and T040 on `main` and record them in a follow-up `docs:` PR. STATUS says so until
both are recorded.

---

## Dependencies

- Phase 1 → Phase 2 → everything else.
- US2 (T008–T013) before US1's composition root (T022–T023).
- US1 T014–T021 and US4 T028–T033 are independent of each other and can run in parallel.
- T034 needs T023 and T033; T036 needs T023 and T035.
- T037 needs T006; T039 needs the merge; T040 needs T039.

## Parallel examples

- Phase 1: T002, T003, T004 together after T001.
- After Phase 2: T014 (ping reply), T018 (commands), T028 (start record domain), T035 (build info) are
  separate files and can go to separate `test-first` runs.

## Implementation strategy

1. Setup and CI (Phases 1–2), so every commit is checked.
2. US2, then US1: the local MVP, checked on the test server (T026, T027).
3. US4 locally, then US3: deploy, then the Wispbyte checks after merge.
4. One commit per task pair (red + green), conventional-commit messages.
