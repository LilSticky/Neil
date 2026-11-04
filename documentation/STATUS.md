# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Server setup: [SERVER-SETUP.md](SERVER-SETUP.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

Slice 016, Choose your channels ([specs](../specs/016-choose-your-channels/); branch `016-choose-your-channels`, issue
[#42](https://github.com/LilSticky/Neil/issues/42)): after the Link, a Preferences message (Languages, Region, Interests,
Experience) gives Preference Roles that show the matching channels; `/channels` shows it again. T001–T012 are
done; the reviews (T013, T014) are being closed; the manual check ([TEST-RUN.md](TEST-RUN.md) §6k, T015) comes later.
Migration 12.

Slice 014, Find the closest Exile (REAPER) ([specs](../specs/014-find-the-closest-exile/), [#35](https://github.com/LilSticky/Neil/issues/35)),
merged to `main` as #44: `/reaper add|remove` for Home Kingdom R5s, `/reaper closest|list` for any
Member. T001–T013 done (review and audit in the spec folder, ADR 9 for its personal data); the manual check T014
(TEST-RUN.md §6j) is open.

Slice 015, Daily Allowance (`../Neil-015`): spec only, parked, not in this release. It takes migration 13 and changes
the lookup signature `/reaper` uses, so it merges `main` before it continues.

Slice 013, Keep newcomers in onboarding ([specs](../specs/013-keep-newcomers-in-onboarding/)): the Onboarding Role
(given on join and Unlink, taken off at Link, put right at startup) and deletion of finished Interview threads. Merged
to `main` and deployed; the manual check ([TEST-RUN.md](TEST-RUN.md) §6i, task T012) is open.

Earlier: slices 001–012 are done; their manual checks were run by the user on 2026-11-03.

**Next step:** for the user: after the slice 014 deploy, `npm run commands:register`, then TEST-RUN.md §6j. For the user: the slice 013 channel permissions from
[HOSTING.md](HOSTING.md) and TEST-RUN.md §6i.

## Known broken / WIP

- Slice 013 manual check open (T012, TEST-RUN.md §6i).
- Slice 014: Neil cannot see shields (`shielding` always 0); `/reaper closest` says so in every answer.
- Until the channel permissions are set, newcomers still see every channel (the role is given, but nothing hides the rest).
- Officer commands are now hidden from Members (slice 011 C3 fixed). After deploying, run `npm run commands:register`
  and do the Integrations step in [HOSTING.md](HOSTING.md) (allow Moderator and King, limit to the moderator channel).
- Slice 005: T033 (`bot-reviewer` on the Phase 9–10 diff) and T034 (`spec-auditor` against FR-021–FR-027) are unticked.

## Open questions

- Wispbyte's disk persistence: answered yes in slice 001.

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
