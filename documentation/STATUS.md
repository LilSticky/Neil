# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

None yet. Branch `000-agentic-toolkit` holds the toolkit (constitution 1.0.2, AGENTS.md, Spec Kit 1.2.0,
agents, skills, TDD and usage guard hooks) and the plan: initial discovery, the Game API summary, the
roadmap (slices 001–005), ADRs 1–6 accepted (production on Wispbyte).

**Next step:** `/speckit-specify` for slice 001 "Greet the test server" on branch `001-greet-the-test-server`.

## Known broken / WIP

None.

## Open questions

See [discovery/initial.md](discovery/initial.md#open-questions): which Discord roles exist and which Neil
may manage (needed by slice 005); whether Wispbyte's disk persists (checked in slice 001).

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
