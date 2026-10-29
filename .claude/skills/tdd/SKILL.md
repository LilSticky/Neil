---
name: tdd
description: Strict test-driven development loop (red → green → refactor) for any implementation in Neil — domain rules, Discord handlers, the Game API client, storage. Use whenever implementing or changing behaviour, including `/speckit-implement` tasks and bug fixes. Explains the TDD guard hooks and how to test without the real Discord or Game API.
---

# TDD workflow

All production code is written test-first. Work in small cycles, one behaviour per cycle.

## Cycle

1. **Red** — delegate to the `test-first` agent (or follow its rules yourself for a tiny change): the smallest failing test for one behaviour; run it; confirm it fails for the expected reason. Bug fix → first a test that reproduces the bug.
2. **Green** — delegate to the `implementer` agent, which also does step 3: the minimum production code to pass. Run the test, then `npm run test`.
3. **Refactor** — with everything green, clean up (dictionary names, strict typing, duplication). Rerun tests after each step. Never change behaviour here.
4. Repeat. Tick the task in `tasks.md` only once its tests are green.

## Test levels

| Level | Where | Use for |
|-------|-------|---------|
| Domain | `src/domain/**/*.test.ts` | rules: role mapping, nickname format, interview flow, eligibility |
| Game API client | `src/game-api/**/*.test.ts` with a fake `fetch`, recorded `__fixtures__/` and `vi.useFakeTimers()` | request shape, schema validation, rate limit, cache TTL, 429/`Retry-After`, outages |
| Discord adapter | `src/discord/**/*.test.ts` with fakes from `__fakes__/` | a command or event handler: what it replies, which port calls it makes, deferring, error replies |
| Test server | manual, recorded in `tasks.md` | one happy path per user flow, once per slice (Definition of Done 2) |

- Push logic down into the domain until a plain unit test covers it. Discord handlers stay thin: parse → call domain → render reply.
- Fakes implement the same port interfaces as the real adapters; never mock discord.js internals.
- In the cycle run only the file you touched (`npx vitest run <file>`); the full `npm run test` at green.
- No test talks to the real Discord or the real Game API. Fixtures are recorded once from the real API, scrubbed of tokens and personal data.

## Guards (hooks in `.claude/settings.json`, script `.claude/hooks/tdd-guard.mjs`)

- **Pre-edit guard**: edits to production files in `src/` are blocked while no test file (`*.test.ts`, `__fakes__/`, `__fixtures__/`) is changed in the git working tree. If blocked, write the failing test first. Exemptions live in the script's `EXEMPT` list; change them only with the user's consent.
- **Stop guard**: when code or tests changed in this session, `npm run lint` and `npm run test` run at the end of a turn; on failure the turn continues with the output. In a deliberate red phase, say explicitly that the suite is red on purpose and which test is expected to fail.

Commit at green so the working tree — and with it the pre-edit guard — resets per cycle.

## Reporting
State per cycle: test added, red output (trimmed), what made it green, refactorings. Never claim done while anything is red.
