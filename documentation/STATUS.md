# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

None yet. Branch `000-agentic-toolkit` holds the toolkit (constitution 1.0.1, AGENTS.md, Spec Kit 1.2.0,
agents, skills, TDD and usage guard hooks) and the plan: initial discovery, the Game API summary, the
roadmap (slices 001–005), ADRs 2–5 accepted, ADR 6 (host) proposed.

**Next step:** `/speckit-specify` for slice 001 "Greet the test server" on branch `001-greet-the-test-server`.

## Known broken / WIP

None.

## Open questions

See [discovery/initial.md](discovery/initial.md#open-questions): Officer Review on top of the uid, Alliance Rank in the
API, brackets, Home Kingdom and existing roles, nicknames over 32 characters, finding the uid in game,
host (Wispbyte or Pella) and disk persistence, Patreon tier. Only the host is needed before slice 001 ends.

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (1,000/UTC day), not a per-second limit; see ADR 4.
