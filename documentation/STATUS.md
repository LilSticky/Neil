# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

Slices 005–012 are on `main` (squash-merged, PRs [#16](https://github.com/LilSticky/Neil/pull/16),
[#22](https://github.com/LilSticky/Neil/pull/22), [#24](https://github.com/LilSticky/Neil/pull/24),
[#26](https://github.com/LilSticky/Neil/pull/26), [#28](https://github.com/LilSticky/Neil/pull/28),
[#30](https://github.com/LilSticky/Neil/pull/30), [#32](https://github.com/LilSticky/Neil/pull/32),
[#34](https://github.com/LilSticky/Neil/pull/34)) and deployed to the `deploy` branch. The `npm run commands:register`
run is done (8 commands).

The manual checks are **still open (red)**: [TEST-RUN.md](TEST-RUN.md) sections 2b–6h, the manual check T024 of slice 005,
and the manual-check tasks of slices 006–012. Nothing in them has been run yet.

Earlier: slices 001–004 are done and merged (Greet the test server, Look up a player, Look up players within the daily
quota, Find a player by name or alliance; details in [tasks.md](../specs/001-greet-the-test-server/tasks.md) and
[ROADMAP.md](ROADMAP.md)). Fixes from the test run for 004 (PRs #18, #20) are merged too.

**Next step:** the user does the Wispbyte setup from [HOSTING.md](HOSTING.md) §3: Server Members Intent on, the channel
IDs `DISCORD_ONBOARDING_CHANNEL_ID` and `DISCORD_LOG_CHANNEL_ID`, `HOME_KINGDOM`, optionally `SYNC_HOUR_UTC`, and Neil's
role with Manage Roles and Manage Nicknames placed above the Managed Roles. Then restart Neil on Wispbyte, and run
[TEST-RUN.md](TEST-RUN.md).

## Known broken / WIP

- Neil on Wispbyte will not start until the setup in [HOSTING.md](HOSTING.md) §3 is done.
- Manual checks open (red): [TEST-RUN.md](TEST-RUN.md) 2b–6h, slice 005 T024, and the manual-check tasks of 006–012.
- Slice 011, C3 (hiding Officer commands from Members) is left open.

## Open questions

- REAPER (slice in Later): open questions in [#35](https://github.com/LilSticky/Neil/issues/35).
- Wispbyte's disk persistence: answered yes in slice 001.

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
