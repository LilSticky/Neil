# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

None. The agentic toolkit is set up (branch `000-agentic-toolkit`): constitution 1.0.0, AGENTS.md, Spec
Kit 1.2.0, agents, skills, TDD and usage guard hooks.

**Next step:** planning — domain discovery with the user, Game API documentation into
[GAME-API.md](GAME-API.md), then the roadmap slices and the foundation ADRs.

## Known broken / WIP

None.

## Open questions

- Game API: base URL, authentication, rate limit, endpoints (user has documentation).

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
