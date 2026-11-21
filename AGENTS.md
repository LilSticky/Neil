# Neil Agent Instructions

Neil is a Discord bot (TypeScript, discord.js) that manages the Members of a Last Asylum: Plague Discord
server: roles and nicknames from in-game information (the Game API), and an automated Onboarding
Interview for everyone who joins. Versioned on GitHub, hosted on Wispbyte (ADR 6).

Everything you need to resume lives in the repository. Keep it that way.

## Start here

Read [`documentation/STATUS.md`](documentation/STATUS.md) first: the current slice, the **one next
step**, known broken/WIP items, and open questions. Then read only what that step needs.

**"go"** means: resume without asking. Orient yourself (`git status`, open pull requests, STATUS's next
step, open issues, new feedback in the #330 server's `#neil-log`), take the next step, and run the usual loop through to the merge and the cleanup.
Ask only about domain, dictionary or scope questions.

| When you… | Read |
|-----------|------|
| work on a slice | `specs/<slice>/` (spec, plan, tasks) |
| name anything in code, tests, Discord texts or docs | [`documentation/DICTIONARY.md`](documentation/DICTIONARY.md) |
| make or question an architecture decision | the [ADR index](documentation/adr/README.md), then the ADRs it points to |
| plan, check the Definition of Done, or merge | [`.specify/memory/constitution.md`](.specify/memory/constitution.md); it overrides this file if the two disagree |
| change slice order or scope | [`documentation/ROADMAP.md`](documentation/ROADMAP.md) |
| touch the Game API client | [`documentation/GAME-API.md`](documentation/GAME-API.md) |
| touch a Discord adapter (`src/discord/`, `scripts/`) | [`documentation/DISCORD-PLATFORM.md`](documentation/DISCORD-PLATFORM.md) |

## Documentation sources

| Source | Purpose | Update when |
|--------|---------|-------------|
| `documentation/STATUS.md` | Where work stands right now | Every change |
| `documentation/ROADMAP.md` | Slices, ordered by capability | A slice changes state or scope |
| `documentation/DICTIONARY.md` | Domain terms | A term is added or clarified (only with user approval) |
| `documentation/GAME-API.md` | What we know about the Game API: endpoints, auth, rate limit | Something about the API is learned |
| `documentation/DISCORD-PLATFORM.md` | Discord's rules and limits: intents, permissions, rate limits, interactions | Something about Discord is learned |
| `documentation/adr/` | Architecture decisions (Nygard) | A significant decision is made (`adr` skill) |
| `.specify/memory/constitution.md` | Principles, Definition of Done, governance | Only through an ADR plus a version bump |
| `specs/NNN-slice/` | Spec Kit artifacts per slice | During the slice |
| [GitHub Issues](https://github.com/LilSticky/Neil/issues) | Bugs, slices, open questions (`gh issue`) | A bug or question is found or resolved |

## Workflow

- **Slices by capability, not technology.** Name a slice after what it lets a Member or Officer do
  ("Look up a player"), never after a layer ("API client", "caching"). Slash commands, the Game API
  client, cache and storage are adapters inside a slice.
- **Spec Kit per slice**, on branch `NNN-slice-name` from `develop`: `/speckit-specify` →
  `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
- **The loop**: spec → failing test → implementation → code review, repeated until green.
- **TDD for all code** (`tdd` skill): `test-first` agent for red, `implementer` for green. The TDD guard
  hook blocks edits to `src/` until a `*.test.ts` file has changed.
- **Domain discovery** and dictionary reviews go to the `domain-modeler` agent. It proposes; the user
  approves before `DICTIONARY.md` changes.
- **Commits**: small, one concern each, conventional-commit style (`feat:`, `fix:`, `docs:`, `chore:`,
  …, optional scope). Authored as `LilSticky <58908604+LilSticky@users.noreply.github.com>`, set per
  repository on every machine.
- **Author guard** (`.githooks/`): blocks a commit or push under a different identity than this clone
  last used. Set up once per clone: `git config core.hooksPath .githooks` and
  `git config neil.author "LilSticky <58908604+LilSticky@users.noreply.github.com>"`. A deliberate
  switch is confirmed by typing `yes`, or without a terminal with `NEIL_AUTHOR_CONFIRM=<email>`.
- **Branches** ([ADR 16](documentation/adr/0016-develop-branch-and-test-environment.md)): `develop` is the
  integration branch and the default; `main` is production. Every branch starts from `develop` and returns to it.
- **Pull requests**: every branch reaches `develop` through a pull request (`gh pr create`), never a local
  merge or direct push. The body lists every issue it touches: `Closes #N` / `Refs #N`.
- **Merging**: when CI passes, squash-merge into `develop` yourself (`gh pr merge --squash --delete-branch`),
  then switch to `develop`, pull, and have the `housekeeper` clean up local Git state. CI deploys `develop`
  to test Neil (`deploy-test`); the user restarts `lap-test-neil`.
- **Testing on test Neil** ([ADR 29](documentation/adr/0029-feedback-from-the-real-server-replaces-manual-checks.md)):
  a smoke test against the `-test` build through Neil Police ([NEIL-POLICE.md](documentation/NEIL-POLICE.md) section 3a),
  only what Police can arrange and read back by itself; hand the user no manual steps. Record it in `tasks.md`.
- **Feedback from the #330 server**: production Neil forwards `#suggestions` and `#feedback` posts to `#neil-log`. On
  "go", read the new lines through Police and file bugs and ideas as GitHub Issues in your own words, never with the
  Member's name.
- **Releases**: a pull request `develop` → `main` listing the slices and their checks, merged with a **merge
  commit** (`gh pr merge --merge`) once the user approved it. CI deploys `main` and fast-forwards `develop`.
  If something is merged red, say so in the PR and in STATUS.
- **Talking to the user**: work autonomously. Ask only about domain questions, dictionary changes and
  scope changes, always through interactive prompts, and keep chat output short. Detail belongs in files.

## Delegation

The main session orchestrates: it reads `tasks.md`, hands each step to the cheapest agent that can do
it, checks the diff and test result, and commits.

| Work | Agent | Model |
|------|-------|-------|
| Domain discovery, slicing, dictionary review | `domain-modeler` | sonnet |
| Failing test for one task (red) | `test-first` | haiku |
| Make it green, refactor (green) | `implementer` | haiku |
| Review Discord adapters, Game API client, security | `bot-reviewer` | sonnet |
| Slice vs. `spec.md` before merging | `spec-auditor` | sonnet |
| STATUS/ROADMAP, GitHub Issues, local Git cleanup | `housekeeper` | haiku |
| Broad read-only code search | `Explore` | haiku |

- **Loop per task**: `test-first` → `implementer` → `bot-reviewer` → fixes via `implementer` → commit.
- **Hand-off through files**: prompts name a task ID in `tasks.md` and the files involved; agents read
  the repository rather than the chat, and report in 5 lines or fewer.
- **One working tree per session.** Extra parallel work goes into its own worktree
  (`git worktree add ../Neil-<topic> -b <branch> origin/develop`).
- Escalate to a stronger model only when an agent fails twice on the same task.
- Agents without a `model:` in their frontmatter (`general-purpose`, `Explore`, `Plan`, …) run on haiku
  (`CLAUDE_CODE_SUBAGENT_MODEL` in `.claude/settings.json`); pass `model` explicitly only to escalate.
- Prefix noisy shell commands with `rtk` (Rust Token Killer, e.g. `rtk git status`, `rtk npm test`) when it
  is installed, to compress their output.

## Code conventions

- **Language**: dictionary terms in code, tests, Discord texts and commits. If a term is missing, ask.
- **Domain** (`src/domain/`): pure TypeScript, no discord.js / HTTP / fs / timers. Make invalid states
  unrepresentable.
- **Adapters** (`src/discord/`, `src/game-api/`, `src/storage/`): validate everything that comes in
  (zod or equivalent) before it reaches the domain.
- **Typing**: strict. No `any`, no non-null assertions to silence the compiler.
- **Game API**: only through the rate-limited, caching client (constitution IV).
- **Secrets**: environment variables only; never log tokens or keys.

## Layout (planned; created in slice 001)

- `src/domain/`: framework-free rules
- `src/discord/`: discord.js client, slash commands, event handlers
- `src/game-api/`: Game API client, rate limiter, cache
- `src/storage/`: persistence
- `src/config.ts`, `src/main.ts`: configuration and composition root
- `scripts/`: e.g. slash-command registration
- `documentation/`, `specs/`, `.specify/`: docs and Spec Kit
- `.claude/agents/`, `.claude/skills/`, `.claude/hooks/`: agent tooling

## Commands (planned; created in slice 001)

- `npm run dev`: run the bot locally against the test server, with reload
- `npm run build` / `npm start`: compile and run
- `npm run test` / `npm run test:watch`: Vitest
- `npm run lint`, `npm run typecheck`
- `npm run commands:register`: register slash commands with Discord

Development happens on Windows. The Bash tool is Git Bash and the primary shell is PowerShell.

<!-- knowledge-base -->
## Knowledge base

The project knowledge is searchable through the [knowledge tool](https://github.com/HBTGmbH/hbt-leviathan-hack26): MCP server `knowledge` with the tools `search`, `read`, `define`, `overview` and `decisions`, and for maintenance `decide`, `term`, `new_page`, `audit`, `status` and `check`. It combines two sources:

- **This repository** (public): `documentation/` (dictionary, ADRs, guides, discovery), `specs/*/spec.md` and the root Markdown files.
- **Shared Last Asylum: Plague domain** (private, marked **INTERN:LAP**): game knowledge every project around the game shares, such as Kingdom, Alliance, Alliance Rank, Alliance Duel and Might. Each machine connects it in `.knowledge.local.json` (gitignored).

- Look things up before answering questions about the game, the server, terms or decisions, and before changing code whose meaning is unclear. Cite the `id` of the source.
- `documentation/DICTIONARY.md` stays Neil's binding ubiquitous language; change it only through the `dictionary` skill. Game terms that are not specific to Neil also belong in the shared domain (`term` with scope `lap`).
- Results marked **INTERN:LAP** are private: use them to understand, never copy them literally into code, comments, test data, commits, issues, PRs or public docs. Write in your own words. A hook blocks literal copies; `check` scans the repository.
