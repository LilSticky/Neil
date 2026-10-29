# Feature Specification: Greet the test server

**Feature Branch**: `001-greet-the-test-server`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Slice 001 'Greet the test server': lets an Officer see Neil online and answer
`/ping` on the test server, deployed from `main` to Wispbyte. Domain: none beyond config validation.
Adapters: discord.js client, slash-command registration, env config, CI (typecheck, lint, test), Wispbyte
deploy (ADR 6), persistence check (does Wispbyte's disk persist across restarts/redeploys)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Neil online and get an answer to `/ping` (Priority: P1)

An Officer opens the test server, sees Neil listed as online, runs `/ping`, and gets a short answer
from Neil that confirms it is alive, how quickly it answered, and which build is running.

**Why this priority**: it is the smallest thing that proves the whole chain works: configuration,
connection to Discord, slash commands, and a reply. Every later slice builds on it.

**Independent Test**: start Neil against the test server, run `/ping`, and read the answer.

**Acceptance Scenarios**:

1. **Given** Neil is running with valid configuration, **When** an Officer looks at the test server's
   member list, **Then** Neil is shown as online.
2. **Given** Neil is online, **When** a Member runs `/ping` on the test server, **Then** Neil answers
   within 3 seconds with a reply only that Member sees, containing a greeting, the response latency,
   and the version (build identifier) that is running.
3. **Given** `/ping` was registered for the test server, **When** a Member types `/` in the test server,
   **Then** `/ping` is offered with a short description.

---

### User Story 2 - Neil refuses to start with bad configuration (Priority: P1)

Whoever starts Neil (a developer locally, or the host) gets a clear, immediate error naming every
missing or invalid setting, instead of a bot that half-works.

**Why this priority**: the constitution requires validated configuration at startup; every later slice
adds settings, so the rule must exist from the start.

**Independent Test**: start Neil with a missing or malformed setting and read the error.

**Acceptance Scenarios**:

1. **Given** a required setting (for example the bot token or the test server's ID) is missing,
   **When** Neil starts, **Then** it exits with a non-zero status and an error that names the setting.
2. **Given** several settings are invalid, **When** Neil starts, **Then** the error lists all of them,
   not only the first.
3. **Given** any startup error, **When** it is printed, **Then** no secret value (such as the token)
   appears in the output.

---

### User Story 3 - Neil runs on Wispbyte, deployed from `main` (Priority: P2)

A change merged into `main` passes the automated checks and then runs as the production bot on Wispbyte,
which for this slice is a member of the test server only. The Officer can tell from `/ping` which build
is live.

**Why this priority**: an always-on host is the point of the bot, but a locally running Neil already
proves Stories 1 and 2.

**Independent Test**: merge a change into `main`, wait for the deploy, run `/ping` on the test server
and check that the reported version matches the merged commit.

**Acceptance Scenarios**:

1. **Given** a pull request, **When** it is opened or updated, **Then** typecheck, lint and tests run
   automatically and the result is shown on the pull request.
2. **Given** a change is merged into `main` with green checks, **When** the deploy has finished,
   **Then** `/ping` on the test server reports the version of that merge.
3. **Given** the checks on `main` are red, **When** a deploy would happen, **Then** the red build is not
   deployed.
4. **Given** the deploy steps on Wispbyte, **When** someone has to redo them, **Then** they are written
   down in the repository (start command, how code gets there, where settings go, which folder persists).

---

### User Story 4 - Know whether Neil's data survives restarts and redeploys (Priority: P2)

An Officer can see from `/ping` since when Neil's data folder has existed and how many times Neil has
started with it, so a restart or redeploy that wiped the data is visible at once.

**Why this priority**: ADR 5 (storage) depends on Wispbyte keeping the data folder; slice 001 must
confirm it before later slices store Links.

**Independent Test**: run `/ping`, restart Neil, run `/ping` again; then redeploy and run it a third
time. The first-start time stays the same and the start count goes up if the data persisted.

**Acceptance Scenarios**:

1. **Given** an empty data folder, **When** Neil starts, **Then** it records the first-start time and a
   start count of 1, and `/ping` reports both.
2. **Given** an existing data folder, **When** Neil restarts, **Then** the first-start time is unchanged
   and the start count goes up by one.
3. **Given** the check was done on Wispbyte for a restart and a redeploy, **When** the slice is
   finished, **Then** the result is recorded in the repository, and ADR 5 is superseded if the data did
   not survive.

### Edge Cases

- The data folder is missing or not writable: Neil refuses to start and names the folder.
- The start record in the data folder is corrupt: Neil refuses to start rather than silently resetting
  the count (a reset would hide the very data loss the check looks for).
- Discord is unreachable or the token is rejected: Neil logs the reason without the token and exits
  with a non-zero status, so the host can restart it; it does not retry in a tight loop.
- `/ping` is run in a server other than the configured test server: it is not registered there, so it
  is not offered.
- Neil is stopped by the host (shutdown signal): it disconnects cleanly from Discord.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Neil MUST read its configuration only from environment variables and validate all of it
  at startup before connecting to Discord.
- **FR-002**: Neil MUST refuse to start on invalid configuration, listing every invalid or missing
  setting by name and never printing secret values.
- **FR-003**: Neil MUST connect to Discord and appear online on the test server.
- **FR-004**: Neil MUST offer a `/ping` slash command on the configured test server.
- **FR-005**: `/ping` MUST answer the caller privately with a greeting, the response latency, the
  running version, the first-start time and the start count.
- **FR-006**: Registering slash commands MUST be a separate, repeatable step that registers commands for
  the configured server only.
- **FR-007**: Neil MUST keep a start record in its data folder (first-start time, number of starts),
  updated on every start.
- **FR-008**: Neil MUST request only the Discord permissions and gateway intents this slice and the
  accepted ADRs call for, and no administrative permission.
- **FR-009**: Every pull request and every push to `main` MUST run typecheck, lint and tests
  automatically.
- **FR-010**: Only a `main` build with green checks MUST reach Wispbyte.
- **FR-011**: The Wispbyte setup and the result of the persistence check MUST be documented in the
  repository.
- **FR-012**: Neil MUST shut down cleanly on a stop signal.

### Key Entities

- **Configuration**: the validated settings Neil starts with: bot token, application ID, test server
  ID, data folder, version. Invalid configuration cannot exist past startup.
- **Start record**: first-start time and start count, kept in the data folder; evidence of persistence.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Officer gets an answer to `/ping` on the test server within 3 seconds, every time Neil
  is online.
- **SC-002**: Starting Neil with any single required setting missing fails within 5 seconds with a
  message naming that setting, in 100% of cases.
- **SC-003**: A change merged into `main` is live on Wispbyte (visible as the version in `/ping`)
  within 15 minutes, without copying code by hand.
- **SC-004**: The persistence question (restart and redeploy) has a recorded yes/no answer by the end of
  the slice.

## Assumptions

- Officer roles are not yet known (see DICTIONARY), so `/ping` is open to every Member of the test
  server; it reveals nothing sensitive.
- The production bot application runs on Wispbyte and, for this slice, is invited only to the test
  server; it joins the production server in a later slice (user decision, 2026-10-29). The test bot
  application runs locally with `npm run dev`.
- The version shown is the commit identifier of the build, supplied through configuration.
- Wispbyte offers environment variables, a folder that may persist, and a way to run
  `npm ci && npm run build && npm start` (ADR 6); the exact mechanism is worked out in the plan.
- The persistence check on Wispbyte and the test-server check are manual steps, recorded in
  `tasks.md` (Definition of Done).
