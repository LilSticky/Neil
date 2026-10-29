# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

001 "Greet the test server", branch `001-greet-the-test-server`. Spec written:
[specs/001-greet-the-test-server/spec.md](../specs/001-greet-the-test-server/spec.md). The toolkit and plan
(PR #1) are on `main`. Decided: the Wispbyte instance is the production bot, invited only to the test
server for this slice.

Clarified: `/ping` is open to anyone and temporary; Wispbyte's details are unknown and get researched in the plan.

Planned: [plan.md](../specs/001-greet-the-test-server/plan.md). CI builds a green `main` into a `deploy`
branch that Wispbyte pulls on start; a start record in SQLite makes persistence visible in `/ping`.

**Next step:** `/speckit-tasks` for slice 001.

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
