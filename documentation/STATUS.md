# Status

Where work stands right now. Updated in every change (constitution, principle VI).
Plan: [ROADMAP.md](ROADMAP.md) · Decisions: [adr/](adr/README.md) · Language: [DICTIONARY.md](DICTIONARY.md) ·
Game API: [GAME-API.md](GAME-API.md) · Hosting: [HOSTING.md](HOSTING.md) · Server setup: [SERVER-SETUP.md](SERVER-SETUP.md) · Discovery: [discovery/initial.md](discovery/initial.md) ·
Issues: [GitHub](https://github.com/LilSticky/Neil/issues)

## Current slice

Slice 015, Daily Allowance (`../Neil-015`, [specs](../specs/015-look-up-within-a-daily-allowance/)): resumed on
2026-11-05 on the user's word, with `main` merged in. Spec and plan are done, tasks are next. `/reaper` is not charged
(the user's decision). It takes migration 13 and ADR 10.

Slice 017, Give Members the Doctor Role ([specs](../specs/017-give-members-the-doctor-role/), issue
[#47](https://github.com/LilSticky/Neil/issues/47)): every Linked Member, Guests included, holds the Doctor Role, and
SERVER-SETUP.md step 8c sets out Home Kingdom and Shared information. Merged to `main` with T001–T010 done. **Merged red:**
the manual check ([TEST-RUN.md](TEST-RUN.md) §6l, T011) has not been run, so Definition of Done 2 is open.

Slice 016, Choose your channels ([specs](../specs/016-choose-your-channels/), issue
[#42](https://github.com/LilSticky/Neil/issues/42)): after the Link, a Preferences message (Languages, Region, Interests,
Experience) gives Preference Roles that show the matching channels; `/channels` shows it again. Merged to `main` with
T001–T014 done (review and audit in the spec folder). **Merged red:** the manual check ([TEST-RUN.md](TEST-RUN.md) §6k,
T015) was not run, on the user's word, so Definition of Done 2 is open. Migration 12.

Slice 014, Find the closest Exile (REAPER) ([specs](../specs/014-find-the-closest-exile/), [#35](https://github.com/LilSticky/Neil/issues/35)),
merged to `main` as #44: `/reaper add|remove` for Home Kingdom R5s, `/reaper closest|list` for any
Member. T001–T013 done (review and audit in the spec folder, ADR 9 for its personal data); the manual check T014
(TEST-RUN.md §6j) is open.

Slice 013, Keep newcomers in onboarding ([specs](../specs/013-keep-newcomers-in-onboarding/)): the Onboarding Role
(given on join and Unlink, taken off at Link, put right at startup) and deletion of finished Interview threads. Merged
to `main` and deployed; the manual check ([TEST-RUN.md](TEST-RUN.md) §6i, task T012) is open.

Earlier: slices 001–012 are done; their manual checks were run by the user on 2026-11-03. Slice 005's T033 and T034 are closed too: their findings were checked against the code on 2026-11-04.

**Next step:** `/speckit-tasks` for slice 015 in `../Neil-015`. Meanwhile, for the user: click Restart in the Wispbyte panel once CI has deployed `main`, then run
`npm run commands:register` (`/reaper` and `/channels` are new). After the restart, check that Linked Members hold
`Doctor`, and only then set up the channels ([SERVER-SETUP.md](SERVER-SETUP.md) steps 8, 8b, 8c and 9). Then TEST-RUN.md
§6i, §6j, §6k and §6l.

## Known broken / WIP

- Manual checks open: slice 013 (T012, TEST-RUN.md §6i), slice 014 (T014, §6j), slice 016 (T015, §6k, not run), slice 017 (T011, §6l, not run).
- Slice 016: at Unlink, a Preferences thread that cannot be deleted is only logged and stays (review.md, second pass).
- Slice 014: Neil cannot see shields (`shielding` always 0); `/reaper closest` says so in every answer.
- Until the channel permissions are set, newcomers still see every channel (the role is given, but nothing hides the rest).
- Officer commands are now hidden from Members (slice 011 C3 fixed). After deploying, run `npm run commands:register`
  and do the Integrations step in [HOSTING.md](HOSTING.md) (allow Moderator and King, limit to the moderator channel).

## Open questions

- Wispbyte's disk persistence: answered yes in slice 001.

## Standing notes

- Sessions wrap up before the plan limit: `.claude/hooks/usage-guard.mjs` tells a session once, at 95% of the
  5-hour or 7-day usage (`NEIL_USAGE_WRAP_UP`), to commit, update STATUS, push and stop.
- The Game API's limit is a daily quota (2,000/UTC day on our patron key), not a per-second limit; see ADR 4. The key is
  `LAP_TRACKER_API_KEY` in `.env` (git-ignored; template in `env.example`). Code uses only the endpoints
  verified in [GAME-API.md](GAME-API.md).
