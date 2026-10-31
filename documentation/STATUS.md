# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

Slice 005 "Interview a new member" is implemented on branch `005-interview-a-new-member` (issue #15): a joiner gets a private
Onboarding Interview thread, gives a uid, confirms the Player and is Linked; unknown ranks go to the Alliance's R5 (Rank Approval);
`/interview`, timeouts, leaving and the Daily Quota pause are handled. All automated tasks are green. The user chose automated
tests only for now; the manual run is prepared in [TEST-RUN.md](TEST-RUN.md) (T024 deferred). Setup: [HOSTING.md](HOSTING.md) §3.

**Next step:** the slice's pull request stays **open, not merged**, because Wispbyte pulls `deploy` on every start and
Neil would not start there without the setup. The user does the setup (switch on Server Members Intent in the Developer Portal, create `#onboarding` and
`#neil-log` with the permissions in HOSTING.md, set `DISCORD_ONBOARDING_CHANNEL_ID`, `DISCORD_LOG_CHANNEL_ID` and optionally
`INTERVIEW_TIMEOUT_MINUTES` in `.env` and on Wispbyte, run `npm run commands:register`) and walks [TEST-RUN.md](TEST-RUN.md).
Claude then merges the pull request, turns the feedback into issues and asks for a Wispbyte restart. Slice 006 "Give a member their name and roles" follows.

**Known broken / WIP:** once slice 005 is on `main`, Neil on Wispbyte will not start until Server Members Intent is on
and the two channel IDs are set there (Neil refuses the configuration or cannot log in). That is why the merge waits.

Earlier: slice 004 "Find a player by name or alliance" is merged (PR #14, closes #13): `/player` by name with a private pick list, `/alliance` by full name with the Alliance Roster and a paged member menu, lookups stop at the Quota Reserve (100), `/quota` shows it. Bot-reviewed ([review.md](../specs/004-find-a-player-by-name-or-alliance/review.md)), spec-audited and checked on the test server (T026). Slice 003 "Look up players within the daily quota" is merged (PR #9, closes #8): cache, persisted Daily Quota with a hard stop (also after a 429 and across restarts), retries on 503/504, `/quota` for Officers; reviewed, audited, and checked on the test server (T031) and on Wispbyte with the new role IDs set (T033, 2026-10-30). Slice 002 "Look up a player" is done (PR #6): any Member runs `/player` by uid and `/alliance` by kingdom and tag, checked on the test server and on Wispbyte ([tasks.md](../specs/002-look-up-a-player/tasks.md)). Slice 001 "Greet the test server" is done (PRs #2, #3): Neil runs on Wispbyte from a green
`main` through the `deploy` branch, answers `/ping` on the test server, and its data folder survives
restarts and redeploys (ADR 5 stands). Details: [tasks.md](../specs/001-greet-the-test-server/tasks.md),
[HOSTING.md](HOSTING.md). Neil is the only bot application; local runs need Wispbyte stopped.

**Roadmap (2026-10-30):** new slice 004 "Find a player by name or alliance" (`/player` by name, `/alliance` lists members with uids, and lookups leave the Quota Reserve for Onboarding Interviews) comes before the Interview (now 005) and naming (now 006); approximate alliance-name search is in Later. The name endpoints were verified (see GAME-API.md).

## Known broken / WIP

- Slice 005 deploy: see the warning under Current slice (Server Members Intent and the two channel IDs).
- Slice 005 manual check (T024) not run yet; see [TEST-RUN.md](TEST-RUN.md).

## Open questions

See [discovery/initial.md](discovery/initial.md#open-questions): which Discord roles exist and which Neil
may manage (needed by slice 006); (Wispbyte's disk persistence: answered yes in slice 001.)

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
