# Neil Constitution

Neil is a Discord bot, written in TypeScript, that manages the members of a Last Asylum: Plague Discord
server. It gives Members roles and nicknames based on in-game information from the Game API, and runs an
automated Onboarding Interview for everyone who joins. It is versioned on GitHub
([LilSticky/Neil](https://github.com/LilSticky/Neil)) and runs on Pella.

## Core Principles

### I. Domain-Driven Slicing

- The ubiquitous language in `documentation/DICTIONARY.md` is binding. Code, specs, tests, Discord texts
  and commits MUST use its terms. A missing or unclear term MUST be added or clarified in the dictionary
  (with the user's approval) before it is used in code.
- New domain concepts MUST come from domain discovery with the user, not from assumptions about the game
  or the server.
- Work MUST be sliced by what it lets a Member or an Officer do ("Look up a player", "Onboard a new
  member"), never by technology. Slash commands, the Game API client, caching and storage are adapters
  inside a slice and MUST NOT be slices of their own.

Rationale: the game's and the server's rules are the hard part; a shared language keeps humans and agents
aligned across long pauses.

### II. Test-Driven Development (NON-NEGOTIABLE)

- ALL implementation MUST follow red → green → refactor: domain logic, Discord handlers, the Game API
  client, storage and bug fixes alike. No production code without a failing test first.
- Tests use Vitest. Discord and the Game API are replaced by fakes at the adapter boundary; no test
  talks to the real Discord or the real Game API.
- The TDD guard hook (`.claude/hooks/tdd-guard.mjs`), the `tdd` skill and the `test-first` agent
  enforce this. They MUST NOT be bypassed.

Rationale: tests are the executable spec that lets autonomous agents change code safely.

### III. Framework-Free Domain

- The domain (`src/domain/`) MUST be pure TypeScript with no discord.js, HTTP, file system or timer
  imports. Time, randomness and I/O reach it as parameters or ports.
- Discord (gateway, slash commands, components), the Game API client and storage are adapters that
  depend on the domain, never the other way round.
- Types MUST be as strict as possible: no `any`, no non-null assertions to silence the compiler, and no
  invalid states the type can represent. Data from Discord, the Game API and storage is validated at the
  boundary before it reaches the domain.

Rationale: the rules stay testable in isolation and survive discord.js and API churn.

### IV. Respect the Game API

- Every call to the Game API MUST go through one client that enforces its rate limit and caches
  results. No other code may call the API directly.
- The bot MUST stay under the documented rate limit at all times, including at startup, during bursts of
  joins and after restarts. When the limit or the API is unavailable, the bot MUST degrade gracefully
  (queue, serve cached data, or tell the user to retry) and never retry in a tight loop.

Rationale: losing API access would break the bot's core purpose.

### V. Least Privilege, Careful With Members

- The bot MUST request only the Discord intents and permissions it needs, and MUST change only the
  roles it manages (an explicit, configured allow-list) and nicknames. It never grants administrative
  permissions.
- Secrets (bot token, API keys) live only in environment variables, never in the repository or logs.
- Personal data is kept to what a feature needs; what is stored and for how long is documented in an ADR.
- Actions that affect a Member (roles, nickname, kick) are logged to a configured channel so Officers
  can follow and undo them.

Rationale: the bot acts on real people in a real community.

### VI. Context Never Gets Lost

- `documentation/STATUS.md` MUST state the current slice with exactly one next concrete step, known
  broken/WIP items, and open questions. It MUST be updated in every change.
- `documentation/ROADMAP.md` MUST list the ordered slices and their state.
- Significant architecture decisions MUST be recorded as Nygard-style ADRs in `documentation/adr/`,
  listed in its index. Superseded ADRs are marked as such, never deleted.

Rationale: anyone (human or agent) must be able to resume from the repository alone.

### VII. Small Vertical Slices

- Each slice MUST be usable end to end on the test server, even if minimal.
- A slice MUST be small enough to finish within a few sessions; larger capabilities are split.

Rationale: frequent, visible progress keeps momentum.

## Product & Technical Constraints

- Runtime: Node.js 24 LTS, TypeScript in strict mode, ES modules. Discord library: discord.js (current
  major). The stack stays on current major versions.
- Two Discord servers: a **test server** for development and acceptance, and the **production server**.
  Guild IDs, role IDs and channel IDs are configuration, never hard-coded.
- Hosting: Pella. The bot is built in CI and deployed from `main`; deployment details are an ADR.
- Configuration and secrets come from environment variables, validated at startup; the bot refuses to
  start with invalid configuration.

## Development Workflow & Definition of Done

- Every slice goes through Spec Kit: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`, on its own slice branch.
- Agents work mostly autonomously. They MUST ask the user only for domain questions, dictionary changes,
  and decisions that change scope.
- A slice is Done only when ALL of these hold (the gate):
  1. Typecheck, lint and tests are green, locally and in CI.
  2. It was exercised on the test server, and the check is recorded in the slice's `tasks.md`.
  3. STATUS, ROADMAP, DICTIONARY and any affected ADRs are updated.
  4. It is committed on the slice branch and merged into `main` through a pull request that references
     its issues.
- When the gate is green, the agent squash-merges the pull request itself.

## Governance

- This constitution supersedes other practices; `AGENTS.md` holds runtime guidance and MUST NOT
  contradict it.
- Amendments require an ADR and a version bump of this document: MAJOR for removed or redefined
  principles, MINOR for new principles or sections, PATCH for clarifications.
- Every spec, plan and implementation MUST be checked against these principles (the Constitution Check
  in `/speckit-plan`); any deviation MUST be justified in the plan or rejected.

**Version**: 1.0.0 | **Ratified**: 2026-10-29 | **Last Amended**: 2026-10-29
