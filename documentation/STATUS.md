# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

Slice 003 "Look up players within the daily quota" is in progress on branch `003-look-up-players-within-the-daily-quota`: [spec](../specs/003-look-up-players-within-the-daily-quota/spec.md) written and clarified with the user (Officer = Moderator or King; no shares or Quota Reserve yet, the reserve comes with slice 004; cards show "as of"). T001–T030 done: cache, persisted Daily Quota with a hard stop (also after a 429 and across restarts), retries on 503/504, `/quota` for Officers; reviewed by `bot-reviewer` and `spec-auditor`. Slice 002 "Look up a player" is done (PR #6): any Member runs `/player` by uid and `/alliance` by kingdom and tag, checked on the test server and on Wispbyte ([tasks.md](../specs/002-look-up-a-player/tasks.md)). Slice 001 "Greet the test server" is done (PRs #2, #3): Neil runs on Wispbyte from a green
`main` through the `deploy` branch, answers `/ping` on the test server, and its data folder survives
restarts and redeploys (ADR 5 stands). Details: [tasks.md](../specs/001-greet-the-test-server/tasks.md),
[HOSTING.md](HOSTING.md). Neil is the only bot application; local runs need Wispbyte stopped.

**Next step:** T031, the manual test-server check ([quickstart](../specs/003-look-up-players-within-the-daily-quota/quickstart.md#on-the-test-server)). Needs the user to put the test server's `DISCORD_MODERATOR_ROLE_ID` and `DISCORD_KING_ROLE_ID` in `.env` (Neil refuses to start without them).

## Known broken / WIP

- Until slice 003 is merged, `main` has no cache or quota counter (constitution IV exception from slice 002): slice 003 must land before Neil joins the production server.
- The Wispbyte panel needs `DISCORD_MODERATOR_ROLE_ID` and `DISCORD_KING_ROLE_ID` before slice 003 is merged, or the deployed Neil will refuse to start (T033).

## Open questions

See [discovery/initial.md](discovery/initial.md#open-questions): which Discord roles exist and which Neil
may manage (needed by slice 005); (Wispbyte's disk persistence: answered yes in slice 001.)

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
