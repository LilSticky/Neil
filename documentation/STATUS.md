# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

001 "Greet the test server": [spec](../specs/001-greet-the-test-server/spec.md) ·
[plan](../specs/001-greet-the-test-server/plan.md) · [tasks](../specs/001-greet-the-test-server/tasks.md).
Neil is the only bot application; it runs on Wispbyte (test server only for now) and locally with the
same token while Wispbyte is stopped.

Built and merged through PR #2: validated configuration, `/ping` (private reply with latency, version and
start record), SQLite start record, CI checks, and a deploy job that turns a green `main` into one new
commit on the `deploy` branch. Checked on the test server with `npm run dev` (T026, T027).

Live on Wispbyte: `/ping` shows `51c8ea0` (T039). Persistence (T040): the data folder survives a
Restart; the redeploy half is checked with the deploy of this docs change.

**Next step:** after this change's deploy, Restart Wispbyte, `/ping`: same first-start time and start #3
means data survives redeploys. Record T040, mark slice 001 done in the ROADMAP.

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
