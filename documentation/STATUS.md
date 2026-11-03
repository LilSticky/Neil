# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

None in progress. Slices 001–012 are done: on `main`, deployed to Wispbyte, and the manual checks
([TEST-RUN.md](TEST-RUN.md), and the manual-check tasks of 005–012) were run by the user on 2026-11-03.

**Next step:** pick the next slice with the user. The only candidate is REAPER (ROADMAP, Later), which
waits on the open questions in [#35](https://github.com/LilSticky/Neil/issues/35).

## Known broken / WIP

- Slice 011, C3 (hiding Officer commands from Members) is left open.
- Slice 005: T033 (`bot-reviewer` on the Phase 9–10 diff) and T034 (`spec-auditor` against FR-021–FR-027) are unticked.

## Open questions

- REAPER (slice in Later): open questions in [#35](https://github.com/LilSticky/Neil/issues/35).
- Wispbyte's disk persistence: answered yes in slice 001.

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
